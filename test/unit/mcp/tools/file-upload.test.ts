import { mcp } from '@mcp-z/mcp-drive';
import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import { promises as fs } from 'fs';
import getPort from 'get-port';
import { google } from 'googleapis';
import { createServer, type Server } from 'http';
import { join } from 'path';
import type { Input, Output } from '../../../../src/mcp/tools/file-upload.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';
import { deleteTestFolder } from '../../../lib/folder-helpers.ts';

/**
 * Tests for Drive file upload tool
 *
 * Tests uploading from file:// and http:// URIs, name/MIME defaults and
 * overrides, parent folders, and error handling.
 *
 * CLEANUP PHILOSOPHY:
 * - Per-test close in finally blocks (strict - fail loud)
 * - All close errors throw immediately
 * - No try/catch hiding close failures
 * - Tests fail visibly if close fails (indicates test pollution issues)
 */
describe('drive-file-upload tests', () => {
  const fixtureContent = 'hello drive upload';
  let auth: Awaited<ReturnType<typeof createMiddlewareContext>>['auth'];
  let logger: Awaited<ReturnType<typeof createMiddlewareContext>>['logger'];
  let fileUploadHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    auth = middlewareContext.auth;
    logger = middlewareContext.logger;
    const middleware = middlewareContext.middleware;
    const tool = mcp.toolFactories.fileUpload();
    const wrappedTool = middleware.withToolAuth(tool);
    fileUploadHandler = wrappedTool.handler;
  });

  /** Write a text fixture into the package-root .tmp/ directory (never os.tmpdir()) */
  async function writeFixture(fileName: string, content: string): Promise<string> {
    const fixturePath = join('.tmp', fileName);
    await fs.mkdir('.tmp', { recursive: true });
    await fs.writeFile(fixturePath, content, 'utf-8');
    return fixturePath;
  }

  describe('basic functionality', () => {
    it('uploads file from file:// URI to root', async () => {
      const fixtureName = `file-upload-${Date.now()}.txt`;
      const fixturePath = await writeFixture(fixtureName, fixtureContent);
      let uploadedFileId: string | undefined;

      try {
        const res = await fileUploadHandler({ sourceUri: `file://${fixturePath}` }, createExtra());

        // Use structuredContent for typed access
        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.id, 'should have file id');
          assert.equal(branch.name, fixtureName, 'should default name from source file name');
          assert.equal(branch.mimeType, 'text/plain', 'should guess MIME from extension');
          assert.equal(branch.size, String(fixtureContent.length), 'should report uploaded size in bytes');
          assert.ok(branch.webViewLink, 'should have webViewLink');
          uploadedFileId = branch.id;
        }
      } finally {
        // Cleanup: delete uploaded file and local fixture
        if (uploadedFileId) {
          const drive = google.drive({ version: 'v3', auth });
          await drive.files.delete({ fileId: uploadedFileId, supportsAllDrives: true });
        }
        await fs.unlink(fixturePath);
      }
    });

    it('uploads file from http:// URI with defaults from headers and URL path', async () => {
      const httpContent = 'hello over http';
      const port = await getPort();
      const server: Server = createServer((_req, res) => {
        res.setHeader('content-type', 'text/plain');
        res.end(httpContent);
      });
      await new Promise<void>((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
      let uploadedFileId: string | undefined;

      try {
        const res = await fileUploadHandler({ sourceUri: `http://127.0.0.1:${port}/report.txt` }, createExtra());

        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.id, 'should have file id');
          assert.equal(branch.name, 'report.txt', 'should default name from URL path');
          assert.equal(branch.mimeType, 'text/plain', 'should use Content-Type header');
          assert.equal(branch.size, String(httpContent.length), 'should report uploaded size in bytes');
          uploadedFileId = branch.id;
        }
      } finally {
        if (uploadedFileId) {
          const drive = google.drive({ version: 'v3', auth });
          await drive.files.delete({ fileId: uploadedFileId, supportsAllDrives: true });
        }
        server.closeAllConnections();
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
    });

    it('honors explicit name and mimeType overrides', async () => {
      const fixtureName = `file-upload-override-${Date.now()}.txt`;
      const fixturePath = await writeFixture(fixtureName, fixtureContent);
      const customName = 'Custom Data.bin';
      let uploadedFileId: string | undefined;

      try {
        const res = await fileUploadHandler({ sourceUri: `file://${fixturePath}`, name: customName, mimeType: 'application/octet-stream' }, createExtra());

        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.id, 'should have file id');
          assert.equal(branch.name, customName, 'should honor explicit name');
          assert.equal(branch.mimeType, 'application/octet-stream', 'should honor explicit mimeType');
          uploadedFileId = branch.id;
        }
      } finally {
        if (uploadedFileId) {
          const drive = google.drive({ version: 'v3', auth });
          await drive.files.delete({ fileId: uploadedFileId, supportsAllDrives: true });
        }
        await fs.unlink(fixturePath);
      }
    });

    it('uploads file with parent', async () => {
      const fixtureName = `file-upload-parent-${Date.now()}.txt`;
      const fixturePath = await writeFixture(fixtureName, fixtureContent);
      const drive = google.drive({ version: 'v3', auth });
      let parentFolderId: string | undefined;
      let uploadedFileId: string | undefined;

      try {
        // Create parent folder first
        const parentName = `Test Upload Parent ${Date.now()}`;
        const parentResponse = await drive.files.create({
          requestBody: {
            name: parentName,
            mimeType: 'application/vnd.google-apps.folder',
          },
          fields: 'id,name',
        });
        parentFolderId = parentResponse.data.id as string;

        const res = await fileUploadHandler({ sourceUri: `file://${fixturePath}`, parentId: parentFolderId }, createExtra());

        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.id, 'should have file id');
          assert.equal(branch.parentId, parentFolderId, 'should have parentId');
          assert.equal(branch.parentName, parentName, 'should have parentName');
          uploadedFileId = branch.id;
        }
      } finally {
        // Cleanup: delete file first, then parent folder
        if (uploadedFileId) {
          await drive.files.delete({ fileId: uploadedFileId, supportsAllDrives: true });
        }
        if (parentFolderId) {
          await deleteTestFolder(drive, parentFolderId, logger);
        }
        await fs.unlink(fixturePath);
      }
    });
  });

  describe('error handling', () => {
    it('handles invalid URI scheme', async () => {
      try {
        await fileUploadHandler({ sourceUri: 'ftp://example.com/file.txt' }, createExtra());
        assert.fail('should have thrown McpError for invalid URI scheme');
      } catch (error) {
        assert.ok(error instanceof Error, 'should throw an error');
        assert.ok(error.message.includes('Error uploading file'), 'error message should mention file upload');
      }
    });

    it('handles missing local file', async () => {
      const missingPath = join('.tmp', `does-not-exist-${Date.now()}.txt`);
      try {
        await fileUploadHandler({ sourceUri: `file://${missingPath}` }, createExtra());
        assert.fail('should have thrown McpError for missing local file');
      } catch (error) {
        assert.ok(error instanceof Error, 'should throw an error');
        assert.ok(error.message.includes('Error uploading file'), 'error message should mention file upload');
      }
    });

    it('handles invalid parent ID', async () => {
      const fixtureName = `file-upload-badparent-${Date.now()}.txt`;
      const fixturePath = await writeFixture(fixtureName, fixtureContent);

      try {
        await fileUploadHandler({ sourceUri: `file://${fixturePath}`, parentId: 'invalid-folder-id-12345' }, createExtra());
        assert.fail('should have thrown McpError for invalid parent');
      } catch (error) {
        assert.ok(error instanceof Error, 'should throw an error');
        assert.ok(error.message.includes('Error uploading file'), 'error message should mention file upload');
      } finally {
        await fs.unlink(fixturePath);
      }
    });

    it('handles HTTP 404 source', async () => {
      const port = await getPort();
      const server: Server = createServer((_req, res) => {
        res.statusCode = 404;
        res.end('not found');
      });
      await new Promise<void>((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));

      try {
        await fileUploadHandler({ sourceUri: `http://127.0.0.1:${port}/missing.txt` }, createExtra());
        assert.fail('should have thrown McpError for HTTP 404 source');
      } catch (error) {
        assert.ok(error instanceof Error, 'should throw an error');
        assert.ok(error.message.includes('Error uploading file'), 'error message should mention file upload');
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
    });
  });

  describe('operation metadata', () => {
    it('includes operation summary', async () => {
      const fixtureName = `file-upload-summary-${Date.now()}.txt`;
      const fixturePath = await writeFixture(fixtureName, fixtureContent);
      let uploadedFileId: string | undefined;

      try {
        const res = await fileUploadHandler({ sourceUri: `file://${fixturePath}` }, createExtra());

        assert.ok(res?.structuredContent, 'response missing structuredContent');
        const branch = res.structuredContent?.result as Output | undefined;
        if (!branch) throw new Error('Expected branch');

        assert.equal(branch.type, 'success', 'should have success type');
        if (branch.type === 'success') {
          assert.ok(branch.operationSummary, 'should have operationSummary');
          assert.ok(branch.operationSummary.includes(fixtureName), 'summary should include file name');
          assert.equal(branch.itemsProcessed, 1, 'should process 1 item');
          assert.equal(branch.itemsChanged, 1, 'should change 1 item');
          assert.ok(branch.completedAt, 'should have completedAt timestamp');
          uploadedFileId = branch.id;
        }
      } finally {
        if (uploadedFileId) {
          const drive = google.drive({ version: 'v3', auth });
          await drive.files.delete({ fileId: uploadedFileId, supportsAllDrives: true });
        }
        await fs.unlink(fixturePath);
      }
    });
  });
});
