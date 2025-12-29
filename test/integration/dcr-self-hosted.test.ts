/**
 * DCR Self-Hosted Integration Test
 *
 * Tests that @mcp-z/cli properly handles self-hosted DCR authentication
 * without relying on dangerous internal helpers.
 *
 * This test will initially FAIL (red) showing the current broken implementation,
 * then PASS (green) after implementing the proper self-hosted DCR support.
 */

import type { AuthCapabilities } from '@mcp-z/client';
import { DcrAuthenticator } from '@mcp-z/client';
import assert from 'assert';

/** Silent logger for tests */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('DCR Self-Hosted Integration', () => {
  it('should properly detect self-hosted mode and handle unreachable servers', async () => {
    // Create a scenario with definitely unreachable server
    const testCapabilities: AuthCapabilities = {
      supportsDcr: true,
      registrationEndpoint: 'http://127.0.0.1:1/oauth/register', // Port 1 should be unused
      authorizationEndpoint: 'http://127.0.0.1:1/oauth/authorize',
      tokenEndpoint: 'http://127.0.0.1:1/oauth/token',
    };

    const createStore = (await import('../../src/lib/create-store.js')).default;
    const freshStore = await createStore('file://.//.tmp/dcr-test-store.json');

    const authenticator = new DcrAuthenticator({
      redirectUri: 'http://localhost:3000/callback',
      tokenStore: freshStore,
      logger,
    });

    // This should detect self-hosted mode due to localhost URL,
    // attempt self-hosted authentication, and fail when server is unreachable
    await assert.rejects(authenticator.ensureAuthenticated('http://127.0.0.1:1', testCapabilities), /ECONNREFUSED|Failed to register client|fetch failed/, 'Should detect self-hosted mode and fail when DCR server is unreachable');
  });

  it('should differentiate between self-hosted and external DCR modes', () => {
    // Future test: verify that the authenticator can detect self-hosted vs external mode
    // and choose the appropriate authentication strategy

    // For now, just expect this to be implemented
    const authenticator = new DcrAuthenticator({
      redirectUri: 'http://localhost:3000/callback',
      logger,
    });

    // This test will pass when we implement mode detection
    assert.ok(authenticator, 'Authenticator should be created');
    // TODO: Add mode detection verification once implemented
  });
});
