import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import { google } from 'googleapis';
import createTool, { type Input, type Output } from '../../../../src/mcp/tools/folder-create.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';
import { deleteTestFolder } from '../../../lib/folder-helpers.ts';

/**
 * Tests for Drive folder create tool
 *
 * Tests folder creation in root and with parent folders,
 * close of created resources, and error handling.
 *
 * CLEANUP PHILOSOPHY:
 * - Per-test close in finally blocks (strict - fail loud)
 * - All close errors throw immediately via deleteTestFolder()
 * - No try/catch hiding close failures
 * - Tests fail visibly if close fails (indicates test pollution issues)
 */
describe('drive-folder-create tests', () => {
  let auth: Awaited<ReturnType<typeof createMiddlewareContext>>['auth'];
  let logger: Awaited<ReturnType<typeof createMiddlewareContext>>['logger'];
  let folderCreateHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    auth = middlewareContext.auth;
    logger = middlewareContext.logger;
    const middleware = middlewareContext.middleware;
    const tool = createTool();
    const wrappedTool = middleware.withToolAuth(tool);
    folderCreateHandler = wrappedTool.handler;
  });

  describe('basic functionality', () => {
    it('creates folder in root without parentId', async () => {
      let createdFolderId: string | undefined;

      try {
        const testFolderName = `Test Folder Root ${Date.now()}`;
        const res = await folderCreateHandler({ name: testFolderName, parentId: undefined }, createExtra());

        // Use structuredContent for typed access
        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        // Check discriminated union type
        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.id, 'should have folder id');
          assert.equal(branch.name, testFolderName, 'should have correct name');
          assert.ok(branch.webViewLink, 'should have webViewLink');
          createdFolderId = branch.id;
        }
      } finally {
        // Cleanup: delete created folder
        if (createdFolderId) {
          const drive = google.drive({ version: 'v3', auth });
          await deleteTestFolder(drive, createdFolderId, logger);
        }
      }
    });

    it('creates folder with parent', async () => {
      let parentFolderId: string | undefined;
      let childFolderId: string | undefined;

      try {
        const drive = google.drive({ version: 'v3', auth });

        // Create parent folder first
        const parentName = `Test Parent ${Date.now()}`;
        const parentResponse = await drive.files.create({
          requestBody: {
            name: parentName,
            mimeType: 'application/vnd.google-apps.folder',
          },
          fields: 'id,name',
        });
        parentFolderId = parentResponse.data.id as string;

        // Create child folder with parent
        const childName = `Test Child ${Date.now()}`;
        const res = await folderCreateHandler({ name: childName, parentId: parentFolderId }, createExtra());

        // Use structuredContent for typed access
        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.id, 'should have folder id');
          assert.equal(branch.name, childName, 'should have correct name');
          assert.ok(branch.webViewLink, 'should have webViewLink');

          // Should have parent info
          assert.equal(branch.parentId, parentFolderId, 'should have parentId');
          assert.equal(branch.parentName, parentName, 'should have parentName');

          childFolderId = branch.id;
        }
      } finally {
        // Cleanup: delete child first, then parent
        const drive = google.drive({ version: 'v3', auth });
        if (childFolderId) {
          await deleteTestFolder(drive, childFolderId, logger);
        }
        if (parentFolderId) {
          await deleteTestFolder(drive, parentFolderId, logger);
        }
      }
    });
  });

  describe('error handling', () => {
    it('handles invalid parent ID', async () => {
      const testFolderName = `Test Invalid Parent ${Date.now()}`;

      // Should throw McpError for invalid parent
      try {
        await folderCreateHandler({ name: testFolderName, parentId: 'invalid-folder-id-12345' }, createExtra());
        assert.fail('should have thrown McpError for invalid parent');
      } catch (error) {
        assert.ok(error instanceof Error, 'should throw an error');
        assert.ok(error.message.includes('Error creating folder'), 'error message should mention folder creation');
      }
    });

    it('handles empty folder name', async () => {
      let createdFolderId: string | undefined;

      try {
        // Drive accepts whitespace-only names and creates the folder
        const res = await folderCreateHandler({ name: '   ', parentId: undefined }, createExtra());

        // Use structuredContent for typed access
        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        // Drive successfully creates folder with whitespace (likely trimmed)
        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.id, 'should have folder id');
          createdFolderId = branch.id;
        }
      } finally {
        // Cleanup: delete created folder
        if (createdFolderId) {
          const drive = google.drive({ version: 'v3', auth });
          await deleteTestFolder(drive, createdFolderId, logger);
        }
      }
    });
  });

  describe('operation metadata', () => {
    it('includes operation summary', async () => {
      let createdFolderId: string | undefined;

      try {
        const testFolderName = `Test Summary ${Date.now()}`;
        const res = await folderCreateHandler({ name: testFolderName, parentId: undefined }, createExtra());

        // Use structuredContent for typed access
        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.operationSummary, 'should have operationSummary');
          assert.ok(branch.operationSummary.includes(testFolderName), 'summary should include folder name');
          assert.equal(branch.itemsProcessed, 1, 'should process 1 item');
          assert.equal(branch.itemsChanged, 1, 'should change 1 item');
          assert.ok(branch.completedAt, 'should have completedAt timestamp');

          createdFolderId = branch.id;
        }
      } finally {
        if (createdFolderId) {
          const drive = google.drive({ version: 'v3', auth });
          await deleteTestFolder(drive, createdFolderId, logger);
        }
      }
    });
  });
});
