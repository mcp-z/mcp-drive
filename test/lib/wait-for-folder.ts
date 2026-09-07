import type { drive_v3 } from '@googleapis/drive';
import { setTimeout as delay } from 'timers/promises';
import { toDriveQuery } from '../../src/lib/query-builder.ts';
import type { DriveQuery } from '../../src/schemas/drive-query-schema.ts';

interface WaitForFolderOptions {
  timeout?: number; // Timeout in ms (default: 15000)
  interval?: number; // Initial poll interval in ms (default: 200)
}

/**
 * Wait for a folder to become visible to folder search, then return.
 *
 * Drive's search index is eventually consistent. A folder created moments ago is
 * returned immediately by a parent-only query but can be absent for several
 * seconds from one that also filters on mimeType - which drive-folder-search
 * always adds. Polling here keeps that wait out of the specs, so a spec makes a
 * single un-retried assertion against the tool.
 *
 * Compiles the query through toDriveQuery and appends the folder mimeType clause,
 * the same path drive-folder-search uses, so the wait is on the index the tool
 * will actually query. Passes the shared-drive list parameters for the same
 * reason: without them the poll cannot see shared-drive items at all.
 *
 * Only a missing result is retried. Any API error is rethrown for diagnosis.
 */
export default async function waitForFolder(drive: drive_v3.Drive, query: DriveQuery | string, expectedId: string, opts: WaitForFolderOptions = {}): Promise<void> {
  const timeout = opts.timeout ?? 15000;
  const maxInterval = 1000;
  const start = Date.now();
  let currentInterval = opts.interval ?? 200;

  const folderMimeType = 'application/vnd.google-apps.folder';
  const { q } = toDriveQuery(query);
  const qStr = q ? `(${q}) and mimeType='${folderMimeType}'` : `mimeType='${folderMimeType}'`;

  while (Date.now() - start < timeout) {
    const list = await drive.files.list({
      q: qStr,
      fields: 'files(id)',
      pageSize: 100,
      corpora: 'allDrives',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if ((list?.data?.files ?? []).some((file) => file.id === expectedId)) return;

    await delay(currentInterval);
    // Exponential backoff with cap
    currentInterval = Math.min(currentInterval * 1.5, maxInterval);
  }

  throw new Error(`waitForFolder: timeout after ${timeout}ms waiting for folder ${expectedId}. Query: ${qStr}`);
}
