import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import { type CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { z } from 'zod';

const MAX_BATCH_SIZE = 1000;

const inputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BATCH_SIZE).describe('File IDs to soft delete (move to trash)'),
});

// Success branch schema
const successBranchSchema = z.object({
  type: z.literal('success'),
  operationSummary: z.string().describe('Human-readable summary of the operation'),
  totalCount: z.number().describe('Total number of files requested to trash'),
  successCount: z.number().describe('Number of files successfully moved to trash'),
  failureCount: z.number().describe('Number of files that failed to move'),
  recoverable: z.boolean().describe('Whether trashed files can be restored'),
  recoverableDays: z.number().describe('Days until permanent deletion'),
  failures: z
    .array(
      z.object({
        id: z.string().describe('ID of the file that failed'),
        error: z.string().describe('Error message explaining the failure'),
      })
    )
    .optional()
    .describe('Details of any files that failed to trash'),
});

// Output schema with auth_required support
const outputSchema = z.discriminatedUnion('type', [successBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'Move Files to Trash',
  description: 'Move files to trash (recoverable for 30 days).',
  inputSchema: inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

async function handler({ ids }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;
  logger.info('drive.file.moveToTrash called', { count: ids.length });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    const results = await Promise.allSettled(
      ids.map(async (id) => {
        await drive.files.update({
          fileId: id,
          requestBody: { trashed: true },
        });
        return id;
      })
    );

    // Separate successes and failures
    const failures: Array<{ id: string; error: string }> = [];

    results.forEach((result, index) => {
      const id = ids[index];
      if (!id) return;

      if (result.status === 'rejected') {
        const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failures.push({ id, error: errorMessage });
      }
    });

    const successCount = ids.length - failures.length;
    const failureCount = failures.length;
    const totalCount = ids.length;

    logger.info('drive.file.moveToTrash completed', {
      totalCount,
      successCount,
      failureCount,
    });

    const operationSummary = failureCount === 0 ? `Moved ${successCount} file${successCount === 1 ? '' : 's'} to trash (recoverable for 30 days)` : `Moved ${successCount} of ${totalCount} file${totalCount === 1 ? '' : 's'} to trash (${failureCount} failed, recoverable for 30 days)`;

    const result: Output = {
      type: 'success' as const,
      operationSummary,
      totalCount,
      successCount,
      failureCount,
      recoverable: true,
      recoverableDays: 30,
      ...(failures.length > 0 && { failures }),
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
    logger.error('drive.file.moveToTrash error', { error: message });

    // Throw McpError
    throw new McpError(ErrorCode.InternalError, `Error moving files to trash: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'file-move-to-trash' as const,
    config,
    handler,
  };
}
