import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import { createFieldsSchema, createPaginationSchema, createShapeSchema, filterFields, parseFields, toColumnarFormat } from '@mcp-z/server';
import { type CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { DRIVE_FILE_COMMON_PATTERNS, DRIVE_FILE_FIELD_DESCRIPTIONS, DRIVE_FILE_FIELDS, type DriveFile, DriveFileSchema } from '../../schemas/index.js';

const inputSchema = z.object({
  folderId: z.string().min(1).describe('Folder ID to list contents (use "root" for Drive root)'),
  fields: createFieldsSchema({
    availableFields: DRIVE_FILE_FIELDS,
    fieldDescriptions: DRIVE_FILE_FIELD_DESCRIPTIONS,
    commonPatterns: DRIVE_FILE_COMMON_PATTERNS,
    resourceName: 'Drive item',
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
  items: z.array(DriveFileSchema).describe('Files and folders in the specified folder'),
  count: z.number().describe('Number of items in this page'),
  folderId: z.string().describe('ID of the folder that was listed'),
  nextPageToken: z.string().optional().describe('Token for fetching next page of results'),
});

const successArraysBranchSchema = z.object({
  type: z.literal('success'),
  shape: z.literal('arrays'),
  columns: z.array(z.string()).describe('Column names in canonical order'),
  rows: z.array(z.array(z.unknown())).describe('Row data matching column order'),
  count: z.number().describe('Number of items in this page'),
  folderId: z.string().describe('ID of the folder that was listed'),
  nextPageToken: z.string().optional().describe('Token for fetching next page of results'),
});

// Output schema with auth_required support
// Using z.union instead of discriminatedUnion since we have two success branches with different shapes
const outputSchema = z.union([successObjectsBranchSchema, successArraysBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'List Folder Contents',
  description: 'List files and folders in a specific folder with field selection.',
  inputSchema: inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

// Type for the raw Google Drive API response
type DriveItem = {
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

type DriveResponse = {
  files?: DriveItem[];
  nextPageToken?: string;
};

async function handler({ folderId, pageSize = 50, pageToken, fields, shape = 'arrays' }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;

  const requestedFields = parseFields(fields, DRIVE_FILE_FIELDS);

  logger.info('drive.folder.contents called', {
    folderId,
    pageSize,
    pageToken: pageToken ? '[provided]' : undefined,
    fields: fields || 'all',
  });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    const qStr = `'${folderId}' in parents and trashed = false`;

    const listOptions: {
      q: string;
      pageSize: number;
      fields: string;
      orderBy: string;
      pageToken?: string;
    } = {
      q: qStr,
      pageSize: Math.min(1000, pageSize),
      fields: 'files(id,name,mimeType,webViewLink,modifiedTime,parents,shared,starred,owners),nextPageToken',
      orderBy: 'folder,name', // Folders first, then by name
    };
    if (pageToken && pageToken.trim().length > 0) {
      listOptions.pageToken = pageToken;
    }

    const response = await drive.files.list(listOptions);

    const res = response.data as DriveResponse;
    const items = Array.isArray(res?.files) ? res.files : [];

    const parentIds = new Set<string>();
    for (const f of items) {
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

    const driveFiles: DriveFile[] = items.map((f: DriveItem) => {
      const id = f?.id ? String(f.id) : 'unknown';
      const name = f?.name || id;
      const result: DriveFile = { id, name };

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

      return result;
    });

    const filteredItems = driveFiles.map((item) => filterFields(item, requestedFields));

    logger.info('drive.folder.contents returning', {
      folderId,
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
            folderId,
            ...(nextPageToken && { nextPageToken }),
          }
        : {
            type: 'success' as const,
            shape: 'objects' as const,
            items: filteredItems,
            count: filteredItems.length,
            folderId,
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
    logger.error('drive.folder.contents error', { error: message });

    // Throw McpError
    throw new McpError(ErrorCode.InternalError, `Error listing folder contents: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'folder-contents' as const,
    config,
    handler,
  };
}
