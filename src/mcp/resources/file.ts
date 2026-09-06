import { drive as driveApi } from '@googleapis/drive';
import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ReadResourceResult, ResourceConfig, ResourceModule, ServerContext } from '@mcp-z/server';
import { ResourceTemplate } from '@mcp-z/server';
import { googleAuth } from '../../lib/google-auth.ts';

export default function createResource(): ResourceModule {
  const template = new ResourceTemplate('drive://files/{fileId}', {
    list: undefined,
  });
  const config: ResourceConfig = {
    description: 'Drive file resource',
    mimeType: 'application/json',
  };

  const handler = async (uri: URL, variables: Record<string, string | string[]>, extra: ServerContext): Promise<ReadResourceResult> => {
    // Extract fileId and handle both string and string[] cases
    const fileId = Array.isArray(variables.fileId) ? variables.fileId[0] : variables.fileId;

    try {
      // Validate fileId exists and is a string
      if (!fileId || typeof fileId !== 'string') {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({
                error: 'Missing or invalid fileId in resource URI',
              }),
            },
          ],
        };
      }

      // Safe type guard to access middleware-enriched extra
      const { logger, authContext } = extra as unknown as EnrichedExtra;
      const drive = driveApi({ version: 'v3', auth: googleAuth(authContext.auth) });
      const resp = await drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,modifiedTime,owners,webViewLink',
      });
      const data = resp.data;
      logger.debug?.({ fileId, fileName: data?.name }, 'drive-file resource fetch success');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(data || {}),
          },
        ],
      };
    } catch (error) {
      const { logger } = extra as unknown as EnrichedExtra;
      logger.debug?.(error as Record<string, unknown>, 'drive resource fetch failed');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: (error as Error).message }),
          },
        ],
      };
    }
  };

  return {
    name: 'file',
    template,
    config,
    handler,
  } satisfies ResourceModule;
}
