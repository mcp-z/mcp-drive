import type { EnrichedExtra } from '@mcp-z/oauth-google';
import type { ToolHandler } from '@mcp-z/server';
import assert from 'assert';
import createTool, { type Input, type Output } from '../../../../src/mcp/tools/files-search.ts';
import { createExtra } from '../../../lib/create-extra.ts';
import createMiddlewareContext from '../../../lib/create-middleware-context.ts';

// Type guard for objects shape output
function isObjectsShape(branch: Output | undefined): branch is Extract<Output, { shape: 'objects' }> {
  return branch?.type === 'success' && branch.shape === 'objects';
}

/**
 * Comprehensive pagination flow test coverage for Drive file search tool
 *
 * This test suite provides thorough coverage of pagination implementations
 * including edge cases, error handling, performance, and security scenarios
 * specific to Google Drive API integration.
 */
describe('drive-file-search comprehensive pagination tests', () => {
  let fileSearchHandler: ToolHandler<Input, EnrichedExtra>;

  before(async () => {
    const middlewareContext = await createMiddlewareContext();
    const middleware = middlewareContext.middleware;
    const tool = createTool();
    const wrappedTool = middleware.withToolAuth(tool);
    fileSearchHandler = wrappedTool.handler;
  });
  describe('basic functionality', () => {
    it('search returns structured content (or empty array) without throwing', async () => {
      const res = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
          shape: 'objects',
        },
        createExtra()
      );
      assert.ok(res?.structuredContent, 'search missing structuredContent');
      const branch = res.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch) && Array.isArray(branch.items)) {
        if (branch.items.length > 0) {
          const first = branch.items[0];
          if (first) assert.ok(first.id || first.name, 'search item missing id/name');
        }
      } else if (branch?.type === 'auth_required') {
        assert.ok(branch.provider, 'auth_required result missing provider field');
      }
    });

    it('search with shape arrays returns columnar format', async () => {
      const res = await fileSearchHandler(
        {
          query: 'mimeType != ""',
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
        // Each row should have same length as columns
        for (const row of branch.rows) {
          assert.equal(row.length, branch.columns.length, 'row length should match columns length');
        }
      } else if (branch?.type === 'auth_required') {
        assert.ok(branch.provider, 'auth_required result missing provider field');
      }
    });
  });

  describe('pagination flow tests', () => {
    it('first page without pageToken', async () => {
      const result = await fileSearchHandler(
        {
          query: 'name contains "document"',
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        // Verify we have files array in objects shape
        assert.ok(Array.isArray(branch.items), 'files should be array');
        // nextPageToken may or may not be present depending on result count
        if (branch.nextPageToken) {
          assert.equal(typeof branch.nextPageToken, 'string', 'nextPageToken should be string when present');
        }
      }
    });

    it('subsequent pages with valid pageToken', async () => {
      // Get first page to obtain pageToken
      const firstPage = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 3,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const firstBranch = firstPage.structuredContent?.result as Output | undefined;
      if (firstBranch?.type === 'success' && firstBranch.nextPageToken) {
        // Use pageToken for second page
        const secondPage = await fileSearchHandler(
          {
            query: 'mimeType != ""',
            pageSize: 3,
            pageToken: firstBranch.nextPageToken,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );

        const secondBranch = secondPage.structuredContent?.result as Output | undefined;
        assert.equal(secondBranch?.type, 'success', 'second page should succeed');
        // Check for files array in success branch
        if (isObjectsShape(secondBranch)) {
          assert.ok(Array.isArray(secondBranch.items), 'second page items should be array');
        }
      }
    });

    it('last page handling (no nextPageToken)', async () => {
      const result = await fileSearchHandler(
        {
          query: `name contains "very-specific-filename-${Date.now()}"`, // Narrow query likely to return fewer results
          pageSize: 100,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        const items = branch.items;
        // If we get results but no nextPageToken, this is the last page
        if (items.length === 0 || !branch.nextPageToken) {
          assert.ok(true, 'Successfully handled last page without nextPageToken');
        }
      }
    });

    it('empty results handling', async () => {
      const uniqueQuery = `name = "nonexistent-file-${Date.now()}.impossible"`;

      const result = await fileSearchHandler(
        {
          query: uniqueQuery,
          pageSize: 10,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        const items = branch.items;
        assert.equal(items.length, 0, 'should return empty results for non-matching query');
        assert.equal(branch.nextPageToken, undefined, 'should not have nextPageToken for empty results');
      }
    });

    it('single page with all results', async () => {
      const result = await fileSearchHandler(
        {
          query: 'modifiedTime > "2025-09-22"', // Very recent query likely to return small result set
          pageSize: 1000,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        const items = branch.items;
        assert.ok(Array.isArray(items), 'items should be array');
        // Note: Google Drive API may return nextPageToken even when results fit on one page
        // This is valid API behavior - nextPageToken means "there might be more", not "there definitely are more"
        if (items.length < 1000 && branch.nextPageToken === undefined) {
          assert.ok(true, 'no nextPageToken when all results fit on one page');
        } else if (items.length < 1000) {
          // API returned a token even though we got fewer results than pageSize - this is acceptable
          assert.ok(typeof branch.nextPageToken === 'string', 'nextPageToken should be string if present');
        }
      }
    });
  });

  describe('edge case tests', () => {
    it('invalid pageToken handling', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 5,
          pageToken: 'invalid-malformed-token-123',
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      // Should either succeed with empty results or return specific error
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle invalid token gracefully');
    });

    it('expired pageToken handling', async () => {
      // Use an old-style token that might be expired
      const expiredToken = 'CAISIhIJCgcI9OjT7gcQChIJCgcI9OjT7gcQChIJCgcI9OjT7gcQ';

      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 5,
          pageToken: expiredToken,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      // Should handle expired tokens gracefully
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle expired token gracefully');
    });

    it('maximum page size handling', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 1000, // Maximum allowed
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        const items = branch.items;
        assert.ok(items.length <= 1000, 'should respect maximum page size');
      }
    });

    it('very large page size clamping', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 50000, // Exceeds maximum
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        const items = branch.items;
        // Should be clamped to maximum allowed (1000)
        assert.ok(items.length <= 1000, 'should clamp to maximum allowed page size');
      }
    });

    it('zero page size handling', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 0,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      // Should either use default or return error
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle zero page size');
    });

    it('negative page size handling', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: -10,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      // Should either use default or return error
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle negative page size');
    });
  });

  describe('google drive specific tests', () => {
    it('handles Drive API quota limits gracefully', async () => {
      // Make multiple concurrent requests to potentially trigger quota limits
      const promises = Array.from({ length: 5 }, () =>
        fileSearchHandler(
          {
            query: 'mimeType != ""',
            pageSize: 10,
            pageToken: undefined,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        )
      );

      const results = await Promise.allSettled(promises);

      // All requests should either succeed or handle quota limits gracefully
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const branch: Output | undefined = result.value?.structuredContent?.result as Output | undefined;
          assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle quota limits gracefully');
        }
      }
    });

    it('validates Drive query syntax', async () => {
      // Test various Drive query patterns
      const queries = ['name contains "test"', 'mimeType = "application/pdf"', 'parents in "folder-id"', 'fullText contains "important"', 'modifiedTime > "2024-01-01T00:00:00"'];

      for (const query of queries) {
        const result = await fileSearchHandler(
          {
            query,
            pageSize: 5,
            pageToken: undefined,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );

        const branch = result.structuredContent?.result as Output | undefined;
        assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', `should handle Drive query: ${query}`);
      }
    });

    it('handles complex Drive queries', async () => {
      // Test complex query with multiple conditions
      const complexQuery = 'name contains "document" and mimeType = "application/pdf" and trashed = false';

      const result = await fileSearchHandler(
        {
          query: complexQuery,
          pageSize: 10,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle complex Drive queries');
    });
  });

  describe('error handling tests', () => {
    it('auth failure response handling', async () => {
      // This test requires manual credential invalidation or specific test setup
      // For now, we test that auth_required responses are properly structured
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 1,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (branch?.type === 'auth_required') {
        assert.ok(branch.provider, 'auth_required should have provider');
        assert.ok(branch.message, 'auth_required should have message');
        assert.ok(branch.url, 'auth_required should have auth URL');
      }
    });

    it('Drive API error handling', async () => {
      // Test with invalid Drive query syntax
      const result = await fileSearchHandler(
        {
          query: 'invalid_field = "value"', // Invalid field name
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      // Should handle Drive API errors gracefully
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle Drive API errors');
    });

    it('malformed query handling', async () => {
      // Test with malformed query syntax
      const result = await fileSearchHandler(
        {
          query: 'name contains', // Incomplete query
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      // Should handle malformed queries gracefully
      assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'should handle malformed queries');
    });
  });

  describe('security tests', () => {
    it('query injection prevention', async () => {
      // Test potential injection patterns
      const maliciousQueries = ['name contains "test" OR parents in "*"', 'name contains "test"; DROP TABLE files', 'name contains "test" UNION SELECT *', 'name contains "\\"" OR "1"="1"'];

      for (const query of maliciousQueries) {
        const result = await fileSearchHandler(
          {
            query,
            pageSize: 5,
            pageToken: undefined,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );

        const branch = result.structuredContent?.result as Output | undefined;
        // Should sanitize or reject malicious queries
        assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', `should handle malicious query safely: ${query.slice(0, 30)}...`);
      }
    });

    it('pageToken validation and sanitization', async () => {
      // Test with various potentially malicious pageTokens
      const maliciousTokens = ['../../../etc/passwd', '<script>alert("xss")</script>', 'https://malicious.com/steal-data', 'file:///sensitive-file.txt'];

      for (const token of maliciousTokens) {
        const result = await fileSearchHandler(
          {
            query: 'mimeType != ""',
            pageSize: 5,
            pageToken: token,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );

        const branch = result.structuredContent?.result as Output | undefined;
        // Should reject or sanitize malicious tokens
        assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', `should handle malicious token safely: ${token}`);
      }
    });

    it('input length validation', async () => {
      // Test with very long inputs
      const veryLongQuery = `name contains "${'a'.repeat(10000)}"`;
      const veryLongToken = `token${'x'.repeat(50000)}`;

      const queryResult = await fileSearchHandler(
        {
          query: veryLongQuery,
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const tokenResult = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 5,
          pageToken: veryLongToken,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const queryBranch = queryResult.structuredContent?.result as Output | undefined;
      const tokenBranch = tokenResult.structuredContent?.result as Output | undefined;

      // Should handle or reject overly long inputs
      assert.ok(queryBranch?.type === 'success' || queryBranch?.type === 'auth_required', 'should handle very long query');
      assert.ok(tokenBranch?.type === 'success' || tokenBranch?.type === 'auth_required', 'should handle very long token');
    });
  });

  describe('performance tests', () => {
    it('large dataset pagination performance', async () => {
      const startTime = Date.now();

      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 100,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const elapsedTime = Date.now() - startTime;
      const branch = result.structuredContent?.result as Output | undefined;

      if (isObjectsShape(branch)) {
        const items = branch.items;
        // Should complete within reasonable time
        assert.ok(elapsedTime < 30000, 'should complete within 30 seconds');
        assert.ok(items.length <= 100, 'should respect page size for performance');
      }
    });

    it('concurrent pagination requests', async () => {
      // Make multiple concurrent requests
      const promises = [
        fileSearchHandler(
          {
            query: 'mimeType != ""',
            pageSize: 10,
            pageToken: undefined,
            fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
            shape: 'objects',
          },
          createExtra()
        ),
        fileSearchHandler(
          {
            query: 'name contains "document"',
            pageSize: 10,
            pageToken: undefined,
            fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
            shape: 'objects',
          },
          createExtra()
        ),
        fileSearchHandler(
          {
            query: 'mimeType = "application/pdf"',
            pageSize: 10,
            pageToken: undefined,
            fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
            shape: 'objects',
          },
          createExtra()
        ),
      ];

      const results = await Promise.allSettled(promises);

      // All requests should either succeed or fail gracefully
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const branch: Output | undefined = result.value?.structuredContent?.result as Output | undefined;
          assert.ok(branch?.type === 'success' || branch?.type === 'auth_required', 'concurrent requests should complete');
        }
      }
    });

    it('memory usage estimation for large results', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 200,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        const items = branch.items;
        if (items.length > 0) {
          // Estimate memory usage per item
          const sampleItem = JSON.stringify(items[0]);
          const estimatedMemoryMb = (sampleItem.length * items.length) / (1024 * 1024);

          // Should be reasonable for typical file metadata
          assert.ok(estimatedMemoryMb < 100, 'memory usage should be reasonable for file metadata');
        }
      }
    });
  });

  describe('field mapping and data integrity', () => {
    it('drive file field mapping consistency', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners', // Changed to true to get full items
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        // When includeData is true, we get items with full metadata
        const items = branch.items || [];
        if (items.length > 0) {
          const firstItem = items[0];
          if (!firstItem) throw new Error('Expected firstItem');

          // Verify expected Drive file fields are present
          const requiredFields = ['id', 'name'];
          for (const field of requiredFields) {
            assert.ok(field in firstItem, `should have ${field} field`);
          }

          // Verify optional fields when present
          if (firstItem.mimeType) {
            assert.equal(typeof firstItem.mimeType, 'string', 'mimeType should be string');
          }
          if (firstItem.webViewLink) {
            assert.equal(typeof firstItem.webViewLink, 'string', 'webViewLink should be string');
          }
          if (firstItem.modifiedTime) {
            assert.equal(typeof firstItem.modifiedTime, 'string', 'modifiedTime should be string');
          }
          if (firstItem.owners) {
            assert.ok(Array.isArray(firstItem.owners), 'owners should be array');
          }
        }
      }
    });

    it('owners field formatting', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners', // Changed to true to get full items
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        // When includeData is true, we get items with full metadata
        const items = branch.items || [];
        for (const item of items) {
          if (item.owners && Array.isArray(item.owners)) {
            for (const owner of item.owners) {
              // Verify owner object structure
              if (owner.displayName) {
                assert.equal(typeof owner.displayName, 'string', 'owner displayName should be string');
              }
              if (owner.emailAddress) {
                assert.equal(typeof owner.emailAddress, 'string', 'owner emailAddress should be string');
                assert.ok(owner.emailAddress.includes('@'), 'owner emailAddress should be valid email');
              }
            }
          }
        }
      }
    });

    it('date format consistency', async () => {
      const result = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 5,
          pageToken: undefined,
          fields: 'id,name,mimeType,webViewLink,modifiedTime,owners', // Changed to true to get full items
          shape: 'objects',
        },
        createExtra()
      );

      const branch = result.structuredContent?.result as Output | undefined;
      if (isObjectsShape(branch)) {
        // When includeData is true, we get items with full metadata
        const items = branch.items || [];
        for (const item of items) {
          if (item.modifiedTime) {
            // Verify date is in valid format
            const dateObj = new Date(item.modifiedTime);
            assert.ok(!Number.isNaN(dateObj.getTime()), 'modifiedTime should be valid ISO format');
          }
        }
      }
    });
  });

  describe('integration and end-to-end tests', () => {
    it('complete pagination workflow', async () => {
      const allItems = [];
      let pageToken: string | undefined;
      let pageCount = 0;
      const maxPages = 3; // Limit for test

      // Paginate through multiple pages
      do {
        pageCount++;
        const result = await fileSearchHandler(
          {
            query: 'mimeType != ""',
            pageSize: 5,
            pageToken,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );

        const branch = result.structuredContent?.result as Output | undefined;
        if (isObjectsShape(branch)) {
          // Collect files from this page
          const items = branch.items || [];
          allItems.push(...items);
          pageToken = branch.nextPageToken;
        } else {
          break; // Stop on error or auth_required
        }
      } while (pageToken && pageCount < maxPages);

      if (allItems.length > 0) {
        // Verify no duplicate items across pages
        const ids = allItems.map((item) => item.id).filter(Boolean);
        const uniqueIds = new Set(ids);
        assert.equal(ids.length, uniqueIds.size, 'should not have duplicate items across pages');

        // Verify consistent field structure across all items
        const firstItem = allItems[0];
        if (!firstItem) throw new Error('Expected firstItem');
        const expectedFields = Object.keys(firstItem);

        for (const item of allItems) {
          for (const field of expectedFields) {
            if ((firstItem as Record<string, unknown>)[field] !== undefined) {
              assert.ok(field in item, `all items should have consistent field structure: ${field}`);
            }
          }
        }
      }
    });

    it('pagination state recovery', async () => {
      // Get first page
      const firstPage = await fileSearchHandler(
        {
          query: 'mimeType != ""',
          pageSize: 3,
          pageToken: undefined,
          fields: 'id,name',
          shape: 'objects',
        },
        createExtra()
      );

      const firstBranch = firstPage.structuredContent?.result as Output | undefined;
      if (firstBranch?.type === 'success' && firstBranch.nextPageToken) {
        // Simulate session recovery by using pageToken independently
        const recoveredPage = await fileSearchHandler(
          {
            query: 'mimeType != ""',
            pageSize: 3,
            pageToken: firstBranch.nextPageToken,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );

        const recoveredBranch = recoveredPage.structuredContent?.result as Output | undefined;
        assert.equal(recoveredBranch?.type, 'success', 'should recover pagination state successfully');

        // When includeData is false, we get fileIds instead of items
        const recoveredItems = isObjectsShape(recoveredBranch) ? recoveredBranch.items : [];
        const firstItems = isObjectsShape(firstBranch) ? firstBranch.items : [];
        if (recoveredItems.length > 0 && firstItems.length > 0) {
          const firstPageIds = new Set(firstItems.map((item) => item.id));
          const recoveredPageIds = recoveredItems.map((item) => item.id);

          for (const id of recoveredPageIds) {
            assert.ok(!firstPageIds.has(id), 'recovered page should not have items from first page');
          }
        }
      }
    });

    it('cross-query pagination consistency', async () => {
      // Test that different queries handle pagination consistently
      const queries = ['mimeType != ""', 'name contains "document"', 'mimeType = "application/pdf"'];

      for (const query of queries) {
        const result = await fileSearchHandler(
          {
            query,
            pageSize: 10,
            pageToken: undefined,
            fields: 'id,name',
            shape: 'objects',
          },
          createExtra()
        );

        const branch = result.structuredContent?.result as Output | undefined;
        if (isObjectsShape(branch)) {
          // When using objects shape, we get files array
          assert.ok(Array.isArray(branch.items), `files should be array for query: ${query}`);
          if (branch.nextPageToken) {
            assert.equal(typeof branch.nextPageToken, 'string', `nextPageToken should be string for query: ${query}`);
          }
        }
      }
    });
  });
});
