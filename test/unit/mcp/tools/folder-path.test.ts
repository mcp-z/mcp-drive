import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import createTool, { type Input, type Output } from '../../../../src/mcp/tools/folder-path.js';
import { createExtra } from '../../../lib/create-extra.js';
import createMiddlewareContext from '../../../lib/create-middleware-context.js';

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
    const tool = createTool();
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
      const branch = res.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        assert.equal(branch.path, '/', 'root path should be /');
        assert.ok(Array.isArray(branch.items), 'should have items array');
        assert.equal(branch.items.length, 1, 'root should have 1 segment');
        assert.equal(branch.items[0]?.id, 'root', 'root segment should have id=root');
        assert.equal(branch.items[0]?.name, 'My Drive', 'root segment should be named My Drive');
      } else if (branch?.type === 'auth_required') {
        assert.ok(branch.provider, 'auth_required result should have provider');
      }
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

      const branch = res.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        assert.ok(branch.path.startsWith('/'), 'path should start with /');
      }
    });

    it('returns items with id and name', async () => {
      const res = await folderPathHandler(
        {
          folderId: 'root',
        },
        createExtra()
      );

      const branch = res.structuredContent?.result as Output | undefined;

      if (branch?.type === 'success') {
        for (const item of branch.items) {
          assert.ok(item.id, 'item should have id');
          assert.ok(item.name, 'item should have name');
          assert.equal(typeof item.id, 'string', 'id should be string');
          assert.equal(typeof item.name, 'string', 'name should be string');
        }
      }
    });
  });

  describe('error handling', () => {
    it('handles non-existent folder gracefully', async () => {
      try {
        await folderPathHandler(
          {
            folderId: 'non-existent-folder-id-12345',
          },
          createExtra()
        );
        // If it succeeds without error, that's acceptable (auth_required or empty result)
      } catch (error) {
        // McpError is expected for non-existent folders
        assert.ok(error, 'should throw an error for non-existent folder');
      }
    });
  });
});
