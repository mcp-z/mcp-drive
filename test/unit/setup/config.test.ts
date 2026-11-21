import '../../lib/env-loader.ts';
import { setup } from '@mcp-z/mcp-drive';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

describe('setup.parseConfig', () => {
  it('defaults to stdio transport with no args or env', () => {
    const config = setup.parseConfig([], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.transport.type, 'stdio');
  });

  it('defaults headless to true for tests', () => {
    const config = setup.parseConfig([], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      HEADLESS: 'true', // Explicit HEADLESS env var (no NODE_ENV magic)
    });

    assert.strictEqual(config.headless, true);
  });

  it('uses --headless CLI arg to override env var', () => {
    const config = setup.parseConfig(['--headless'], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      HEADLESS: 'false', // Env says false, but CLI arg overrides
    });

    // CLI arg --headless should override HEADLESS env var
    assert.strictEqual(config.headless, true);
  });

  it('parses config from env object parameter', () => {
    const testEnv = {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    };

    const config = setup.parseConfig([], testEnv);

    assert.strictEqual(config.clientId, 'test-client-id');
    assert.strictEqual(config.clientSecret, 'test-client-secret');
  });

  it('uses empty array for args when no CLI arguments provided', () => {
    const config = setup.parseConfig([], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    // Should parse successfully without CLI args
    assert.strictEqual(config.transport.type, 'stdio');
  });

  it('parses HTTP port from CLI --port flag', () => {
    const config = setup.parseConfig(['--port=4000'], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.transport.type, 'http');
    assert.strictEqual(config.transport.port, 4000);
    assert.strictEqual(config.auth, 'loopback-oauth'); // Default auth mode
    // redirectUri is only set when explicitly provided via --redirect-uri
    assert.strictEqual(config.redirectUri, undefined);
  });

  it('parses HTTP port from PORT env var', () => {
    const config = setup.parseConfig([], {
      PORT: '4000',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.transport.type, 'http');
    assert.strictEqual(config.transport.port, 4000);
    assert.strictEqual(config.auth, 'loopback-oauth'); // Default auth mode
    // redirectUri is only set when explicitly provided via --redirect-uri
    assert.strictEqual(config.redirectUri, undefined);
  });

  it('CLI --port flag overrides PORT env var', () => {
    const config = setup.parseConfig(['--port=5000'], {
      PORT: '4000',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.transport.type, 'http');
    assert.strictEqual(config.transport.port, 5000); // CLI flag wins
    // redirectUri is only set when explicitly provided via --redirect-uri
    assert.strictEqual(config.redirectUri, undefined);
  });

  it('parses --redirect-uri when explicitly provided', () => {
    const config = setup.parseConfig(['--redirect-uri=https://example.com/callback'], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.redirectUri, 'https://example.com/callback');
  });

  it('parses --stdio explicitly', () => {
    const config = setup.parseConfig(['--stdio'], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.transport.type, 'stdio');
  });

  it('defaults to loopback-oauth auth mode', () => {
    const config = setup.parseConfig([], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.auth, 'loopback-oauth');
  });

  it('defaults to loopback-oauth auth mode', () => {
    const config = setup.parseConfig([], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.auth, 'loopback-oauth');
  });

  it('parses --auth=loopback-oauth', () => {
    const config = setup.parseConfig(['--auth=loopback-oauth'], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.auth, 'loopback-oauth');
  });

  it('defaults logLevel to info', () => {
    const config = setup.parseConfig([], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.logLevel, 'info');
  });

  it('parses LOG_LEVEL from env', () => {
    const config = setup.parseConfig([], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      LOG_LEVEL: 'debug',
    });

    assert.strictEqual(config.logLevel, 'debug');
  });

  it('parses --log-level from CLI', () => {
    const config = setup.parseConfig(['--log-level=error'], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    });

    assert.strictEqual(config.logLevel, 'error');
  });

  it('CLI --log-level overrides LOG_LEVEL env var', () => {
    const config = setup.parseConfig(['--log-level=warn'], {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      LOG_LEVEL: 'debug',
    });

    assert.strictEqual(config.logLevel, 'warn');
  });
});

interface ServerJsonEntry {
  name: string;
  value?: string;
  default?: string;
  placeholder?: string;
}
interface ServerJsonPackage {
  environmentVariables?: ServerJsonEntry[];
  packageArguments?: ServerJsonEntry[];
}

describe('resource store default', () => {
  const config = setup.parseConfig([], { GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_CLIENT_SECRET: 'test-client-secret' });
  const server = JSON.parse(fs.readFileSync(path.resolve('server.json'), 'utf8')) as { packages: ServerJsonPackage[] };
  const entries = server.packages.flatMap((pkg) => [...(pkg.environmentVariables ?? []), ...(pkg.packageArguments ?? [])]).filter((e) => e.name === 'RESOURCE_STORE_URI' || e.name === '--resource-store-uri');

  it('server.json has the resource store entries', () => {
    assert.strictEqual(entries.length, server.packages.length * 2);
  });

  it('server.json pins no value or default', () => {
    for (const entry of entries) {
      assert.strictEqual(entry.value, undefined, `${entry.name} carries value`);
      assert.strictEqual(entry.default, undefined, `${entry.name} carries default`);
    }
  });

  // The placeholder is the home form of the default; the real default depends on the nearest .mcp.json.
  it('server.json placeholder shows the server default', () => {
    for (const entry of entries.filter((e) => e.name === 'RESOURCE_STORE_URI')) assert.strictEqual(entry.placeholder, `file://~/.mcp-z/${config.name}/files`);
  });

  it('default resource store is <baseDir>/<name>/files', () => {
    assert.strictEqual(config.resourceStoreUri, pathToFileURL(path.join(config.baseDir, config.name, 'files')).href);
  });
});
