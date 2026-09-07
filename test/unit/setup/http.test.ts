import type { ServerConfig } from '@mcp-z/mcp-drive';
import { setup } from '@mcp-z/mcp-drive';
import assert from 'assert';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import getPort from 'get-port';
import * as path from 'path';

describe('createServer - transport initialization', () => {
  const servers: Awaited<ReturnType<typeof setup.createHTTPServer>>[] = [];
  let testContextPath: string;

  before(async () => {
    // Create isolated test context with pre-configured account
    const testId = randomUUID();
    testContextPath = path.join(process.cwd(), '.tmp', `.mcp-z-test-${testId}`);
    fs.mkdirSync(testContextPath, { recursive: true });
  });

  after(async () => {
    // Use close function to properly shut down all transports
    for (const result of servers) {
      await result.close();
    }

    // Clean up test context directory
    if (testContextPath && fs.existsSync(testContextPath)) {
      safeRmSync(testContextPath, { recursive: true, force: true });
    }
  });

  it('initializes HTTP transport with OAuth', async () => {
    const port = await getPort();

    const config: ServerConfig = {
      name: 'test-server',
      version: '0.0.0-test',
      transport: {
        type: 'http',
        port,
      },
      baseDir: testContextPath,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      headless: true,
      logLevel: 'error',
      auth: 'loopback-oauth',
      repositoryUrl: 'https://github.com/mcp-z/mcp-drive',
      resourceStoreUri: `file://${testContextPath}/files`,
    };

    const result = await setup.createHTTPServer(config);
    servers.push(result);

    assert.ok(result.logger, 'Logger should be initialized');
    assert.ok('httpServer' in result && result.httpServer, 'HTTP server should be initialized');
  });

  it('includes logger in server result', async () => {
    const port = await getPort();

    const config: ServerConfig = {
      name: 'test-server',
      version: '0.0.0-test',
      transport: { type: 'http', port },
      baseDir: testContextPath,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      headless: true,
      logLevel: 'error',
      auth: 'loopback-oauth',
      repositoryUrl: 'https://github.com/mcp-z/mcp-drive',
      resourceStoreUri: `file://${testContextPath}/files`,
    };

    const result = await setup.createHTTPServer(config);
    servers.push(result);

    assert.ok(result.logger, 'Result should have logger');
    assert.strictEqual(typeof result.logger.info, 'function', 'Logger should have info method');
    assert.strictEqual(typeof result.logger.error, 'function', 'Logger should have error method');
  });

  it('creates server with MCP server instance', async () => {
    const port = await getPort();

    const config: ServerConfig = {
      name: 'test-server',
      version: '0.0.0-test',
      transport: { type: 'http', port },
      baseDir: testContextPath,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      headless: true,
      logLevel: 'error',
      auth: 'loopback-oauth',
      repositoryUrl: 'https://github.com/mcp-z/mcp-drive',
      resourceStoreUri: `file://${testContextPath}/files`,
    };

    const result = await setup.createHTTPServer(config);
    servers.push(result);

    assert.strictEqual(typeof result.close, 'function', 'Result should have close function');
  });
});
