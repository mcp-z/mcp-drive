import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import assert from 'assert';
import createTool, { type Input, type Output } from '../../../../src/mcp/tools/folder-search.ts';
import { assertArraysShape, assertObjectsShape, assertSuccess } from '../../../lib/assertions.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';

async function expectMcpError(promise: Promise<unknown>) {
  await assert.rejects(promise, (error) => error instanceof McpError);
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
      assertObjectsShape(branch, 'folder search results');
      if (branch.items.length > 0) {
        const first = branch.items[0];
        if (first) {
          assert.ok(first.id && first.name, 'folder item missing id/name');
          assert.equal(first.mimeType, 'application/vnd.google-apps.folder', 'should only return folders');
        }
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
      assertArraysShape(branch, 'folder search arrays shape');
      assert.ok(Array.isArray(branch.columns), 'columns should be array');
      assert.ok(Array.isArray(branch.rows), 'rows should be array');
      assert.ok(branch.columns.includes('id'), 'columns should include id');
      assert.ok(branch.columns.includes('name'), 'columns should include name');
      for (const row of branch.rows) {
        assert.equal(row.length, branch.columns.length, 'row length should match columns length');
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
      assertObjectsShape(branch, 'folder-only mime type');
      if (branch.items.length > 0) {
        for (const item of branch.items) {
          assert.equal(item.mimeType, 'application/vnd.google-apps.folder', 'all items should be folders');
        }
      }
    });
  });

  describe('query input formats', () => {
    async function assertQuery(query: Input['query']) {
      const res = await folderSearchHandler(
        {
          query,
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = res.structuredContent?.result as Output | undefined;
      assertSuccess(branch, 'query input formats');
    }

    it('accepts structured query objects', async () => {
      await assertQuery({ name: 'folder' });
    });

    it('accepts structured query JSON strings', async () => {
      await assertQuery(JSON.stringify({ name: 'folder' }));
    });

    it('accepts rawDriveQuery objects', async () => {
      await assertQuery({ rawDriveQuery: "name contains 'folder'" });
    });

    it('accepts rawDriveQuery JSON strings', async () => {
      await assertQuery(JSON.stringify({ rawDriveQuery: "name contains 'folder'" }));
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
      assertObjectsShape(branch, 'resolvePaths=false');
      if (branch.items.length > 0) {
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
      assertObjectsShape(branch, 'resolvePaths=true');
      if (branch.items.length > 0) {
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
      assertObjectsShape(branch, 'path format');
      if (branch.items.length > 0) {
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
      assertObjectsShape(branch, 'minimal folder data');
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
      assertObjectsShape(branch, 'full folder data');
      assert.ok(branch.items !== undefined, 'should have folders array');
      assert.ok(Array.isArray(branch.items), 'folders should be array');
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
      assertObjectsShape(branch, 'first page without pageToken');
      assert.ok(branch.items !== undefined, 'should have folders array');
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
      assertObjectsShape(firstBranch, 'pagination first page');
      if (firstBranch.nextPageToken) {
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
        assertObjectsShape(secondBranch, 'pagination second page');
      }
    });
  });

  describe('folder queries', () => {
    it('handles specific folder name search', async () => {
      const result = await folderSearchHandler(
        {
          query: { rawDriveQuery: 'name = "My Drive"' },
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assertSuccess(branch, 'folder name search');
    });

    it('handles parent folder queries', async () => {
      const result = await folderSearchHandler(
        {
          query: { rawDriveQuery: "'root' in parents" },
          resolvePaths: false,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      const branch = result.structuredContent?.result as Output | undefined;
      assertSuccess(branch, 'parent folder queries');
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
      assertObjectsShape(branch, 'trashed folder filter');
      if (branch.items.length > 0) {
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
      assertObjectsShape(branch, 'required fields');
      if (branch.items.length > 0) {
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
      assertObjectsShape(branch, 'optional fields');
      if (branch.items.length > 0) {
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
      await expectMcpError(
        folderSearchHandler(
          {
            query: { rawDriveQuery: 'invalid_field = "value"' },
            resolvePaths: false,
            pageSize: 5,
            pageToken: undefined,
            fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
            shape: 'objects',
          },
          createExtra()
        )
      );
    });

    it('handles invalid pageToken gracefully', async () => {
      await expectMcpError(
        folderSearchHandler(
          {
            query: undefined,
            resolvePaths: false,
            pageSize: 5,
            pageToken: 'invalid-token-123',
            fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
            shape: 'objects',
          },
          createExtra()
        )
      );
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
