// Calls the Google Drive API with the configured test account: creates two owned files,
// trashes them through the tool, reads them back and permanently deletes them.
import '../../../lib/env-loader.ts';
import { drive as driveApi } from '@googleapis/drive';
import { mcp } from '@mcp-z/mcp-drive';
import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import { randomUUID } from 'crypto';
import type { Input, Output } from '../../../../src/mcp/tools/file-move-to-trash.ts';
import { assertSuccess } from '../../../lib/assertions.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';
import { throwFailures } from '../../../lib/throw-failures.ts';

describe('drive-file-move-to-trash', () => {
  let auth: Awaited<ReturnType<typeof createMiddlewareContext>>['auth'];
  let fileMoveToTrashHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    auth = middlewareContext.auth;
    fileMoveToTrashHandler = middlewareContext.middleware.withToolAuth(mcp.toolFactories.fileMoveToTrash()).handler;
  });

  async function trash(ids: string[]): Promise<Output> {
    const res = await fileMoveToTrashHandler({ ids }, createExtra());
    return (res.structuredContent as { result: Output }).result;
  }

  it('trashes owned files and reports only real failures', async () => {
    const drive = driveApi({ version: 'v3', auth });
    const run = randomUUID();
    const owned: string[] = [];
    let bodyError: unknown;

    try {
      const create = async (suffix: string) => {
        const { data } = await drive.files.create({ requestBody: { name: `trash-${run}-${suffix}`, mimeType: 'text/plain' }, fields: 'id' });
        assert.ok(data.id, 'created file should have an id');
        owned.push(data.id);
        return data.id;
      };
      const a = await create('a');
      const b = await create('b');
      const missing = `nonexistent-${run}`;

      const allSuccess = await trash([a]);
      assertSuccess(allSuccess, 'all-success trash');
      assert.strictEqual(allSuccess.totalCount, 1);
      assert.strictEqual(allSuccess.successCount, 1);
      assert.strictEqual(allSuccess.failureCount, 0);
      assert.strictEqual(allSuccess.failures, undefined, 'failures omitted when every file is trashed');
      assert.strictEqual(allSuccess.recoverable, true);
      assert.strictEqual(allSuccess.recoverableDays, 30);
      assert.strictEqual(allSuccess.operationSummary, 'Moved 1 file to trash (recoverable for 30 days)');

      const mixed = await trash([b, missing]);
      assertSuccess(mixed, 'mixed trash');
      assert.strictEqual(mixed.totalCount, 2);
      assert.strictEqual(mixed.successCount, 1);
      assert.strictEqual(mixed.failureCount, 1);
      assert.deepStrictEqual(
        mixed.failures?.map((failure) => failure.id),
        [missing]
      );
      assert.ok(mixed.failures?.[0]?.error, 'failure should carry the provider error');
      assert.strictEqual(mixed.recoverable, true);
      assert.strictEqual(mixed.recoverableDays, 30);
      assert.strictEqual(mixed.operationSummary, 'Moved 1 of 2 files to trash (1 failed, recoverable for 30 days)');

      for (const id of [a, b]) {
        const { data } = await drive.files.get({ fileId: id, fields: 'trashed', supportsAllDrives: true });
        assert.strictEqual(data.trashed, true, `owned file ${id} should be trashed`);
      }
    } catch (error) {
      bodyError = error;
    }

    // Every owned fixture is deleted even when the body failed; both failures stay visible.
    const cleanup = await Promise.allSettled(owned.map((fileId) => drive.files.delete({ fileId, supportsAllDrives: true })));
    const cleanupErrors = cleanup.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map((result) => result.reason);
    throwFailures('Trash test and fixture cleanup failed', bodyError === undefined ? cleanupErrors : [bodyError, ...cleanupErrors]);
  });
});
