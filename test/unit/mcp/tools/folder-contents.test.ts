import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import createTool, { type Input, type Output } from '../../../../src/mcp/tools/folder-contents.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';

// Type guard for objects shape output
function isObjectsShape(branch: Output | undefined): branch is Extract<Output, { shape: 'objects' }> {
  return branch?.type === 'success' && branch.shape === 'objects';
}

/**
 * Tests for Drive folder-contents tool
 *
 * Lists files and folders within a specific folder with field selection and pagination.
 */
describe('folder-contents tool', () => {
  let folderContentsHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    const middleware = middlewareContext.middleware;
    const tool = createTool();
    const wrappedTool = middleware.withToolAuth(tool);
    folderContentsHandler = wrappedTool.handler;
  });

  describe('basic functionality', () => {
    it('lists root folder contents with structuredContent', async () => {
      const res = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name,mimeType',
          pageSize: 10,
          shape: 'objects',
        },
        createExtra()
      );

      assert.ok(res?.structuredContent, 'should have structuredContent');
      const branch = res.structuredContent?.result as Output | undefined;

      if (isObjectsShape(branch)) {
        assert.ok(Array.isArray(branch.items), 'items should be an array');
        assert.equal(branch.folderId, 'root', 'should return queried folderId');
        assert.equal(typeof branch.count, 'number', 'should have count');
      } else if (branch?.type === 'auth_required') {
        assert.ok(branch.provider, 'auth_required result should have provider');
      }
    });

    it('lists folder contents with shape arrays returns columnar format', async () => {
      const res = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name',
          pageSize: 5,
          shape: 'arrays',
        },
        createExtra()
      );

      assert.ok(res?.structuredContent, 'should have structuredContent');
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
        assert.ok(branch.provider, 'auth_required result should have provider');
      }
    });

    it('returns items with requested fields only', async () => {
      const res = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name',
          pageSize: 5,
          shape: 'objects',
        },
        createExtra()
      );

      const branch = res.structuredContent?.result as Output | undefined;

      if (isObjectsShape(branch) && branch.items.length > 0) {
        const first = branch.items[0];
        if (first) {
          assert.ok(first.id, 'item should have id');
          assert.ok(first.name, 'item should have name');
          const keys = Object.keys(first);
          assert.ok(
            keys.every((k) => ['id', 'name'].includes(k)),
            'should only have requested fields'
          );
        }
      }
    });
  });

  describe('field selection', () => {
    it('includes mimeType when requested', async () => {
      const res = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name,mimeType',
          pageSize: 5,
          shape: 'objects',
        },
        createExtra()
      );

      const branch = res.structuredContent?.result as Output | undefined;

      if (isObjectsShape(branch) && branch.items.length > 0) {
        const first = branch.items[0];
        if (first) {
          assert.ok(first.mimeType, 'item should have mimeType');
        }
      }
    });

    it('includes parent info when requested', async () => {
      const res = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name,parents',
          pageSize: 5,
          shape: 'objects',
        },
        createExtra()
      );

      const branch = res.structuredContent?.result as Output | undefined;

      if (isObjectsShape(branch) && branch.items.length > 0) {
        const first = branch.items[0];
        if (first?.parents) {
          assert.ok(Array.isArray(first.parents), 'parents should be an array');
          if (first.parents.length > 0) {
            const parent = first.parents[0];
            assert.ok(parent?.id, 'parent should have id');
            assert.ok(parent?.name, 'parent should have name');
          }
        }
      }
    });
  });

  describe('pagination', () => {
    it('respects pageSize limit', async () => {
      const res = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name',
          pageSize: 3,
          shape: 'objects',
        },
        createExtra()
      );

      const branch = res.structuredContent?.result as Output | undefined;

      if (isObjectsShape(branch)) {
        assert.ok(branch.items.length <= 3, 'should return at most pageSize items');
      }
    });

    it('returns nextPageToken for pagination', async () => {
      const firstPage = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name',
          pageSize: 2,
          shape: 'objects',
        },
        createExtra()
      );

      const firstBranch = firstPage.structuredContent?.result as Output | undefined;

      if (isObjectsShape(firstBranch) && firstBranch.nextPageToken) {
        const secondPage = await folderContentsHandler(
          {
            folderId: 'root',
            fields: 'id,name',
            pageSize: 2,
            pageToken: firstBranch.nextPageToken,
            shape: 'objects',
          },
          createExtra()
        );

        const secondBranch = secondPage.structuredContent?.result as Output | undefined;
        assert.equal(secondBranch?.type, 'success', 'second page should succeed');
      }
    });
  });

  describe('ordering', () => {
    it('returns folders first, then files (sorted by name)', async () => {
      const res = await folderContentsHandler(
        {
          folderId: 'root',
          fields: 'id,name,mimeType',
          pageSize: 20,
          shape: 'objects',
        },
        createExtra()
      );

      const branch = res.structuredContent?.result as Output | undefined;

      if (isObjectsShape(branch) && branch.items.length > 1) {
        const folderMime = 'application/vnd.google-apps.folder';
        let seenNonFolder = false;

        for (const item of branch.items) {
          if (item.mimeType !== folderMime) {
            seenNonFolder = true;
          } else if (seenNonFolder) {
            assert.fail('Folders should come before files');
          }
        }
      }
    });
  });
});
