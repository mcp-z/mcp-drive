import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import { createFieldsSchema, createPaginationSchema, createShapeSchema, filterFields, parseFields, toColumnarFormat } from '@mcp-z/server';
import { type CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type drive_v3, google } from 'googleapis';
import { z } from 'zod';
import { toDriveQuery } from '../../lib/query-builder.js';
import { DRIVE_FILE_COMMON_PATTERNS, DRIVE_FILE_FIELD_DESCRIPTIONS, DRIVE_FILE_FIELDS, type DriveFile, DriveFileSchema, DriveQuerySchema } from '../../schemas/index.js';

const inputSchema = z.object({
  query: DriveQuerySchema.describe('Drive query object with structured search fields. See DriveQuerySchema for detailed query syntax and examples.'),
  fields: createFieldsSchema({
    availableFields: DRIVE_FILE_FIELDS,
    fieldDescriptions: DRIVE_FILE_FIELD_DESCRIPTIONS,
    commonPatterns: DRIVE_FILE_COMMON_PATTERNS,
    resourceName: 'Drive file',
  }),
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
  items: z.array(DriveFileSchema).describe('Matching Drive files'),
  count: z.number().describe('Number of files in this page'),
  nextPageToken: z.string().optional().describe('Token for fetching next page of results'),
});

const successArraysBranchSchema = z.object({
  type: z.literal('success'),
  shape: z.literal('arrays'),
  columns: z.array(z.string()).describe('Column names in canonical order'),
  rows: z.array(z.array(z.unknown())).describe('Row data matching column order'),
  count: z.number().describe('Number of files in this page'),
  nextPageToken: z.string().optional().describe('Token for fetching next page of results'),
});

// Output schema with auth_required support
// Using z.union instead of discriminatedUnion since we have two success branches with different shapes
const outputSchema = z.union([successObjectsBranchSchema, successArraysBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'Search Drive Files',
  description: 'Search Google Drive files with flexible field selection for optimal performance.',
  inputSchema: inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

// Type for the raw Google Drive API response
type driveFile = drive_v3.Schema$File;

type driveResponse = drive_v3.Schema$FileList;

async function handler({ query, pageSize = 50, pageToken, fields, shape = 'arrays' }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;

  const requestedFields = parseFields(fields, DRIVE_FILE_FIELDS);

  // Validate and clamp pageSize to Google Drive API limits (1-1000)
  const validPageSize = Math.max(1, Math.min(1000, Math.floor(pageSize || 50)));

  logger.info('drive.files-search called', {
    query,
    pageSize: validPageSize,
    pageToken: pageToken ? '[provided]' : undefined,
    fields: fields || 'all',
  });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    // Handle query parameter
    let qStr: string;
    if (typeof query === 'string') {
      // String query - treat as raw Drive query
      qStr = `(${query}) and trashed = false`;
    } else if (query && typeof query === 'object' && 'rawDriveQuery' in query && query.rawDriveQuery) {
      // Object with rawDriveQuery field - use it directly
      qStr = `(${query.rawDriveQuery}) and trashed = false`;
    } else {
      // Structured query object - convert to Drive query string
      const { q } = toDriveQuery(query);
      qStr = q ? `(${q}) and trashed = false` : 'trashed = false';
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
    const res = response.data as driveResponse;
    const files = Array.isArray(res?.files) ? res.files : [];

    const parentIds = new Set<string>();
    for (const f of files) {
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

    const items: DriveFile[] = files.map((f: driveFile) => {
      const id = f?.id ? String(f.id) : 'unknown';
      const name = f?.name || id;
      const result: DriveFile = { id, name };

      // Only include properties that have actual values
      if (f?.mimeType) result.mimeType = f.mimeType;
      if (f?.webViewLink) result.webViewLink = f.webViewLink;
      if (f?.modifiedTime) result.modifiedTime = f.modifiedTime;

      if (f?.parents && f.parents.length > 0) {
        result.parents = f.parents.map((parentId) => {
          if (parentId === 'root') {
            return { id: 'root', name: 'My Drive' };
          }
          const parentName = parentNameMap.get(parentId) || parentId;
          return { id: parentId, name: parentName };
        });
      }

      if (f?.shared != null) result.shared = f.shared;
      if (f?.starred != null) result.starred = f.starred;

      if (f?.owners && f.owners.length > 0) {
        result.owners = f.owners.map((o) => {
          const owner: NonNullable<DriveFile['owners']>[number] = {};
          if (o?.displayName) owner.displayName = o.displayName;
          if (o?.emailAddress) owner.emailAddress = o.emailAddress;
          if (o?.kind) owner.kind = o.kind;
          if (o?.me != null) owner.me = o.me;
          if (o?.permissionId) owner.permissionId = o.permissionId;
          if (o?.photoLink) owner.photoLink = o.photoLink;
          return owner;
        });
      }

      return result;
    });

    const filteredItems = items.map((item) => filterFields(item, requestedFields));

    logger.info('drive.files-search returning', {
      query,
      pageSize,
      resultCount: filteredItems.length,
      fields: fields || 'all',
    });

    const nextPageToken = res.nextPageToken && res.nextPageToken.trim().length > 0 ? res.nextPageToken : undefined;

    // Build result based on shape
    const result: Output =
      shape === 'arrays'
        ? {
            type: 'success' as const,
            shape: 'arrays' as const,
            ...toColumnarFormat(filteredItems, requestedFields, DRIVE_FILE_FIELDS),
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
    logger.error('drive.files-search error', { error: message });

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
    throw new McpError(ErrorCode.InternalError, `Error searching files: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'files-search' as const,
    config,
    handler,
  };
}
