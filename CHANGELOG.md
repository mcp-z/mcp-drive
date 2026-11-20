# Changelog

## [2.6.1] - 2026-11-19

### Security

- In `--auth=dcr` mode every MCP request now needs a valid bearer token. Before, `/mcp` answered `initialize`, `tools/list` and the other methods with 200 and no token, and only tool calls were refused. Requests without a valid token now get 401 with a `WWW-Authenticate` challenge naming the server's resource metadata; this changes behaviour for anyone who relied on the open endpoint. Clients that sign in through the server's OAuth flow are unaffected. Requires `@mcp-z/server` 2.4.0 and `@mcp-z/oauth-google` 2.4.3.

### Removed

- The external DCR mode settings `--dcr-mode=external`, `DCR_MODE=external`, `--dcr-verify-url` and `DCR_VERIFY_URL` are gone from the help text and `server.json`. They never had an effect: the server always ran its own sign-in endpoints. With `--auth=dcr`, a server started with external mode, or with a verify URL, now stops at start with an error saying so instead of ignoring the setting; in other auth modes the settings are still ignored and nothing stops. `--dcr-mode=self-hosted` and `DCR_MODE=self-hosted` still work.

### Fixed

- The `DCR_STORE_URI` entry in `server.json` no longer carries a fixed default with a wrong path, so `mcp-z` manifest generation does not write one into a configuration. The server's own default is `.mcp-z/dcr.json`.
- `--dcr-store-uri` is honoured. It was documented but ignored, so only `DCR_STORE_URI` chose where DCR registrations were stored; the flag now wins over the variable.
- Two mcp-z servers, or two sessions of one server, sharing `.mcp-z/tokens.json` no longer undo each other's sign-ins and sign-outs, and each sees the others' changes without restarting. Existing sign-ins are kept. The file is now written with mode 0600 on macOS and Linux. Upgrade every mcp-z server and the cli together: an older one running beside this one still rewrites the file. A damaged `tokens.json` or `dcr.json` now stops the server at start with an error naming the file, instead of being overwritten. Requires `keyv-registry` 3.1.0.
- A failed start in stdio mode no longer prints a second `sonic boom is not ready yet` error after the real one, and the log keeps its last lines.

## [2.6.0]

### Changed

- On first start, sign-ins saved by earlier versions (`TOKEN_STORE_URI` and `DCR_STORE_URI`, default namespace only) are moved to the keyv 6 storage format, and the server logs "Moved N saved sign-in entries to the keyv 6 format" when it moves any. Nothing is moved on later starts.
- Upgrade servers that share one token file together: once one has moved the entries, an earlier version no longer finds them and asks you to sign in again.
- With a `sqlite://` token store opened by several servers at once on the first start after upgrading, one of them may fail once with "database is locked". Start it again.
- Old `duckdb://` data in `~/.keyv-duckdb/store.duckdb` is not moved (keyv 5 wrote it there whatever the URI said), so those sign-ins are lost and you sign in again. That file holds tokens; delete it.
- Storage adapters you install yourself for `TOKEN_STORE_URI` / `DCR_STORE_URI` (for example `@keyv/redis`) should be keyv 6 releases.

## [2.5.0] - 2026-11-15

### Added

- Private settings such as the OAuth client ID and secret can live in a file instead of the shell: the first file found of `<baseDir>/mcp-drive/.env` (the `.mcp-z` folder beside the nearest `.mcp.json`, else in the home folder) and `~/.config/mcp-z/mcp-drive/.env`. Non-empty environment values win over the file. On macOS and Linux a file readable by other accounts is refused. Requires `@mcp-z/server` 2.3.0.

## [2.4.0] - 2026-09-07

### Changed

- Clients speaking the 2026-07-28 protocol revision now receive cache hints on list results: `tools/list`, `prompts/list`, `resources/templates/list` and `server/discover` carry a five-minute TTL and `cacheScope: 'public'`, while `resources/list` and `resources/read` stay `private` with no TTL because they vary by account. Previously every cacheable result used the SDK's conservative `ttlMs: 0` / `private` default, which caches nothing. 2025-era clients are unaffected — the fields do not exist on that revision.
- Tools, resources and prompts are now registered in name order, so `tools/list` returns the same order from every connection and a client can keep a cached catalog valid across a reconnect. The listed order differs from previous releases; no tool is added, removed or renamed.

## [2.3.0] - 2026-09-07

### Added

- Shared drive support across every tool. Drive omits shared-drive items from `files.*` calls unless `supportsAllDrives` is set, so folder create, search, contents and path, and file search, move and trash could not see or act on anything living in a shared drive; only `drive-file-upload`'s create call carried the flag. Every call now sets it, the `drive-file` resource included. This is what makes a service account deployment workable: a service account has no Drive storage quota of its own, so its content belongs in a shared drive it has been added to as a member.

### Changed

- `drive-files-search`, `drive-folder-search` and `drive-folder-contents` search across shared drives, not just My Drive. `files.list` needs three parameters together to reach them, and Drive rejects the request if any is missing: `corpora: 'allDrives'`, because the default `user` corpus omits shared drives entirely; `includeItemsFromAllDrives`; and `supportsAllDrives`. An account that belongs to shared drives will now see items from those drives in search and listing results alongside its My Drive items.

## [2.1.1] - 2026-09-06

### Changed

- Depends on `@googleapis/drive` instead of the `googleapis` meta-package. Same generated client and the same `*_v*` types, from the same source; `googleapis` ships every Google API, and this package uses one or two of them. The installed SDK drops from 206 MB to 3 MB.

## [2.1.0] - 2026-09-06

### Fixed

- Works with `@mcp-z/oauth-google` 2.0.1, which replaced `toAuth()` with a token provider. Version 2.0.0 of this package resolves that release through its `^2.0.0` range and fails at runtime on any Google API call. Upgrade.

## [2.0.0] - 2026-09-06

### Changed

- Migrated to the v2 MCP SDK. `McpError`/`ErrorCode` are `ProtocolError`/`ProtocolErrorCode`, reached through `@mcp-z/server`; wire codes are unchanged.
- The 1.x line is maintained on `support/1.x` and published under the `support-1` dist-tag.

## [1.1.3] - 2026-09-05

### Fixed

- Origin validation and loopback bind for the HTTP transport (DNS rebinding).

## [1.1.0] - 2026-08-29

### Changed

- Exports smoke tests added.

## [1.0.0] - 2025-12-29

Initial release.
