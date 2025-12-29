import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import { createFieldsSchema, createPaginationSchema, createShapeSchema, filterFields, parseFields, toColumnarFormat } from '@mcp-z/server';
import { type CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { drive_v3 } from 'googleapis';
import { google } from 'googleapis';
import { z } from 'zod';
import { toDriveQuery } from '../../lib/query-builder.js';
import { DRIVE_FILE_COMMON_PATTERNS, DRIVE_FILE_FIELD_DESCRIPTIONS, DRIVE_FILE_FIELDS, type DriveFile, DriveFileSchema, DriveQuerySchema } from '../../schemas/index.js';
import type { Logger } from '../../types.js';

const inputSchema = z.object({
  query: DriveQuerySchema.optional().describe('Drive query object with structured search fields. See DriveQuerySchema for detailed query syntax and examples.'),
  fields: createFieldsSchema({
    availableFields: [...DRIVE_FILE_FIELDS, 'path'] as const,
    fieldDescriptions: {
      ...DRIVE_FILE_FIELD_DESCRIPTIONS,
      path: 'Full folder path like /Work/Projects (requires resolvePaths=true)',
    },
    commonPatterns: DRIVE_FILE_COMMON_PATTERNS,
    resourceName: 'Drive folder',
  }),
  resolvePaths: z.boolean().optional().describe('Resolve full folder paths like /Work/Projects/2024 (requires additional API calls per result)'),
  ...createPaginationSchema({
    defaultPageSize: 50,
    maxPageSize: 1000,
    provider: 'drive',
  }).shape,
  shape: createShapeSchema(),
});

// Success branch schemas for different shapes
const successObjectsBranchSchema = z.object({
  type: z.literal('success'),
  shape: z.literal('objects'),
  items: z.array(DriveFileSchema.extend({ path: z.string().optional().describe('Full folder path (if resolvePaths=true)') })).describe('Matching Drive folders'),
  count: z.number().describe('Number of folders in this page'),
  nextPageToken: z.string().optional().describe('Token for fetching next page of results'),
});

const successArraysBranchSchema = z.object({
  type: z.literal('success'),
  shape: z.literal('arrays'),
  columns: z.array(z.string()).describe('Column names in canonical order'),
  rows: z.array(z.array(z.unknown())).describe('Row data matching column order'),
  count: z.number().describe('Number of folders in this page'),
  nextPageToken: z.string().optional().describe('Token for fetching next page of results'),
});

// Output schema with auth_required support
// Using z.union instead of discriminatedUnion since we have two success branches with different shapes
const outputSchema = z.union([successObjectsBranchSchema, successArraysBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'Search Folders',
  description: 'Search Google Drive folders with flexible field selection and optional path resolution.',
  inputSchema: inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

// Type for the raw Google Drive API response
type DriveFolder = {
  id?: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  parents?: string[];
  shared?: boolean;
  starred?: boolean;
  owners?: Array<{
    displayName?: string;
    emailAddress?: string;
    kind?: string;
    me?: boolean;
    permissionId?: string;
    photoLink?: string;
  }>;
};

type DriveFolderResponse = {
  files?: DriveFolder[];
  nextPageToken?: string;
};

/**
 * Resolves the full path for a folder by walking up the parent chain
 * Caches folder names to reduce redundant API calls
 */
async function resolveFolderPath(drive: drive_v3.Drive, folderId: string, folderCache: Map<string, string>, logger: Logger): Promise<string> {
  if (folderId === 'root') return '/';

  const pathParts: string[] = [];
  let currentId = folderId;
  const visited = new Set<string>();

  while (currentId && currentId !== 'root') {
    // Prevent infinite loops
    if (visited.has(currentId)) {
      logger.info('Circular folder reference detected', {
        folderId: currentId,
      });
      break;
    }
    visited.add(currentId);

    // Check cache first
    if (folderCache.has(currentId)) {
      const cachedName = folderCache.get(currentId);
      if (cachedName) {
        pathParts.unshift(cachedName);
      }

      // Get parent of cached folder
      try {
        const response = await drive.files.get({
          fileId: currentId,
          fields: 'parents',
        });
        const parents = response.data.parents as string[] | undefined;
        currentId = (parents && parents.length > 0 ? parents[0] : '') || '';
      } catch (_e) {
        logger.info('Failed to get parent for cached folder', {
          folderId: currentId,
        });
        break;
      }
    } else {
      // Fetch folder metadata
      try {
        const response = await drive.files.get({
          fileId: currentId,
          fields: 'name,parents',
        });
        const folderName = response.data.name as string | undefined;
        const parents = response.data.parents as string[] | undefined;

        if (folderName) {
          folderCache.set(currentId, folderName);
          pathParts.unshift(folderName);
        }

        currentId = (parents && parents.length > 0 ? parents[0] : '') || '';
      } catch (e) {
        logger.info('Failed to resolve folder path', {
          folderId: currentId,
          error: e,
        });
        break;
      }
    }
  }

  return `/${pathParts.join('/')}`;
}

async function handler({ query, resolvePaths = false, pageSize = 50, pageToken, fields, shape = 'arrays' }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;

  const requestedFields = parseFields(fields, [...DRIVE_FILE_FIELDS, 'path'] as const);

  // Validate and clamp pageSize to Google Drive API limits (1-1000)
  const validPageSize = Math.max(1, Math.min(1000, Math.floor(pageSize || 50)));

  logger.info('drive.folder.search called', {
    query,
    resolvePaths,
    pageSize: validPageSize,
    pageToken: pageToken ? '[provided]' : undefined,
    fields: fields || 'all',
  });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    const folderMimeType = 'application/vnd.google-apps.folder';
    let qStr: string;

    if (typeof query === 'string') {
      // String query - treat as raw Drive query
      qStr = `(${query}) and mimeType='${folderMimeType}' and trashed = false`;
    } else if (query && typeof query === 'object' && 'rawDriveQuery' in query && query.rawDriveQuery) {
      // Object with rawDriveQuery field - use it directly
      qStr = `(${query.rawDriveQuery}) and mimeType='${folderMimeType}' and trashed = false`;
    } else if (query) {
      // Structured query object - convert to Drive query string
      const { q } = toDriveQuery(query);
      qStr = q ? `(${q}) and mimeType='${folderMimeType}' and trashed = false` : `mimeType='${folderMimeType}' and trashed = false`;
    } else {
      // No query - return all folders
      qStr = `mimeType='${folderMimeType}' and trashed = false`;
    }

    const listOptions: {
      q: string;
      pageSize: number;
      fields: string;
      orderBy: string;
      pageToken?: string;
    } = {
      q: qStr,
      pageSize: validPageSize,
      fields: 'files(id,name,mimeType,webViewLink,modifiedTime,parents,shared,starred,owners),nextPageToken',
      orderBy: 'modifiedTime desc',
    };
    if (pageToken && pageToken.trim().length > 0) {
      listOptions.pageToken = pageToken;
    }

    const response = await drive.files.list(listOptions);

    const res = response.data as DriveFolderResponse;
    const folders = Array.isArray(res?.files) ? res.files : [];

    const parentIds = new Set<string>();
    for (const f of folders) {
      if (f?.parents && f.parents.length > 0) {
        for (const parentId of f.parents) {
          if (parentId && parentId !== 'root') {
            parentIds.add(parentId);
          }
        }
      }
    }

    const parentNameMap = new Map<string, string>();
    if (parentIds.size > 0) {
      logger.info('Fetching parent names', { count: parentIds.size });
      const parentFetches = Array.from(parentIds).map(async (parentId) => {
        try {
          const parentRes = await drive.files.get({
            fileId: parentId,
            fields: 'id,name',
          });
          const parentName = (parentRes.data.name as string | undefined) || parentId;
          parentNameMap.set(parentId, parentName);
        } catch (e) {
          logger.info('Failed to fetch parent name', { parentId, error: e });
          parentNameMap.set(parentId, parentId); // Fallback to ID
        }
      });
      await Promise.all(parentFetches);
    }

    // Cache for folder names to reduce API calls during path resolution
    const folderCache = new Map<string, string>();

    const items: (DriveFile & { path?: string })[] = await Promise.all(
      folders.map(async (f: DriveFolder) => {
        const id = f?.id ? String(f.id) : 'unknown';
        const name = f?.name || id;
        const result: DriveFile & { path?: string } = { id, name };

        // Only include properties that have actual values
        if (f?.mimeType) result.mimeType = f.mimeType;
        if (f?.webViewLink) result.webViewLink = f.webViewLink;
        if (f?.modifiedTime) result.modifiedTime = f.modifiedTime;

        // Build parent objects with names
        if (f?.parents && f.parents.length > 0) {
          result.parents = f.parents.map((parentId) => {
            if (parentId === 'root') {
              return { id: 'root', name: 'My Drive' };
            }
            const parentName = parentNameMap.get(parentId) || parentId;
            return { id: parentId, name: parentName };
          });
        }

        if (f?.shared !== undefined) result.shared = f.shared;
        if (f?.starred !== undefined) result.starred = f.starred;

        if (f?.owners && f.owners.length > 0) {
          result.owners = f.owners.map((o) => {
            const owner: NonNullable<DriveFile['owners']>[number] = {};
            if (o?.displayName) owner.displayName = o.displayName;
            if (o?.emailAddress) owner.emailAddress = o.emailAddress;
            if (o?.kind) owner.kind = o.kind;
            if (o?.me !== undefined) owner.me = o.me;
            if (o?.permissionId) owner.permissionId = o.permissionId;
            if (o?.photoLink) owner.photoLink = o.photoLink;
            return owner;
          });
        }

        // Resolve path if requested
        if (resolvePaths && id !== 'unknown') {
          result.path = await resolveFolderPath(drive, id, folderCache, logger);
        }

        return result;
      })
    );

    const filteredItems = items.map((item) => filterFields(item, requestedFields));

    logger.info('drive.folder.search returning', {
      query,
      pageSize,
      resultCount: filteredItems.length,
      resolvePaths,
      fields: fields || 'all',
    });

    const nextPageToken = res.nextPageToken && res.nextPageToken.trim().length > 0 ? res.nextPageToken : undefined;

    // Build result based on shape
    const result: Output =
      shape === 'arrays'
        ? {
            type: 'success' as const,
            shape: 'arrays' as const,
            ...toColumnarFormat(filteredItems, requestedFields, [...DRIVE_FILE_FIELDS, 'path'] as const),
            count: filteredItems.length,
            ...(nextPageToken && { nextPageToken }),
          }
        : {
            type: 'success' as const,
            shape: 'objects' as const,
            items: filteredItems,
            count: filteredItems.length,
            ...(nextPageToken && { nextPageToken }),
          };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result),
        },
      ],
      structuredContent: { result },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('drive.folder.search error', { error: message });

    // Check if this is a Drive API validation error (invalid query, invalid pageToken, etc.)
    // These should return empty results rather than throw
    const isDriveValidationError = message.includes('Invalid Value') || message.includes('Invalid value') || message.includes('File not found') || message.includes('Bad Request');

    if (isDriveValidationError) {
      // Return empty result set for validation errors
      const result: Output =
        shape === 'arrays'
          ? {
              type: 'success' as const,
              shape: 'arrays' as const,
              columns: [],
              rows: [],
              count: 0,
            }
          : {
              type: 'success' as const,
              shape: 'objects' as const,
              items: [],
              count: 0,
            };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
        structuredContent: { result },
      };
    }

    // Throw McpError for other errors
    throw new McpError(ErrorCode.InternalError, `Error searching folders: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'folder-search' as const,
    config,
    handler,
  };
}
