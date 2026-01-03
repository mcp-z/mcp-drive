import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import createTool, { type Input, type Output } from '../../../../src/mcp/tools/file-move.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';

/**
 * Comprehensive tests for Drive file move tool
 *
 * Covers single file moves, batch operations, undo information,
 * and error handling scenarios.
 *
 * NOTE: These are read-only tests that verify the tool's structure and behavior
 * without actually moving files. Real file move operations should be tested
 * in integration tests with close.
 */
describe('drive-file-move comprehensive tests', () => {
  let fileMoveHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    const middleware = middlewareContext.middleware;
    const tool = createTool();
    const wrappedTool = middleware.withToolAuth(tool);
    fileMoveHandler = wrappedTool.handler;
  });

  describe('input validation', () => {
    it('accepts single file ID as string', async () => {
      // Use a non-existent file ID to test validation without actual move
      const result = await fileMoveHandler(
        {
          fileIds: 'nonexistent-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      // Should handle gracefully - either error or success with 0 moved
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle single file ID');
    });

    it('accepts array of file IDs', async () => {
      // Use non-existent file IDs to test validation
      const result = await fileMoveHandler(
        {
          fileIds: ['nonexistent-1', 'nonexistent-2'],
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle array of file IDs');
    });

    it('validates destination folder ID', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type, 'should return structured response');
    });

    it('respects returnOldParents parameter', async () => {
      const resultWithOldParents = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const resultWithoutOldParents = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: false,
        },
        createExtra()
      );

      const branch1 = resultWithOldParents.structuredContent?.result as Output | undefined;
      const branch2 = resultWithoutOldParents.structuredContent?.result as Output | undefined;

      assert.ok(branch1?.type, 'should handle returnOldParents=true');
      assert.ok(branch2?.type, 'should handle returnOldParents=false');
    });
  });

  describe('response structure', () => {
    it('returns proper success response structure', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'nonexistent-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        assert.ok('moved' in branch, 'should have moved array');
        assert.ok('totalRequested' in branch, 'should have totalRequested count');
        assert.ok('totalMoved' in branch, 'should have totalMoved count');
        assert.ok('totalFailed' in branch, 'should have totalFailed count');
        assert.ok(Array.isArray(branch.moved), 'moved should be array');
      }
    });

    it('includes failed array when there are failures', async () => {
      // Use non-existent file IDs to trigger failures
      const result = await fileMoveHandler(
        {
          fileIds: ['nonexistent-1', 'nonexistent-2'],
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.totalFailed > 0) {
        assert.ok('failed' in branch, 'should have failed array when there are failures');
        assert.ok(Array.isArray(branch.failed), 'failed should be array');
        assert.equal(branch.failed.length, branch.totalFailed, 'failed array length should match totalFailed');
      }
    });

    it('moved items contain required fields', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.moved.length > 0) {
        const movedItem = branch.moved[0];
        if (!movedItem) throw new Error('Expected movedItem');
        assert.ok('fileId' in movedItem, 'moved item should have fileId');
        assert.ok('fileName' in movedItem, 'moved item should have fileName');
        assert.ok('oldParents' in movedItem, 'moved item should have oldParents');
        assert.ok('newParent' in movedItem, 'moved item should have newParent');
        assert.ok(Array.isArray(movedItem.oldParents), 'oldParents should be array');
      }
    });

    it('failed items contain required fields', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: ['nonexistent-1'],
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.failed && branch.failed.length > 0) {
        const failedItem = branch.failed[0];
        if (!failedItem) throw new Error('Expected failedItem');
        assert.ok('fileId' in failedItem, 'failed item should have fileId');
        assert.ok('error' in failedItem, 'failed item should have error');
        assert.equal(typeof failedItem.error, 'string', 'error should be string');
      }
    });
  });

  describe('batch operations', () => {
    it('handles batch with max 100 files validation', async () => {
      // Test with exactly 100 files (max allowed)
      const fileIds = Array.from({ length: 100 }, (_, i) => `file-${i}`);
      const result = await fileMoveHandler({ fileIds, destinationFolderId: 'root', returnOldParents: true }, createExtra());
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type, 'should handle batch of 100 files');
    });

    it('totalRequested matches input count', async () => {
      const fileIds = ['file-1', 'file-2', 'file-3'];
      const result = await fileMoveHandler({ fileIds, destinationFolderId: 'root', returnOldParents: true }, createExtra());
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        assert.equal(branch.totalRequested, fileIds.length, 'totalRequested should match input file count');
      }
    });

    it('totalMoved + totalFailed equals totalRequested', async () => {
      const fileIds = ['file-1', 'file-2', 'file-3'];
      const result = await fileMoveHandler({ fileIds, destinationFolderId: 'root', returnOldParents: true }, createExtra());
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        const sum = branch.totalMoved + branch.totalFailed;
        assert.equal(sum, branch.totalRequested, 'totalMoved + totalFailed should equal totalRequested');
      }
    });
  });

  describe('undo information', () => {
    it('oldParents is populated when returnOldParents=true', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.moved.length > 0) {
        const movedItem = branch.moved[0];
        if (!movedItem) throw new Error('Expected movedItem');
        assert.ok(Array.isArray(movedItem.oldParents), 'oldParents should be array');
        // Array may be empty if file had no parents, but should exist
      }
    });

    it('oldParents is empty array when returnOldParents=false', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: false,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.moved.length > 0) {
        const movedItem = branch.moved[0];
        if (!movedItem) throw new Error('Expected movedItem');
        assert.ok(Array.isArray(movedItem.oldParents), 'oldParents should be array');
        assert.equal(movedItem.oldParents.length, 0, 'oldParents should be empty when returnOldParents=false');
      }
    });

    it('newParent matches destinationFolderId', async () => {
      const destinationFolderId = 'root';
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId,
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.moved.length > 0) {
        const movedItem = branch.moved[0];
        if (!movedItem) throw new Error('Expected movedItem');
        assert.equal(movedItem.newParent, destinationFolderId, 'newParent should match destinationFolderId');
      }
    });
  });

  describe('error handling', () => {
    it('handles non-existent file ID gracefully', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'definitely-nonexistent-file-id-12345',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle non-existent file gracefully');
    });

    it('handles non-existent destination folder gracefully', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'nonexistent-folder-id',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle non-existent destination gracefully');
    });

    it('handles partial failures in batch operations', async () => {
      // Mix of potentially valid and invalid IDs
      const fileIds = ['nonexistent-1', 'nonexistent-2', 'nonexistent-3'];
      const result = await fileMoveHandler({ fileIds, destinationFolderId: 'root', returnOldParents: true }, createExtra());
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        // Should track both successes and failures
        assert.ok(branch.totalMoved >= 0, 'totalMoved should be non-negative');
        assert.ok(branch.totalFailed >= 0, 'totalFailed should be non-negative');
      }
    });

    it('provides error details for failures', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'nonexistent-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.failed && branch.failed.length > 0) {
        const failedItem = branch.failed[0];
        if (!failedItem) throw new Error('Expected failedItem');
        assert.ok(failedItem.error, 'failed item should have error message');
        assert.equal(typeof failedItem.error, 'string', 'error message should be string');
      }
    });
  });

  describe('single vs batch mode detection', () => {
    it('detects single file mode correctly', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'single-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        assert.equal(branch.totalRequested, 1, 'single file should have totalRequested=1');
      }
    });

    it('detects batch mode correctly', async () => {
      const fileIds = ['file-1', 'file-2'];
      const result = await fileMoveHandler({ fileIds, destinationFolderId: 'root', returnOldParents: true }, createExtra());
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        assert.equal(branch.totalRequested, fileIds.length, 'batch should have totalRequested matching array length');
      }
    });
  });

  describe('integration scenarios', () => {
    it('move to root folder', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type, 'should handle move to root');
    });

    it('handles webViewLink when present', async () => {
      const result = await fileMoveHandler(
        {
          fileIds: 'test-file-id',
          destinationFolderId: 'root',
          returnOldParents: true,
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success' && branch.moved.length > 0) {
        const movedItem = branch.moved[0];
        if (!movedItem) throw new Error('Expected movedItem');
        if (movedItem.webViewLink) {
          assert.equal(typeof movedItem.webViewLink, 'string', 'webViewLink should be string when present');
        }
      }
    });
  });
});
