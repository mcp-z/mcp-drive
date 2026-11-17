import type { drive_v3 } from '@googleapis/drive';
import { setTimeout as delay } from 'timers/promises';
import { buildFolderListOptions } from '../../src/mcp/tools/folder-search.ts';
import type { DriveQuery } from '../../src/schemas/drive-query-schema.ts';
import { parseDriveQueryParameter } from '../../src/schemas/drive-query-schema.ts';

interface WaitForFolderOptions {
  timeout?: number; // Timeout in ms (default: 15000)
  interval?: number; // Initial poll interval in ms (default: 200)
  consecutive?: number; // Consecutive polls that must all see the folder (default: 3)
  pageSize?: number; // Polled page size (default: 1000, the tool's maximum)
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
 * Sends the request drive-folder-search builds (buildFolderListOptions: query, mimeType
 * clause, orderBy, corpora and shared-drive flags), so the wait is on the exact index
 * query the tool runs. Only the page size differs, large enough not to hide the folder.
 *
 * One hit is not enough: Drive can answer a later identical request from a replica that
 * has not indexed the folder yet, so the folder must be seen on several consecutive polls.
 *
 * Only a missing result is retried. Any API error is rethrown for diagnosis.
 */
export default async function waitForFolder(drive: drive_v3.Drive, query: DriveQuery | string, expectedId: string, opts: WaitForFolderOptions = {}): Promise<void> {
  const timeout = opts.timeout ?? 15000;
  const maxInterval = 1000;
  const start = Date.now();
  let currentInterval = opts.interval ?? 200;

  const listOptions = buildFolderListOptions(parseDriveQueryParameter(query), opts.pageSize ?? 1000);
  const qStr = listOptions.q;
  const required = opts.consecutive ?? 3;
  let seen = 0;

  while (Date.now() - start < timeout) {
    const list = await drive.files.list(listOptions);
    if ((list?.data?.files ?? []).some((file) => file.id === expectedId)) {
      seen++;
      if (seen >= required) return;
      await delay(maxInterval);
      continue;
    }
    seen = 0;

    await delay(currentInterval);
    // Exponential backoff with cap
    currentInterval = Math.min(currentInterval * 1.5, maxInterval);
  }

  throw new Error(`waitForFolder: timeout after ${timeout}ms waiting for folder ${expectedId}. Query: ${qStr}`);
}
