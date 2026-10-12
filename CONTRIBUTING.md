# Contributing to @mcp-z/mcp-drive

MCP server for Google Drive integration with file operations, folder navigation, search capabilities, and sharing management

## Before Starting

A few conventions here differ from what you might expect:

- **Breaking changes over compatibility.** This project has no compatibility burden yet. Do not add back-compat layers, migration utilities, or wrappers for deprecated APIs - change the API cleanly and bump the major.
- **Keep it approachable.** This is a small community project, not an enterprise codebase. Prefer the simplest solution that fits in the existing files over new abstractions, frameworks, or shared infrastructure.
- **Tests run against real services, not mocks.** Suites call live provider APIs with real credentials, so you need your own test account configured through the shell, CI, or an optional `.env.test` file copied from `.env.test.example`. File values override matching inherited values. A test that fails on credentials is reported, not skipped or loosened.
- **Never write to stdout in server code.** MCP speaks JSON-RPC over stdio; a stray `console.log` corrupts the protocol stream. Use the injected logger, which writes to stderr.
- **Test scratch goes in the package's gitignored `.tmp/`**, never `os.tmpdir()`.

## Branches

`master` is the only maintained release line. The 1.x line is retired and receives no fixes. All changes target `master`.

## Pre-Commit Commands

Install ts-dev-stack globally if not already installed:

```bash
npm install -g ts-dev-stack
```

Run before committing - this builds, type-checks, lints, and tests:

```bash
tsds validate
```

`tsds validate` also runs automatically on `npm publish` via the `prepublishOnly` hook; a failure blocks the publish.

## Testing

```bash
npm run test:setup    # Generate OAuth tokens (interactive, run once)
npm test              # Run the test suite
npm run test:engines  # Run the suite across every supported Node version
```

Specs live in `test/unit/`, mirroring `src/`. Cross-service specs live in `test/integration/`. Both run under `npm test`.

## Package Development

See `README.md` for package overview and usage.

## GitHub Actions

Trusted master pushes and the CI workflow's manual entrypoint call this commit's Tests workflow. Ubuntu runs first; Windows starts only after Ubuntu succeeds. Each platform runs Node 26, npm ci, prepublish validation, full npm test with --bail and the full admitted Node engine sweep with --bail. Canonical test and test:ci scripts share full discovery. macOS coverage runs locally.

Pull requests receive no provider credentials. Their Linux/Windows jobs validate and run the three export smokes, all local unit tests and both stdio discovery suites on the current runtime and admitted engines. Nonsecret GOOGLE_CLIENT_ID=test-client-id and HEADLESS=true satisfy discovery startup. Private per-suite projects own .mcp.json, logs and store paths; the registry must confirm child closure before scratch removal. Protocol discovery does not invoke Drive tools or exchange provider tokens. A green PR job certifies this local selection only.

The full Drive suite has no browser-consent tests or manual skip guards. TEST_INCLUDE_MANUAL=false remains CI configuration; it does not exclude Drive tests. npm run test:setup is the maintainer's interactive local provisioning command. Real provider suites fail on missing or refused credentials, permissions or quota.

### Trusted tests

Tests is reusable by trusted master CI and manually dispatchable from master for a chosen platform. The existing scripts/ci-tokens.ts owns account seeding, refresh-token persistence and cleanup. Full normal and engine runs use all tests. nvu runs engines sequentially but continues later engines after a failed one; --bail stops only the failing runtime. No automatic retry is configured. A failed Ubuntu job prevents Windows from starting.

The credential-consuming job uses the master-only live-test environment and one repository-wide live-provider-tests concurrency group. Active jobs are not cancelled by newer pushes; pending jobs use queue:max. This lock covers seeding through persistence and cleanup across automatic and manual entrypoints. Each job reads environment secrets when it starts. Local consent commands and other repositories do not share the lock; coordinate shared Google grants, accounts and quotas before execution. Forced cancellation, timeouts and runner loss can prevent finalizers, so inspect their terminal outcomes.

The configured test account needs a valid Google refresh grant for the production scopes in src/constants.ts and permissions/storage for file creation, read, update, trash and deletion. Shared-drive fixtures require a hand-provisioned Workspace drive; the human test account and the service account must have Manager access. The service account's shared-drive cases create and find owned folders and permanently delete their fixtures. The shared drive itself is never created or deleted by tests.

Configure these individual environment secrets from this repository's test configuration and token owner. GOOGLE_CLIENT_SECRET is optional for public clients; confidential apps require the matching secret. The other names are required:

- `CI_SECRETS_TOKEN`
- `TEST_ACCOUNT_ID`
- `TEST_REFRESH_TOKEN`
- `TEST_SCOPE`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TEST_SHARED_DRIVE_ID`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID`
- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_CLIENT_ID`
- `GOOGLE_SERVICE_ACCOUNT_PROJECT_ID`
- `GOOGLE_SERVICE_ACCOUNT_AUTH_URI`
- `GOOGLE_SERVICE_ACCOUNT_TOKEN_URI`

`CI_SECRETS_TOKEN` is a fine-grained GitHub PAT with this repository selected and **Environments: Read and write**. GitHub's default workflow token cannot update environment secrets; see the [environment-secret API permissions](https://docs.github.com/en/rest/actions/secrets#create-or-update-an-environment-secret). Keep the PAT's expiry visible to the maintainer; do not use the local broad GitHub login as a CI secret. Provider refresh tokens and GitHub authorization have separate lifetimes.

The seeder validates configuration, renews provider credentials, saves private runner files, and writes replacement refresh tokens back to environment secrets before tests run. An always-run finalizer saves subsequent replacements even when tests fail, then removes runner credential files. Credentials are not cached or uploaded as artifacts. Missing configuration, failed renewal and failed persistence fail the job; CI never opens a consent screen. After provider revocation or expiry, reauthorize locally with the existing setup command and reseed that repository's refresh-token secrets.

Google external apps in Testing can issue seven-day refresh tokens for these scopes; successful access-token renewal does not remove that policy. Confirm the existing project's consent publishing configuration before relying on long-term unattended runs. See [Google's token lifecycle documentation](https://developers.google.com/identity/protocols/oauth2).
