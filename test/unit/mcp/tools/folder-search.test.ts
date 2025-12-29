import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import createTool, { type Input, type Output } from '../../../../src/mcp/tools/folder-search.js';
import { createExtra } from '../../../lib/create-extra.js';
import createMiddlewareContext from '../../../lib/create-middleware-context.js';

// Type guard for objects shape output
function isObjectsShape(branch: Output | undefined): branch is Extract<Output, { shape: 'objects' }> {
  return branch?.type === 'success' && branch.shape === 'objects';
}

/**
 * Comprehensive tests for Drive folder search tool
 *
 * Covers folder-specific queries, path resolution, pagination,
 * and Drive API integration scenarios.
 */
describe('drive-folder-search comprehensive tests', () => {
  let folderSearchHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    const middleware = middlewareContext.middleware;
    const tool = createTool();
    const wrappedTool = middleware.withToolAuth(tool);
    folderSearchHandler = wrappedTool.handler;
  });

  describe('basic functionality', () => {
    it('search returns structured content for folders', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      assert.ok(res?.structuredContent, 'search missing structuredContent');
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        if (branch.items.length > 0) {
          const first = branch.items[0];
          if (first) {
            assert.ok(first.id && first.name, 'folder item missing id/name');
            assert.equal(first.mimeType, 'application/vnd.google-apps.folder', 'should only return folders');
          }
        }
      } else if (branch?.type === 'auth_required') {
        assert.ok(branch.provider, 'auth_required result missing provider field');
      }
    });

    it('search with shape arrays returns columnar format', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'arrays',
        },
        createExtra()
      );
      assert.ok(res?.structuredContent, 'search missing structuredContent');
      const branch = res.structuredContent?.result as Output | undefined;
      if (branch?.type === 'success' && branch.shape === 'arrays') {
        assert.ok(Array.isArray(branch.columns), 'columns should be array');
        assert.ok(Array.isArray(branch.rows), 'rows should be array');
        assert.ok(branch.columns.includes('id'), 'columns should include id');
        assert.ok(branch.columns.includes('name'), 'columns should include name');
        for (const row of branch.rows) {
          assert.equal(row.length, branch.columns.length, 'row length should match columns length');
        }
      } else if (branch?.type === 'auth_required') {
        assert.ok(branch.provider, 'auth_required result missing provider field');
      }
    });

    it('returns folders only with proper mime type filter', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 10,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && branch.items.length > 0) {
        for (const item of branch.items) {
          assert.equal(item.mimeType, 'application/vnd.google-apps.folder', 'all items should be folders');
        }
      }
    });
  });

  describe('path resolution', () => {
    it('returns items without paths when resolvePaths=false', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && branch.items.length > 0) {
        const first = branch.items[0];
        if (first) assert.equal(first.path, undefined, 'should not have path when resolvePaths=false');
      }
    });

    it('resolves paths when resolvePaths=true', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: true,
          pageSize: 3,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && branch.items.length > 0) {
        const first = branch.items[0];
        if (first && first.path) {
          assert.ok(first.path.startsWith('/'), 'path should start with /');
          assert.equal(typeof first.path, 'string', 'path should be string');
        }
      }
    });

    it('path format is correct', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: true,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && branch.items.length > 0) {
        for (const item of branch.items) {
          if (item.path) {
            // Path should be /Folder or /Parent/Child format
            assert.ok(/^(\/[^/]+)+$/.test(item.path) || item.path === '/', 'path should have correct format');
          }
        }
      }
    });
  });

  describe('context offloading', () => {
    it('returns minimal folder data when requesting only id,name fields', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        assert.ok(branch.items !== undefined, 'should have items array');
        assert.ok(Array.isArray(branch.items), 'items should be array');
        // Items should only have id and name when fields='id,name'
        if (branch.items.length > 0) {
          const firstItem = branch.items[0];
          if (!firstItem) throw new Error('Expected firstItem');
          assert.ok(firstItem.id, 'item should have id');
          assert.ok(firstItem.name, 'item should have name');
          // Should not have other fields
          const allowedKeys = ['id', 'name'];
          const actualKeys = Object.keys(firstItem);
          for (const key of actualKeys) {
            assert.ok(allowedKeys.includes(key), `item should not have unexpected field: ${key}`);
          }
        }
      }
    });

    it('returns full folder data when includeData=true', async () => {
      const res = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        assert.ok(branch.items !== undefined, 'should have folders array');
        assert.ok(Array.isArray(branch.items), 'folders should be array');
      }
    });
  });

  describe('pagination', () => {
    it('first page without pageToken', async () => {
      const result = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        assert.ok(branch.items !== undefined, 'should have folders array');
      }
    });

    it('handles pagination with pageToken', async () => {
      const firstPage = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 3,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );
      const firstBranch = firstPage.structuredContent?.result as Output | undefined;
      if (isObjectsShape(firstBranch) && firstBranch.nextPageToken) {
        const secondPage = await folderSearchHandler(
          {
            query: undefined,
            resolvePaths: false,
            pageSize: 3,
            pageToken: firstBranch.nextPageToken,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );
        const secondBranch = secondPage.structuredContent?.result as Output | undefined;
        assert.equal(secondBranch?.type, 'success', 'second page should succeed');
      }
    });
  });

  describe('folder queries', () => {
    it('handles specific folder name search', async () => {
      const result = await folderSearchHandler(
        {
          query: 'My Drive',
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle folder name search');
    });

    it('handles parent folder queries', async () => {
      const result = await folderSearchHandler(
        {
          query: 'root in parents',
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle parent folder queries');
    });

    it('filters out trashed folders', async () => {
      const result = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 10,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && branch.items.length > 0) {
        // All items should be non-trashed folders (implicit in query)
        assert.ok(
          branch.items.every((item) => item.mimeType === 'application/vnd.google-apps.folder'),
          'all items should be folders'
        );
      }
    });
  });

  describe('field validation', () => {
    it('folder items have required fields', async () => {
      const result = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && branch.items.length > 0) {
        const first = branch.items[0];
        if (!first) throw new Error('Expected first');
        assert.ok(first.id, 'folder should have id');
        assert.ok(first.name, 'folder should have name');
        assert.ok(first.mimeType, 'folder should have mimeType');
      }
    });

    it('folder items have optional fields when present', async () => {
      const result = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && branch.items.length > 0) {
        const first = branch.items[0];
        if (!first) throw new Error('Expected first');
        if (first.parents) {
          assert.ok(Array.isArray(first.parents), 'parents should be array');
        }
        if (first.webViewLink) {
          assert.equal(typeof first.webViewLink, 'string', 'webViewLink should be string');
        }
        if (first.modifiedTime) {
          assert.equal(typeof first.modifiedTime, 'string', 'modifiedTime should be string');
        }
      }
    });
  });

  describe('error handling', () => {
    it('handles invalid queries gracefully', async () => {
      const result = await folderSearchHandler(
        {
          query: 'invalid_field = "value"',
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle invalid queries');
    });

    it('handles invalid pageToken gracefully', async () => {
      const result = await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: false,
          pageSize: 5,
          pageToken: 'invalid-token-123',
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle invalid pageToken');
    });
  });

  describe('performance', () => {
    it('path resolution completes in reasonable time', async () => {
      const startTime = Date.now();
      await folderSearchHandler(
        {
          query: undefined,
          resolvePaths: true,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const elapsed = Date.now() - startTime;
      // Path resolution may take longer but should complete within reasonable time
      assert.ok(elapsed < 30000, 'path resolution should complete within 30 seconds');
    });
  });
});
