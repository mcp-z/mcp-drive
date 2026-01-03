import type { drive_v3 } from 'googleapis';
import type { Logger } from '../../src/types.ts';

/**
 * Delete a test folder created during tests.
 * Throws on any error - close failures indicate test problems that need to be visible.
 */
export async function deleteTestFolder(drive: drive_v3.Drive, id: string, logger: Logger): Promise<void> {
  try {
    await drive.files.delete({ fileId: id });
    logger.debug('Test folder close successful', { folderId: id });
  } catch (e) {
    const error = e as { status?: number; statusCode?: number; code?: string };
    logger.error('Test folder close failed', {
      folderId: id,
      error: e instanceof Error ? e.message : String(e),
      status: error.status ?? error.statusCode,
      code: error.code,
    });
    throw e; // Always throw - if we're deleting it, it should exist
  }
}
