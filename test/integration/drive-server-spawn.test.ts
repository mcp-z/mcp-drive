/**
 * Drive Server Spawn Integration Test
 *
 * Tests server spawning with stdio using @mcp-z/cli infrastructure.
 */

import '../lib/env-loader.ts';
import { createServerRegistry, type ManagedClient, type ServerRegistry } from '@mcp-z/client';
import assert from 'assert';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import * as path from 'path';
import { requiredEnv } from 'portable-env';
import { fileURLToPath, pathToFileURL } from 'url';
import { throwFailures } from '../lib/throw-failures.ts';

describe('Drive Server Spawn Integration', () => {
  let client: ManagedClient;
  let registry: ServerRegistry | undefined;
  let projectDir: string | undefined;
  let spawnAttempted = false;

  before(async () => {
    const clientId = requiredEnv('GOOGLE_CLIENT_ID');
    const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const serverPath = path.join(serverRoot, 'bin/server.js');

    // The discovered project owns logs and stores instead of the user's home directory.
    projectDir = path.join(serverRoot, '.tmp', `drive-spawn-test-${randomUUID()}`);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.mcp.json'), '{ "mcpServers": {} }\n');
    const stateDir = path.join(projectDir, '.mcp-z');

    spawnAttempted = true;
    registry = createServerRegistry(
      {
        drive: {
          command: process.execPath,
          args: [serverPath, '--headless', '--stdio'],
          env: {
            NODE_ENV: 'test',
            GOOGLE_CLIENT_ID: clientId,
            GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
            HEADLESS: 'true',
            LOG_LEVEL: 'error',
            TOKEN_STORE_URI: pathToFileURL(path.join(stateDir, 'tokens.json')).href,
            DCR_STORE_URI: pathToFileURL(path.join(stateDir, 'dcr.json')).href,
            RESOURCE_STORE_URI: pathToFileURL(path.join(stateDir, 'files')).href,
          },
        },
      },
      { cwd: projectDir }
    );

    client = await registry.connect('drive');
  });

  after(async () => {
    const failures: unknown[] = [];
    // registry.close() owns the client and the child; only a resolved close proves the child has exited.
    let childClosed = !spawnAttempted;
    if (registry) {
      try {
        const result = await registry.close();
        childClosed = true;
        assert.deepStrictEqual({ timedOut: result.timedOut, killedCount: result.killedCount }, { timedOut: false, killedCount: 0 }, 'Server should shut down cooperatively');
      } catch (error) {
        failures.push(error);
      }
    }
    if (projectDir && childClosed) {
      try {
        safeRmSync(projectDir, { recursive: true, force: true });
      } catch (error) {
        failures.push(error);
      }
    } else if (projectDir) {
      failures.push(new Error(`Server closure unconfirmed; retained scratch ${projectDir}`));
    }
    throwFailures('Drive spawn test teardown failed', failures);
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
