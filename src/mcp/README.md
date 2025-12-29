# MCP Tools and Resources

Docs: https://mcp-z.github.io/mcp-drive
This directory contains MCP tool and resource implementations for Google Drive.

## Tools vs Resources: Authentication Patterns

MCP tools and resources have **fundamentally different handler signatures** imposed by the MCP SDK, which dictates how authentication must be implemented.

### Tools: Middleware Pattern

**Handler Signature:**
```typescript
type ToolHandler<A extends AnyArgs = AnyArgs> = (
  argsOrExtra: A | RequestHandlerExtra<ServerRequest, ServerNotification>,
  maybeExtra?: RequestHandlerExtra<ServerRequest, ServerNotification>
) => Promise<CallToolResult>;
```

**Authentication Implementation:**
```typescript
export default function createTool() {
  const handler = async (args: In, extra: EnrichedExtra): Promise<CallToolResult> => {
    // Auth is GUARANTEED to exist - middleware handles auth errors before handler runs
    const { auth, accountId } = extra.authContext;
    const { logger } = extra;

    // Use auth directly to call APIs
    const drive = google.drive({ version: 'v3', auth });
    // ...
  };

  return {
    name: 'files-search',
    config,
    handler,
  } satisfies ToolModule;
}
```

**Why middleware works:**
- Tools return `Promise<CallToolResult>` - same type as middleware wrapper
- Middleware can catch `AuthRequiredError` and return auth response as `CallToolResult`
- Handler receives enriched `extra` with guaranteed `authContext`
- Type system is satisfied - all paths return `Promise<CallToolResult>`

### Resources: Manual Lazy Auth Pattern

**Handler Signature:**
```typescript
type ResourceHandler = (
  uri: URL,
  vars: any
) => Promise<ReadResourceResult>;
```

**Authentication Implementation:**
```typescript
export default function createResource(): ResourceModule {
  const handler = async (uri: URL, variables: Record<string, string | string[]>, extra: EnrichedExtra): Promise<ReadResourceResult> => {
    const fileId = Array.isArray(variables.fileId) ? variables.fileId[0] : variables.fileId;

    try {
      // Middleware enriches extra with authContext and logger
      const { auth } = extra.authContext;
      const { logger } = extra;

      // Use auth to call API
      const drive = google.drive({ version: 'v3', auth });
      const file = await drive.files.get({ fileId, fields: '...' });

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(file.data)
        }]
      };
    } catch (e) {
      logger.error(e as Record<string, unknown>, 'resource fetch failed');
      const error = asError(e);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ error: error.message })
        }]
      };
    }
  };

  return {
    name: 'file',
    template,
    config,
    handler,
  };
}
```

**Why middleware works:**
- Resources receive `RequestHandlerExtra` as third parameter (added in MCP SDK)
- Middleware can enrich `extra` with `authContext` and `logger`
- Handler signature matches - all paths return `Promise<ReadResourceResult>`
- Type system is satisfied - unified pattern across tools, resources, and prompts

### Unified Registration Pattern

All components follow the same pattern:

```typescript
const { middleware: authMiddleware } = oauthAdapters;

// All components wrapped with auth middleware using same pattern
const tools = Object.values(toolFactories)
  .map((f) => f())
  .map(authMiddleware.withToolAuth);

const resources = Object.values(resourceFactories)
  .map((x) => x())
  .map(authMiddleware.withResourceAuth);

const prompts = Object.values(promptFactories)
  .map((x) => x())
  .map(authMiddleware.withPromptAuth);

registerTools(mcpServer, tools);
registerResources(mcpServer, resources);
registerPrompts(mcpServer, prompts);
```

## Key Principles

1. **Unified Pattern**: All components (tools, resources, prompts) use middleware for cross-cutting concerns
2. **Type Safety**: Middleware enriches `extra` with `authContext` and `logger`
3. **Lazy Authentication**: Auth only happens when requests come in
4. **Server Startup**: Servers can start without accounts configured
5. **Account Management**: `{service}-account-switch` tools work correctly at runtime

## See Also

- @mcp-z/oauth-google
