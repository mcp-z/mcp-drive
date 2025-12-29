/**
 * Drive Server Spawn Integration Test
 *
 * Tests server spawning with stdio using @mcp-z/cli infrastructure.
 */

import { createServerRegistry, type ManagedClient, type ServerRegistry } from '@mcp-z/client';
import assert from 'assert';

describe('Drive Server Spawn Integration', () => {
  let client: ManagedClient;
  let cluster: ServerRegistry;

  before(async () => {
    cluster = createServerRegistry(
      {
        drive: {
          command: 'node',
          args: ['bin/server.js', '--headless'],
          env: {
            NODE_ENV: 'test',
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
            GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
            HEADLESS: 'true',
            LOG_LEVEL: 'error',
          },
        },
      },
      { cwd: process.cwd() }
    );

    client = await cluster.connect('drive');
  });

  after(async () => {
    if (client) await client.close();
    if (cluster) await cluster.close();
  });

  it('should connect to Drive server', async () => {
    // Client is already connected via registry.connect() in before hook
    assert.ok(client, 'Should have connected Drive client');
  });

  it('should list tools via MCP protocol', async () => {
    const result = await client.listTools();

    assert.ok(result.tools, 'Should return tools');
    assert.ok(result.tools.length > 0, 'Should have at least one tool');

    // Verify specific tools exist
    const includes = (name: string) => result.tools.some((t) => t.name.includes(name));
    assert.ok(includes('files-search'), 'Should have files-search tool');
    assert.ok(includes('folder-search'), 'Should have folder-search tool');
    assert.ok(includes('folder-create'), 'Should have folder-create tool');
    assert.ok(includes('file-move'), 'Should have file-move tool');
  });
});
