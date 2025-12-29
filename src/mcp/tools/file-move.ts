import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import { type CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { drive_v3 } from 'googleapis';
import { google } from 'googleapis';
import { z } from 'zod';
import type { Logger } from '../../types.js';

// Type guard for Google Drive API errors
interface DriveApiError {
  message?: string;
  code?: number | string;
}

function isDriveApiError(error: unknown): error is DriveApiError {
  return typeof error === 'object' && error !== null && ('message' in error || 'code' in error);
}

// Types for results
interface MoveResult {
  fileId: string;
  fileName: string;
  oldParents: string[];
  newParent: string;
  webViewLink?: string;
}

interface FailedMove {
  fileId: string;
  error: string;
  code?: string;
}

const inputSchema = z.object({
  fileIds: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(100)]).describe('File or folder ID(s) to move. Single ID or array (max 100 for batch)'),
  destinationFolderId: z.string().min(1).describe('Destination folder ID (use "root" for My Drive root)'),
  returnOldParents: z.boolean().optional().describe('Include old parent IDs in response for manual undo (recommended: true)'),
});

// Success branch schema
const successBranchSchema = z.object({
  type: z.literal('success'),
  moved: z
    .array(
      z.object({
        fileId: z.string().describe('ID of the moved file'),
        fileName: z.string().describe('Name of the moved file'),
        oldParents: z.array(z.string()).describe('Previous parent folder IDs (for undo)'),
        newParent: z.string().describe('New parent folder ID'),
        webViewLink: z.string().optional().describe('URL to view the file'),
      })
    )
    .describe('Successfully moved files'),
  failed: z
    .array(
      z.object({
        fileId: z.string().describe('ID of the file that failed to move'),
        error: z.string().describe('Error message explaining the failure'),
        code: z.string().optional().describe('API error code if available'),
      })
    )
    .optional()
    .describe('Files that failed to move'),
  totalRequested: z.number().describe('Total number of files requested to move'),
  totalMoved: z.number().describe('Number of files successfully moved'),
  totalFailed: z.number().describe('Number of files that failed to move'),
});

// Output schema with auth_required support
const outputSchema = z.discriminatedUnion('type', [successBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'Move Files',
  description: 'Move files/folders to destination folder. Returns oldParents for undo. Use "root" for My Drive root.',
  inputSchema: inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

/**
 * Move a single file to a new parent folder
 */
async function moveSingleFile(
  drive: drive_v3.Drive,
  fileId: string,
  destinationFolderId: string,
  returnOldParents: boolean,
  logger: Logger
): Promise<{
  success: boolean;
  result?: MoveResult;
  error?: FailedMove;
}> {
  try {
    // Get current file metadata to get old parents
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'id,name,parents,webViewLink',
    });

    const oldParents = (fileMetadata.data.parents as string[] | undefined) || [];
    const fileName = (fileMetadata.data.name as string | undefined) || fileId;
    const webViewLink = fileMetadata.data.webViewLink as string | undefined;

    // Move file using addParents and removeParents
    await drive.files.update({
      fileId: fileId,
      addParents: destinationFolderId,
      removeParents: oldParents.join(','),
      fields: 'id,name,parents,webViewLink',
    });

    const result: MoveResult = {
      fileId: fileId,
      fileName: fileName,
      oldParents: returnOldParents ? oldParents : [],
      newParent: destinationFolderId,
      ...(webViewLink && { webViewLink }),
    };

    return { success: true, result };
  } catch (e: unknown) {
    const errorMessage = isDriveApiError(e) && e.message ? e.message : 'Unknown error';
    const errorCode = isDriveApiError(e) && e.code ? String(e.code) : undefined;
    logger.info('Failed to move file', { fileId, error: errorMessage });
    return {
      success: false,
      error: {
        fileId: fileId,
        error: errorMessage,
        ...(errorCode && { code: errorCode }),
      },
    };
  }
}

/**
 * Move multiple files using batch requests
 */
async function moveBatchFiles(
  drive: drive_v3.Drive,
  fileIds: string[],
  destinationFolderId: string,
  returnOldParents: boolean,
  _logger: Logger
): Promise<{
  moved: MoveResult[];
  failed: FailedMove[];
}> {
  const moved: MoveResult[] = [];
  const failed: FailedMove[] = [];

  // First, fetch metadata for all files in batch
  const metadataResults = await Promise.allSettled(
    fileIds.map(async (fileId) => {
      try {
        const response = await drive.files.get({
          fileId: fileId,
          fields: 'id,name,parents,webViewLink',
        });
        const webViewLink = response.data.webViewLink as string | undefined;
        return {
          fileId: fileId,
          name: (response.data.name as string | undefined) || fileId,
          parents: (response.data.parents as string[] | undefined) || [],
          ...(webViewLink && { webViewLink }),
        };
      } catch (e: unknown) {
        const message = isDriveApiError(e) && e.message ? e.message : String(e);
        throw new Error(`Failed to fetch metadata: ${message}`);
      }
    })
  );

  // Process metadata results
  const filesToMove: Array<{
    fileId: string;
    name: string;
    parents: string[];
    webViewLink?: string;
  }> = [];
  for (let i = 0; i < metadataResults.length; i++) {
    const result = metadataResults[i];
    if (result && result.status === 'fulfilled') {
      filesToMove.push(result.value);
    } else if (result && result.status === 'rejected') {
      const fileId = fileIds[i];
      if (fileId) {
        const errorCode = result.reason?.code ? String(result.reason.code) : undefined;
        failed.push({
          fileId: fileId,
          error: result.reason?.message || 'Failed to fetch file metadata',
          ...(errorCode && { code: errorCode }),
        });
      }
    }
  }

  // Now move files in batch
  const moveResults = await Promise.allSettled(
    filesToMove.map(async (file) => {
      try {
        await drive.files.update({
          fileId: file.fileId,
          addParents: destinationFolderId,
          removeParents: file.parents.join(','),
          fields: 'id',
        });
        return {
          fileId: file.fileId,
          fileName: file.name,
          oldParents: returnOldParents ? file.parents : [],
          newParent: destinationFolderId,
          ...(file.webViewLink && { webViewLink: file.webViewLink }),
        };
      } catch (e: unknown) {
        const message = isDriveApiError(e) && e.message ? e.message : String(e);
        throw new Error(`Failed to move: ${message}`);
      }
    })
  );

  // Process move results
  for (let i = 0; i < moveResults.length; i++) {
    const result = moveResults[i];
    if (result && result.status === 'fulfilled') {
      moved.push(result.value);
    } else if (result && result.status === 'rejected') {
      const file = filesToMove[i];
      if (file) {
        const errorCode = result.reason?.code ? String(result.reason.code) : undefined;
        failed.push({
          fileId: file.fileId,
          error: result.reason?.message || 'Failed to move file',
          ...(errorCode && { code: errorCode }),
        });
      }
    }
  }

  return { moved, failed };
}

async function handler({ fileIds, destinationFolderId, returnOldParents = true }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;
  const isBatch = Array.isArray(fileIds);
  const fileIdArray = Array.isArray(fileIds) ? fileIds : [fileIds];

  logger.info('drive.file.move called', {
    fileCount: fileIdArray.length,
    isBatch,
    destinationFolderId,
    returnOldParents,
  });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    let moved: MoveResult[] = [];
    let failed: FailedMove[] = [];

    if (isBatch && fileIdArray.length > 1) {
      // Use batch API for multiple files
      const batchResult = await moveBatchFiles(drive, fileIdArray, destinationFolderId, returnOldParents, logger);
      moved = batchResult.moved;
      failed = batchResult.failed;
    } else {
      // Single file operation
      const fileId = fileIdArray[0];
      if (fileId) {
        const singleResult = await moveSingleFile(drive, fileId, destinationFolderId, returnOldParents, logger);
        if (singleResult.success && singleResult.result) {
          moved.push(singleResult.result);
        } else if (singleResult.error) {
          failed.push(singleResult.error);
        }
      }
    }

    logger.info('drive.file.move returning', {
      totalRequested: fileIdArray.length,
      totalMoved: moved.length,
      totalFailed: failed.length,
    });

    const result: Output = {
      type: 'success' as const,
      moved,
      ...(failed.length > 0 && { failed }),
      totalRequested: fileIdArray.length,
      totalMoved: moved.length,
      totalFailed: failed.length,
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
    logger.error('drive.file.move error', { error: message });

    // Throw McpError
    throw new McpError(ErrorCode.InternalError, `Error moving files: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'file-move' as const,
    config,
    handler,
  };
}
