import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import { type CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { drive_v3 } from 'googleapis';
import { google } from 'googleapis';
import { z } from 'zod';
import type { Logger } from '../../types.js';

const inputSchema = z.object({
  folderId: z.string().min(1).describe('Folder ID to get path for (or "root")'),
});

// Success branch schema - uses items: for consistency with standard vocabulary
const successBranchSchema = z.object({
  type: z.literal('success'),
  path: z.string().describe('Full path from root (e.g., /Work/Projects/2024)'),
  items: z
    .array(
      z.object({
        id: z.string().describe('Folder ID'),
        name: z.string().describe('Folder name'),
      })
    )
    .describe('Path items from root to target folder'),
});

// Output schema with auth_required support
const outputSchema = z.discriminatedUnion('type', [successBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'Get Folder Path',
  description: 'Get full path from folder to root. Returns human-readable path and items with IDs.',
  inputSchema: inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

/**
 * Resolves the full path for a folder by walking up the parent chain.
 * Returns both the path string and structured segments with IDs and names.
 */
async function resolveFolderPath(drive: drive_v3.Drive, folderId: string, logger: Logger): Promise<{ path: string; segments: Array<{ id: string; name: string }> }> {
  // Handle root specially
  if (folderId === 'root') {
    return {
      path: '/',
      segments: [{ id: 'root', name: 'My Drive' }],
    };
  }

  const segments: Array<{ id: string; name: string }> = [];
  let currentId = folderId;
  const visited = new Set<string>();

  // Walk up the parent chain
  while (currentId && currentId !== 'root') {
    // Prevent infinite loops
    if (visited.has(currentId)) {
      logger.info('Circular folder reference detected', {
        folderId: currentId,
      });
      break;
    }
    visited.add(currentId);

    // Fetch folder metadata
    try {
      const response = await drive.files.get({
        fileId: currentId,
        fields: 'id,name,parents',
      });

      const id = response.data.id as string;
      const name = (response.data.name as string) || id;
      const parents = response.data.parents as string[] | undefined;

      // Add to segments at beginning (we're walking from child to root)
      segments.unshift({ id, name });

      // Move to parent
      currentId = (parents && parents.length > 0 ? parents[0] : '') || '';
    } catch (e) {
      logger.info('Failed to resolve folder path', {
        folderId: currentId,
        error: e,
      });
      break;
    }
  }

  // Add root if we reached it
  if (currentId === 'root') {
    segments.unshift({ id: 'root', name: 'My Drive' });
  }

  // Build path string
  const pathParts = segments.slice(1).map((seg) => seg.name); // Skip root
  const path = pathParts.length > 0 ? `/${pathParts.join('/')}` : '/';

  return { path, segments };
}

async function handler({ folderId }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;
  logger.info('drive.folder.path called', { folderId });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    const pathResult = await resolveFolderPath(drive, folderId, logger);

    logger.info('drive.folder.path returning', {
      path: pathResult.path,
      segmentCount: pathResult.segments.length,
    });

    const result: Output = {
      type: 'success' as const,
      path: pathResult.path,
      items: pathResult.segments,
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
    logger.error('drive.folder.path error', { error: message });

    // Throw McpError
    throw new McpError(ErrorCode.InternalError, `Error getting folder path: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'folder-path' as const,
    config,
    handler,
  };
}
