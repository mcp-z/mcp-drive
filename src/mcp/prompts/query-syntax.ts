import type { PromptModule } from '@mcp-z/server';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

export default function createPrompt() {
  const config = {
    description: 'Reference guide for Google Drive query syntax',
  };

  const handler = async (_args: { [x: string]: unknown }, _extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `# Google Drive Query Syntax Reference

## Logical Operators
- \`$and\`: Array of conditions that ALL must match
- \`$or\`: Array of conditions where ANY must match
- \`$not\`: Condition that must NOT match

## File/Folder Fields
- \`name\`: Search by name (partial match, case-insensitive)
- \`mimeType\`: Filter by MIME type
- \`fullText\`: Search file content and metadata
- \`parentId\`: Search within folder (use "root" for My Drive)
- \`owner\`: Filter by owner email

## Boolean Flags
- \`starred\`: true/false
- \`sharedWithMe\`: true/false
- \`trashed\`: true/false (tools auto-filter trashed by default)

## Date Range
\`\`\`json
{ "modifiedTime": { "$gte": "2024-01-01", "$lt": "2024-12-31" } }
\`\`\`

## Common MIME Types
- \`application/vnd.google-apps.folder\`: Folders
- \`application/vnd.google-apps.document\`: Google Docs
- \`application/vnd.google-apps.spreadsheet\`: Google Sheets
- \`application/vnd.google-apps.presentation\`: Google Slides
- \`application/pdf\`: PDF files
- \`image/jpeg\`, \`image/png\`: Images

## Field Operators (for multi-value fields)
- \`$any\`: OR - matches if ANY value matches
- \`$all\`: AND - matches if ALL values match
- \`$none\`: NOT - matches if NONE match

## Escape Hatch
- \`rawDriveQuery\`: Raw Google Drive query syntax

## Example Queries
\`\`\`json
// PDFs modified this year
{ "mimeType": "application/pdf", "modifiedTime": { "$gte": "2024-01-01" } }

// Starred spreadsheets
{ "mimeType": "application/vnd.google-apps.spreadsheet", "starred": true }

// Files in specific folder
{ "parentId": "1abc123xyz" }

// Search by name
{ "name": "budget" }

// Complex: shared PDFs or Docs
{ "$or": [
  { "mimeType": "application/pdf", "sharedWithMe": true },
  { "mimeType": "application/vnd.google-apps.document", "sharedWithMe": true }
]}
\`\`\``,
          },
        },
      ],
    };
  };

  return {
    name: 'query-syntax',
    config,
    handler,
  } satisfies PromptModule;
}
