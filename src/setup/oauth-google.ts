import { type AccountAuthProvider, AccountServer } from '@mcp-z/oauth';
import type { CachedToken } from '@mcp-z/oauth-google';
import { createDcrRouter, createLoopbackCallbackRouter, DcrOAuthProvider, LoopbackOAuthProvider, ServiceAccountProvider } from '@mcp-z/oauth-google';
import type { Logger, PromptModule, ToolModule } from '@mcp-z/server';
import type { Router } from 'express';
import type { Keyv } from 'keyv';
import { GOOGLE_SCOPE } from '../constants.ts';
import type { ServerConfig } from '../types.ts';

/**
 * Drive OAuth runtime dependencies
 */
export interface OAuthRuntimeDeps {
  logger: Logger;
  tokenStore: Keyv<CachedToken>;
  dcrStore?: Keyv<unknown>;
}

/**
 * Auth middleware wrapper with withToolAuth/withResourceAuth/withPromptAuth methods
 * Uses structural constraints to avoid contravariance issues with handler types.
 */
export interface AuthMiddleware {
  withToolAuth<T extends { name: string; config: unknown; handler: unknown }>(module: T): T;
  withResourceAuth<T extends { name: string; template?: unknown; config?: unknown; handler: unknown }>(module: T): T;
  withPromptAuth<T extends { name: string; config: unknown; handler: unknown }>(module: T): T;
}

/**
 * Result of OAuth adapter creation
 */
export interface OAuthAdapters {
  primary: LoopbackOAuthProvider | ServiceAccountProvider | DcrOAuthProvider;
  middleware: AuthMiddleware;
  authAdapter: AccountAuthProvider;
  accountTools: ToolModule[];
  accountPrompts: PromptModule[];
  dcrRouter?: Router;
  loopbackRouter?: Router;
}

/**
 * Create Drive OAuth adapters based on transport configuration
 *
 * Returns primary adapter (loopback or service account), pre-configured middleware,
 * auth email provider, and pre-selected account tools based on auth mode.
 *
 * Primary adapter selection is based on auth mode:
 * - 'loopback-oauth': LoopbackOAuthProvider (interactive OAuth with token storage)
 * - 'service-account': ServiceAccountProvider (JWT-based authentication)
 *
 * @param config - Server configuration (transport + auth settings)
 * @param deps - Runtime dependencies (logger, tokenStore, etc.)
 * @returns OAuth adapters with pre-configured middleware and account tools
 * @throws Error if service account mode but no key file provided
 */
export async function createOAuthAdapters(config: ServerConfig, deps: OAuthRuntimeDeps, baseUrl?: string): Promise<OAuthAdapters> {
  const { logger, tokenStore, dcrStore } = deps;
  const resolvedBaseUrl = baseUrl ?? config.baseUrl;
  const oauthStaticConfig = {
    service: config.name,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scope: GOOGLE_SCOPE,
    auth: config.auth,
    headless: config.headless,
    redirectUri: config.transport.type === 'stdio' ? undefined : config.redirectUri,
    ...(config.serviceAccountKeyFile && { serviceAccountKeyFile: config.serviceAccountKeyFile }),
    ...(resolvedBaseUrl && { baseUrl: resolvedBaseUrl }),
  };

  // Create primary adapter based on auth mode
  let primary: LoopbackOAuthProvider | ServiceAccountProvider | DcrOAuthProvider;

  // DCR mode - Dynamic Client Registration with HTTP-only support
  if (oauthStaticConfig.auth === 'dcr') {
    logger.debug('Creating DCR provider', { service: oauthStaticConfig.service });

    // DCR requires dcrStore and baseUrl
    if (!dcrStore) {
      throw new Error('DCR mode requires dcrStore to be configured');
    }
    if (!oauthStaticConfig.baseUrl) {
      throw new Error('DCR mode requires baseUrl to be configured');
    }

    // Create DcrOAuthProvider (stateless provider that receives tokens from verification context)
    primary = new DcrOAuthProvider({
      clientId: oauthStaticConfig.clientId,
      ...(oauthStaticConfig.clientSecret && { clientSecret: oauthStaticConfig.clientSecret }),
      scope: oauthStaticConfig.scope,
      verifyEndpoint: `${oauthStaticConfig.baseUrl}/oauth/verify`,
      logger,
    });

    // Create DCR OAuth router with authorization server endpoints
    const dcrRouter = createDcrRouter({
      store: dcrStore,
      issuerUrl: oauthStaticConfig.baseUrl,
      baseUrl: oauthStaticConfig.baseUrl,
      scopesSupported: oauthStaticConfig.scope.split(' '),
      clientConfig: {
        clientId: oauthStaticConfig.clientId,
        ...(oauthStaticConfig.clientSecret && { clientSecret: oauthStaticConfig.clientSecret }),
      },
    });

    // DCR uses bearer token authentication with middleware validation
    const middleware = primary.authMiddleware();

    // Create auth email provider (stateless)
    const authAdapter: AccountAuthProvider = {
      getAccessToken: () => {
        throw new Error('DCR mode does not support getAccessToken - tokens are provided via bearer auth');
      },
      getUserEmail: () => {
        throw new Error('DCR mode does not support getUserEmail - tokens are provided via bearer auth');
      },
    };

    // No account management tools for DCR
    const accountTools: ToolModule[] = [];
    const accountPrompts: PromptModule[] = [];

    return { primary, middleware: middleware as unknown as AuthMiddleware, authAdapter, accountTools, accountPrompts, dcrRouter };
  }

  if (config.auth === 'service-account') {
    // Service account mode - JWT-based authentication
    if (!oauthStaticConfig.serviceAccountKeyFile) {
      throw new Error('Service account key file is required when auth mode is "service-account". ' + 'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE environment variable or use --service-account-key-file flag.');
    }

    logger.debug('Creating service account provider', { service: oauthStaticConfig.service });
    primary = new ServiceAccountProvider({
      keyFilePath: oauthStaticConfig.serviceAccountKeyFile,
      scopes: oauthStaticConfig.scope.split(' '),
      logger,
    });
  } else {
    // Loopback mode - interactive OAuth with token storage
    logger.debug('Creating loopback OAuth provider', { service: oauthStaticConfig.service });
    primary = new LoopbackOAuthProvider({
      service: oauthStaticConfig.service,
      clientId: oauthStaticConfig.clientId,
      clientSecret: oauthStaticConfig.clientSecret,
      scope: oauthStaticConfig.scope,
      headless: oauthStaticConfig.headless,
      logger,
      tokenStore,
      ...(oauthStaticConfig.redirectUri !== undefined && {
        redirectUri: oauthStaticConfig.redirectUri,
      }),
    });
  }

  // Create auth email provider (used by account management tools)
  const authAdapter: AccountAuthProvider = primary;

  // Select middleware AND account tools based on auth mode
  let middleware: ReturnType<LoopbackOAuthProvider['authMiddleware']>;
  let accountTools: ToolModule[];
  let accountPrompts: PromptModule[];

  if (oauthStaticConfig.auth === 'service-account') {
    // Service account mode - no account management tools needed (single identity)
    middleware = primary.authMiddleware();
    accountTools = [];
    accountPrompts = [];
    logger.debug('Service account mode - no account tools', { service: oauthStaticConfig.service });
  } else {
    // Loopback OAuth - multi-account mode
    middleware = primary.authMiddleware();

    const result = AccountServer.createLoopback({
      service: oauthStaticConfig.service,
      store: tokenStore,
      logger,
      auth: authAdapter,
    });
    accountTools = result.tools as ToolModule[];
    accountPrompts = result.prompts as PromptModule[];
    logger.debug('Loopback OAuth (multi-account mode)', { service: oauthStaticConfig.service });
  }

  const loopbackRouter = primary instanceof LoopbackOAuthProvider && oauthStaticConfig.redirectUri ? createLoopbackCallbackRouter(primary) : undefined;

  return { primary, middleware: middleware as unknown as AuthMiddleware, authAdapter, accountTools, accountPrompts, loopbackRouter };
}
