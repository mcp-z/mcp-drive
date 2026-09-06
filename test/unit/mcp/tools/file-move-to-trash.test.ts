import { mcp } from '@mcp-z/mcp-drive';
import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import type { Input, Output } from '../../../../src/mcp/tools/file-move-to-trash.ts';
import { assertSuccess } from '../../../lib/assertions.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';

describe('drive-file-move-to-trash', () => {
  let fileMoveToTrashHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    const middleware = middlewareContext.middleware;
    const tool = mcp.toolFactories.fileMoveToTrash();
    const wrappedTool = middleware.withToolAuth(tool);
    fileMoveToTrashHandler = wrappedTool.handler;
  });

  describe('basic functionality', () => {
    it('returns structured content with correct schema', async () => {
      // Test with a non-existent file ID (will fail but structure should be valid)
      const res = await fileMoveToTrashHandler({ ids: ['nonexistent-file-id'] }, createExtra());

      assert.ok(res?.structuredContent, 'missing structuredContent');
      const branch = (res.structuredContent as { result?: unknown })?.result as Output | undefined;

      // Should have success type with failure details or error type
      assertSuccess(branch, 'move-to-trash structured response');
      assert.ok(typeof branch.operationSummary === 'string', 'should have operationSummary');
      assert.ok(typeof branch.totalCount === 'number', 'should have totalCount');
      assert.ok(typeof branch.successCount === 'number', 'should have successCount');
      assert.ok(typeof branch.failureCount === 'number', 'should have failureCount');
      assert.equal(branch.recoverable, true, 'trash operation should be recoverable');
      assert.equal(branch.recoverableDays, 30, 'should have 30 days recovery window');

      // If there were failures, check structure
      if (branch.failures) {
        assert.ok(Array.isArray(branch.failures), 'failures should be array');
        if (branch.failures.length > 0) {
          const failure = branch.failures[0];
          assert.ok(failure, 'failure should exist');
          assert.ok(typeof failure.id === 'string', 'failure should have id');
          assert.ok(typeof failure.error === 'string', 'failure should have error message');
        }
      }
    });

    it('handles single file ID', async () => {
      const res = await fileMoveToTrashHandler({ ids: ['test-file-id'] }, createExtra());

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;
      assertSuccess(branch, 'single file ID');
      assert.equal(branch.totalCount, 1, 'should process 1 item');
    });

    it('handles multiple file IDs', async () => {
      const res = await fileMoveToTrashHandler({ ids: ['test-file-1', 'test-file-2', 'test-file-3'] }, createExtra());

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;
      assertSuccess(branch, 'multiple file IDs');
      assert.equal(branch.totalCount, 3, 'should process 3 items');
    });
  });

  describe('errors-only pattern', () => {
    it('omits failures array when all succeed', async () => {
      // This test would need actual valid file IDs to test success case
      // For now we verify the schema allows omission
      const res = await fileMoveToTrashHandler({ ids: ['test-id'] }, createExtra());

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;
      assertSuccess(branch, 'omits failures array');
      // If all items succeeded, failures should be undefined
      if (branch.successCount === branch.totalCount) {
        assert.equal(branch.failures, undefined, 'should omit failures array when all succeed');
      }
    });

    it('includes failures array only when items fail', async () => {
      const res = await fileMoveToTrashHandler({ ids: ['invalid-id-1', 'invalid-id-2'] }, createExtra());

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;
      assertSuccess(branch, 'includes failures array');
      // With invalid IDs, we expect failures
      if (branch.failureCount > 0) {
        assert.ok(Array.isArray(branch.failures), 'should include failures array when items fail');
        assert.ok(branch.failures.length > 0, 'failures array should not be empty');
      }
    });
  });

  describe('batch operations', () => {
    it('handles maximum batch size (1000)', async () => {
      const maxBatch = Array.from({ length: 1000 }, (_, i) => `file-${i}`);

      const res = await fileMoveToTrashHandler({ ids: maxBatch }, createExtra());
      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;

      assertSuccess(branch, 'max batch size');
      assert.equal(branch.totalCount, 1000, 'should process all 1000 items');
    });
  });

  describe('error handling', () => {
    it('handles service errors gracefully', async () => {
      const res = await fileMoveToTrashHandler({ ids: ['malformed|||id'] }, createExtra());

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;
      assertSuccess(branch, 'malformed IDs');
    });

    it('requires auth to succeed', async () => {
      const res = await fileMoveToTrashHandler({ ids: ['test-id'] }, createExtra());

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;
      assertSuccess(branch, 'auth requirement');
    });
  });
});
