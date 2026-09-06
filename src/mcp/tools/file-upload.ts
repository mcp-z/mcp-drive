import type { EnrichedExtra } from '@mcp-z/oauth-google';
import { schemas } from '@mcp-z/oauth-google';

const { AuthRequiredBranchSchema } = schemas;

import type { CallToolResult } from '@mcp-z/server';
import { ProtocolError, ProtocolErrorCode } from '@mcp-z/server';
import { google } from 'googleapis';
import { z } from 'zod';
import { getFileReadStream, guessMimeType } from '../../lib/file-streaming.ts';

const inputSchema = z.object({
  sourceUri: z.string().trim().min(1).describe('File URI to upload (file://, http://, https://)'),
  name: z.string().trim().min(1).optional().describe('File name in Drive, including extension (defaults to the source file name)'),
  mimeType: z.string().trim().min(1).optional().describe('MIME type, e.g. application/pdf (defaults to the Content-Type header or detection from the file extension)'),
  parentId: z.string().optional().describe('Parent folder ID (omit to upload to My Drive root)'),
  description: z.string().optional().describe('Description to store in the file metadata'),
});

// Success branch schema
const successBranchSchema = z.object({
  type: z.literal('success'),
  operationSummary: z.string().describe('Summary of the file upload operation'),
  itemsProcessed: z.number().describe('Total items attempted (always 1 for single file)'),
  itemsChanged: z.number().describe('Successfully uploaded files (always 1 on success)'),
  completedAt: z.string().describe('ISO datetime when operation completed'),
  id: z.string().describe('ID of the uploaded file'),
  name: z.string().describe('Name of the uploaded file'),
  mimeType: z.string().describe('MIME type of the uploaded file'),
  size: z.string().describe('Size of the uploaded file in bytes'),
  webViewLink: z.string().describe('URL to view the file in Drive'),
  parentId: z.string().optional().describe('ID of the parent folder'),
  parentName: z.string().optional().describe('Name of the parent folder'),
});

// Output schema with auth_required support
const outputSchema = z.discriminatedUnion('type', [successBranchSchema, AuthRequiredBranchSchema]);

const config = {
  title: 'Upload File',
  description: 'Upload a file to Google Drive from a file:// or http(s):// URI. Content is streamed from the source (no temp files) in a single multipart request. Returns file ID for use in other operations.',
  inputSchema,
  outputSchema: z.object({
    result: outputSchema,
  }),
} as const;

// Export types for strong typing in tests
export type Input = z.infer<typeof inputSchema>;
export type Output = z.infer<typeof outputSchema>;

async function handler({ sourceUri, name, mimeType, parentId, description }: Input, extra: EnrichedExtra): Promise<CallToolResult> {
  const logger = extra.logger;
  logger.info('drive.file.upload called', {
    sourceUri,
    name: name || 'auto',
    parentId: parentId || 'root',
  });

  try {
    const drive = google.drive({ version: 'v3', auth: extra.authContext.auth });

    // Stream source content directly from URI (no temp files)
    const source = await getFileReadStream(sourceUri);
    const finalName = name || source.fileName;
    const finalMimeType = mimeType || source.contentType || guessMimeType(finalName);

    // Create the file with streamed content (multipart upload; the client pipes the
    // stream body through without buffering it into memory)
    const response = await drive.files.create({
      requestBody: {
        name: finalName,
        mimeType: finalMimeType,
        parents: parentId ? [parentId] : null,
        ...(description && { description }),
      },
      media: { mimeType: finalMimeType, body: source.stream },
      supportsAllDrives: true,
      fields: 'id,name,mimeType,size,webViewLink,parents',
    });

    const res = response.data;
    const id = res.id ?? '';
    const resultName = res.name ?? finalName;
    const resultMimeType = res.mimeType ?? finalMimeType;
    const size = res.size ?? String(source.size ?? 0);
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

    logger.info('drive.file.upload success', {
      id,
      name: resultName,
      size,
      parentId: actualParentId,
    });

    // Build result object with operation metadata
    const result: Output = {
      type: 'success' as const,
      operationSummary: `Uploaded "${resultName}"${locationSummary}`,
      itemsProcessed: 1,
      itemsChanged: 1,
      completedAt: new Date().toISOString(),
      id,
      name: resultName,
      mimeType: resultMimeType,
      size,
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
    logger.error('drive.file.upload error', { error: message });

    // Throw ProtocolError for proper MCP error handling
    throw new ProtocolError(ProtocolErrorCode.InternalError, `Error uploading file: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export default function createTool() {
  return {
    name: 'file-upload' as const,
    config,
    handler,
  };
}
