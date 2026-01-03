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
6. Select your MCP transport (stdio for local and http for remote) and platform
- For stdio, choose "APIs & Services", + Create client, "Desktop app" type
- For http, choose "APIs & Services", + Create client, "Web application" type, add your URL (default is http://localhost:3000/oauth/callback based on the --port or PORT)
- For local hosting, add "http://127.0.0.1" for [Ephemeral redirect URL](https://en.wikipedia.org/wiki/Ephemeral_port)
7. Enable OAuth2 [scopes](https://console.cloud.google.com/auth/scopes): openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive
8. Add [test emails](https://console.cloud.google.com/auth/audience)

## OAuth modes

Configure via environment variables or the `env` block in `.mcp.json`. See `server.json` for the full list of options.

### Loopback OAuth (default)

Environment variables:

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Example (stdio) - Create .mcp.json:
```json
{
  "mcpServers": {
    "drive": {
      "command": "npx",
      "args": ["-y", "@mcp-z/mcp-drive"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id"
      }
    }
  }
}
```

Example (http) - Create .mcp.json:
```json
{
  "mcpServers": {
    "drive": {
      "type": "http",
      "url": "http://localhost:3000",
      "start": {
        "command": "npx",
        "args": ["-y", "@mcp-z/mcp-drive", "--port=3000"],
        "env": {
          "GOOGLE_CLIENT_ID": "your-client-id"
        }
      }
    }
  }
}
```

Local (default): omit REDIRECT_URI → ephemeral loopback.
Cloud: set REDIRECT_URI to your public /oauth/callback and expose the service publicly.

Note: start block is a helper in "npx @mcp-z/cli up" for starting an http server from your .mpc.json. See [@mcp-z/cli](https://github.com/mcp-z/cli) for details.

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
