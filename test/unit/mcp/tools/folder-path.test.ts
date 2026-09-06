import { mcp } from '@mcp-z/mcp-drive';
import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import type { Input, Output } from '../../../../src/mcp/tools/folder-path.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';

/**
 * Tests for Drive folder-path tool
 *
 * Resolves full path from a folder to root for navigation context.
 */
describe('folder-path tool', () => {
  let folderPathHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    const middleware = middlewareContext.middleware;
    const tool = mcp.toolFactories.folderPath();
    const wrappedTool = middleware.withToolAuth(tool);
    folderPathHandler = wrappedTool.handler;
  });

  describe('basic functionality', () => {
    it('resolves root folder path', async () => {
      const res = await folderPathHandler(
        {
          folderId: 'root',
        },
        createExtra()
      );

      assert.ok(res?.structuredContent, 'should have structuredContent');
      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;

      if (branch?.type !== 'success') {
        assert.fail(`expected success branch, got ${branch?.type}`);
      }
      assert.equal(branch.path, '/', 'root path should be /');
      assert.ok(Array.isArray(branch.items), 'should have items array');
      assert.equal(branch.items.length, 1, 'root should have 1 segment');
      assert.equal(branch.items[0]?.id, 'root', 'root segment should have id=root');
      assert.equal(branch.items[0]?.name, 'My Drive', 'root segment should be named My Drive');
    });
  });

  describe('path format', () => {
    it('returns path starting with /', async () => {
      const res = await folderPathHandler(
        {
          folderId: 'root',
        },
        createExtra()
      );

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;

      if (branch?.type !== 'success') {
        assert.fail(`expected success branch, got ${branch?.type}`);
      }
      assert.ok(branch.path.startsWith('/'), 'path should start with /');
    });

    it('returns items with id and name', async () => {
      const res = await folderPathHandler(
        {
          folderId: 'root',
        },
        createExtra()
      );

      const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;

      if (branch?.type !== 'success') {
        assert.fail(`expected success branch, got ${branch?.type}`);
      }
      for (const item of branch.items) {
        assert.ok(item.id, 'item should have id');
        assert.ok(item.name, 'item should have name');
        assert.equal(typeof item.id, 'string', 'id should be string');
        assert.equal(typeof item.name, 'string', 'name should be string');
      }
    });
  });

  describe('error handling', () => {
    it('handles non-existent folder gracefully', async () => {
      try {
        const res = await folderPathHandler(
          {
            folderId: 'non-existent-folder-id-12345',
          },
          createExtra()
        );
        const branch = (res.structuredContent as { result?: unknown } | undefined)?.result as Output | undefined;
        assert.ok(branch, 'expected structured result');
        assert.equal(branch.type, 'success', `expected success branch, got ${branch?.type}`);
      } catch (error) {
        // ProtocolError is expected for non-existent folders
        assert.ok(error, 'should throw an error for non-existent folder');
      }
    });
  });
});
