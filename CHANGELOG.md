# Changelog

## [2.3.0] - 2026-09-07

### Added

- Shared drive support across every tool. Drive omits shared-drive items from `files.*` calls unless `supportsAllDrives` is set, so folder create, search, contents and path, and file search, move and trash could not see or act on anything living in a shared drive; only `drive-file-upload`'s create call carried the flag. Every call now sets it, the `drive-file` resource included. This is what makes a service account deployment workable: a service account has no Drive storage quota of its own, so its content belongs in a shared drive it has been added to as a member.

### Changed

- `drive-files-search`, `drive-folder-search` and `drive-folder-contents` search across shared drives, not just My Drive. `files.list` needs three parameters together to reach them, and Drive rejects the request if any is missing: `corpora: 'allDrives'`, because the default `user` corpus omits shared drives entirely; `includeItemsFromAllDrives`; and `supportsAllDrives`. An account that belongs to shared drives will now see items from those drives in search and listing results alongside its My Drive items. Note that Drive treats the `allDrives` corpus as less efficient than a single-drive or user-scoped search.

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
