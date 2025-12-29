import { z } from 'zod';

// Drive file schema
export const DriveFileSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  mimeType: z.string().optional().describe('MIME type of the file (e.g., application/pdf, image/png)'),
  webViewLink: z.string().optional().describe('URL to view the file in Google Drive'),
  webContentLink: z.string().optional().describe('Direct download link for the file'),
  modifiedTime: z.string().optional().describe('ISO datetime when file was last modified'),
  createdTime: z.string().optional().describe('ISO datetime when file was created'),
  size: z.string().optional().describe('File size in bytes as string'),
  version: z.string().optional().describe('Version number of the file'),
  shared: z.boolean().optional().describe('Whether the file is shared with others'),
  starred: z.boolean().optional().describe('Whether the file is starred by the user'),
  trashed: z.boolean().optional().describe('Whether the file is in trash'),
  parents: z
    .array(
      z.object({
        id: z.string().describe('Parent folder ID'),
        name: z.string().describe('Parent folder name'),
      })
    )
    .optional()
    .describe('Parent folders with ID and name'),
  owners: z
    .array(
      z.object({
        displayName: z.string().optional(),
        emailAddress: z.string().optional(),
        kind: z.string().optional().describe('Resource type identifier (e.g., "drive#user")'),
        me: z.boolean().optional().describe('Whether this owner is the current user'),
        permissionId: z.string().optional().describe('Permission ID for this user'),
        photoLink: z.string().optional().describe('URL to user profile photo'),
      })
    )
    .optional(),
  permissions: z
    .object({
      canEdit: z.boolean().optional(),
      canComment: z.boolean().optional(),
      canShare: z.boolean().optional(),
    })
    .optional()
    .describe("Current user's permissions on this file"),
});

export type DriveFile = z.infer<typeof DriveFileSchema>;

// Drive file field definitions for field selection
export const DRIVE_FILE_FIELDS = ['id', 'name', 'mimeType', 'webViewLink', 'modifiedTime', 'parents', 'shared', 'starred', 'owners'] as const;

export const DRIVE_FILE_FIELD_DESCRIPTIONS: Record<(typeof DRIVE_FILE_FIELDS)[number], string> = {
  id: 'Unique file/folder identifier',
  name: 'File or folder name',
  mimeType: 'MIME type (e.g., application/pdf, application/vnd.google-apps.folder)',
  webViewLink: 'URL to view the file in Google Drive',
  modifiedTime: 'Last modification timestamp',
  parents: 'Parent folder IDs',
  shared: 'Whether the file is shared',
  starred: 'Whether the file is starred',
  owners: 'File owner information (displayName, emailAddress, etc.)',
};

export const DRIVE_FILE_COMMON_PATTERNS = [
  {
    name: 'Bulk operations (delete/move)',
    fields: 'id,name',
    tokens: '~20 tokens/file',
  },
  {
    name: 'Browsing/filtering',
    fields: 'id,name,mimeType,modifiedTime',
    tokens: '~40 tokens/file',
  },
  {
    name: 'Full metadata',
    fields: 'id,name,mimeType,webViewLink,modifiedTime,owners',
    tokens: '~80 tokens/file',
  },
] as const;
