# @mcp-z/mcp-drive

Docs: https://mcp-z.github.io/mcp-drive
Google Drive MCP server for searching files, browsing folders, and managing Drive content.

## Common uses

- Search files and folders
- Browse folder contents and paths
- Move, create, and trash Drive items

## Transports

MCP supports stdio and HTTP.

**Stdio**
```json
{
  "mcpServers": {
    "drive": {
      "command": "npx",
      "args": ["-y", "@mcp-z/mcp-drive"]
    }
  }
}
```

**HTTP**
```json
{
  "mcpServers": {
    "drive": {
      "type": "http",
      "url": "http://localhost:9001/mcp",
      "start": {
        "command": "npx",
        "args": ["-y", "@mcp-z/mcp-drive", "--port=9001"]
      }
    }
  }
}
```

`start` is an extension used by `npx @mcp-z/cli up` to launch HTTP servers for you.

## Create a Google Cloud app

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the Google Drive API.
4. Create OAuth 2.0 credentials (Desktop app).
5. Copy the Client ID and Client Secret.

## OAuth modes

Configure via environment variables or the `env` block in `.mcp.json`. See `server.json` for the full list of options.

### Loopback OAuth (default)

Environment variables:

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Example:
```json
{
  "mcpServers": {
    "drive": {
      "command": "npx",
      "args": ["-y", "@mcp-z/mcp-drive"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Service account

Environment variables:

```bash
AUTH_MODE=service-account
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/path/to/service-account.json
```

Example:
```json
{
  "mcpServers": {
    "drive": {
      "command": "npx",
      "args": ["-y", "@mcp-z/mcp-drive", "--auth=service-account"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_FILE": "/path/to/service-account.json"
      }
    }
  }
}
```

### DCR (self-hosted)

HTTP only. Requires a public base URL.

```json
{
  "mcpServers": {
    "drive-dcr": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-z/mcp-drive",
        "--auth=dcr",
        "--port=3456",
        "--base-url=https://oauth.example.com"
      ],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## How to use

```bash
# List tools
mcp-z inspect --servers drive --tools

# Call a tool
mcp-z call drive files-search '{"query":"name contains \\\"report\\\""}'
```

## Tools

1. file-move
2. file-move-to-trash
3. files-search
4. folder-contents
5. folder-create
6. folder-path
7. folder-search

## Resources

1. file

## Prompts

1. organize-files
2. query-syntax

## Configuration reference

See `server.json` for all supported environment variables, CLI arguments, and defaults.
