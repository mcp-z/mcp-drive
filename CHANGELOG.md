# Changelog

## [1.2.0] - 2026-09-08 — final 1.x release

**This is the last release on the 1.x line, and it is the 2.x code.** The entries below document
what is in it; the 1.x entries that used to head this file are on the `v1.1.4` tag.

The 1.x line is now end-of-life. Rather than backport fixes to it one at a time, this release
carries the whole 2.x tree, so a 1.x consumer gets every fix in one upgrade.

### Changed

- Internals moved from `@modelcontextprotocol/sdk` v1 to the v2 SDK, and the package now serves both
  the 2025 and 2026-07-28 protocol revisions. See the 2.x entries below for what changed.

### Migrating to 2.x

`npm install @mcp-z/mcp-drive@latest`. If you import types from `@mcp-z/server`, two names moved:
`McpError` → `ProtocolError` and `RequestHandlerExtra` → `ServerContext`.

### Support

None. There will be no further 1.x releases, including for security. Fixes land on 2.x.

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
