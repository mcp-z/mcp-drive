/**
 * Create test context authenticated as a service account.
 *
 * The loopback context in create-middleware-context.ts authenticates as a human
 * test account and is what most suites use. This one exists for the shared-drive
 * specs: a service account has no Drive storage quota of its own, so a shared
 * drive is the only place it can hold content, which makes it the identity that
 * shared-drive support actually has to work for.
 *
 * Unlike the loopback provider there is no token store and no account list to
 * validate - a service account is a single static identity, fixed under the
 * account id 'service-account', and mints its own tokens from the key file.
 */

import { ServiceAccountProvider } from '@mcp-z/oauth-google';
import { GOOGLE_SCOPE } from '../../src/constants.ts';
import { googleAuth } from '../../src/lib/google-auth.ts';
import type { Logger } from '../../src/types.ts';
import { requiredEnv } from './env-loader.ts';

export default async function createServiceAccountContext() {
  const keyFilePath = requiredEnv('GOOGLE_SERVICE_ACCOUNT_KEY_FILE');

  const logger: Logger = {
    debug: (_msg: string, _meta?: Record<string, unknown>) => {},
    info: (_msg: string, _meta?: Record<string, unknown>) => {},
    warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  };

  // Mirrors how src/setup/oauth-google.ts builds the provider in service-account mode.
  const authProvider = new ServiceAccountProvider({
    keyFilePath,
    scopes: GOOGLE_SCOPE.split(' '),
    logger,
  });

  return {
    middleware: authProvider.authMiddleware(),
    auth: googleAuth(authProvider.toAuthProvider('service-account')),
    logger,
  };
}
