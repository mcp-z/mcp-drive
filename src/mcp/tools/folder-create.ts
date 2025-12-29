import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { z } from 'zod';

const inputSchema = z.object({
  name: z.string().trim().min(1).describe('Name for the new folder'),
  parentId: z.string().optional().describe('Parent folder ID (omit to create in My Drive root)'),
});

// Success branch schema
const successBranchSchema = z.object({
  type: z.literal('success'),
  operationSummary: z.string().describe('Summary of the folder creation operation'),
  itemsProcessed: z.number().describe('Total items attempted (always 1 for single folder)'),
  itemsChanged: z.number().describe('Successfully created folders (always 1 on success)'),
  completedAt: z.string().describe('ISO datetime when operation completed'),
  id: z.string().describe('ID of the created folder'),
  name: z.string().describe('Name of the created folder'),
  webViewLink: z.string().describe('URL to view the folder in Drive'),
  parentId: z.string().optional().describe('ID of the parent folder'),
  parentName: z.string().optional().describe('Name of the parent folder'),
});

// Output schema with auth_required support
const outputSchema = z.discriminatedUnion('type', [successBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'Create Folder',
  description: 'Create a new folder in Google Drive. Returns folder ID for use in other operations.',
  inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

// Export types for strong typing in tests
export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

async function handler({ name: folderName, parentId }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;
  logger.info('drive.folder.create called', {
    name: folderName,
    parentId: parentId || 'root',
  });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    // Folder MIME type constant (consistent with folder-search.ts)
    const folderMimeType = 'application/vnd.google-apps.folder';

    // Create the folder
    const response = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: folderMimeType,
        parents: parentId ? [parentId] : null,
      },
      fields: 'id,name,webViewLink,parents',
    });

    const res = response.data;
    const id = res.id ?? '';
    const name = res.name ?? folderName;
    const webViewLink = res.webViewLink ?? '';
    const parents = (res.parents as string[] | undefined) || [];

    // Fetch parent name if parentId was provided
    let parentName: string | undefined;
    let actualParentId: string | undefined;

    if (parents.length > 0) {
      actualParentId = parents[0];

      if (actualParentId === 'root') {
        parentName = 'My Drive';
      } else if (actualParentId) {
        try {
          const parentResponse = await drive.files.get({
            fileId: actualParentId,
            fields: 'name',
          });
          parentName = (parentResponse.data.name as string | undefined) || actualParentId;
        } catch (e) {
          logger.info('Failed to fetch parent name', {
            parentId: actualParentId,
            error: e,
          });
          parentName = actualParentId; // Fallback to ID
        }
      }
    }

    const locationSummary = parentName ? ` in "${parentName}"` : ' in My Drive';

    logger.info('drive.folder.create success', {
      id,
      name,
      parentId: actualParentId,
    });

    // Build result object with operation metadata
    const result: Output = {
      type: 'success' as const,
      operationSummary: `Created folder "${name}"${locationSummary}`,
      itemsProcessed: 1,
      itemsChanged: 1,
      completedAt: new Date().toISOString(),
      id,
      name,
      webViewLink,
      ...(actualParentId && { parentId: actualParentId }),
      ...(parentName && { parentName }),
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
    logger.error('drive.folder.create error', { error: message });

    // Throw McpError for proper MCP error handling
    throw new McpError(ErrorCode.InternalError, `Error creating folder: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'folder-create' as const,
    config,
    handler,
  };
}
