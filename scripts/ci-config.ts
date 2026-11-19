import type { CiConfig } from './lib/ci-setup.ts';

export const config = {
  provider: 'google',
  flows: [
    {
      id: 'mcp-drive',
      refreshTokenSecret: 'TEST_REFRESH_TOKEN',
      scopeSecret: 'TEST_SCOPE',
      clientIdSecret: 'GOOGLE_CLIENT_ID',
      clientSecretSecret: 'GOOGLE_CLIENT_SECRET',
      clientSecretRequired: false,
      tenantSecret: null,
      storage: {
        kind: 'account',
        path: '.tokens/store.json',
        service: 'mcp-drive',
        accountId: {
          env: 'TEST_ACCOUNT_ID',
        },
      },
    },
  ],
  requiredTestSecrets: ['TEST_SHARED_DRIVE_ID'],
  serviceAccount: {
    output: 'service-account.test.json',
    secrets: {
      private_key: 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
      private_key_id: 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID',
      client_email: 'GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL',
      client_id: 'GOOGLE_SERVICE_ACCOUNT_CLIENT_ID',
      project_id: 'GOOGLE_SERVICE_ACCOUNT_PROJECT_ID',
      auth_uri: 'GOOGLE_SERVICE_ACCOUNT_AUTH_URI',
      token_uri: 'GOOGLE_SERVICE_ACCOUNT_TOKEN_URI',
    },
  },
} as const satisfies CiConfig;
