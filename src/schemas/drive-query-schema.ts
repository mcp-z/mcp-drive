import { z } from 'zod';

/**
 * Field operator schema for Drive query fields that support multiple values
 * Supports OR ($any), AND ($all), and NOT ($none) operations
 */
const FieldOperatorSchema = z
  .object({
    $any: z.array(z.string()).optional().describe('OR within field - matches if ANY value matches'),
    $all: z.array(z.string()).optional().describe('AND within field - matches if ALL values match'),
    $none: z.array(z.string()).optional().describe('NOT within field - matches if NONE match'),
  })
  .strict();

export type FieldOperator = z.infer<typeof FieldOperatorSchema>;

/**
 * Drive query object schema with recursive operators and Drive features.
 *
 * Includes Drive-specific features:
 * - name: Search by file/folder name (supports string or field operators)
 * - mimeType: Filter by MIME type (e.g., "application/pdf", "application/vnd.google-apps.folder")
 * - fullText: Search file content and metadata
 * - parentId: Search within specific folder (supports string or field operators)
 * - starred: Filter by starred status
 * - shared: Filter by shared status
 * - modifiedTime: Date range filtering with $gte and $lt
 * - owner: Filter by owner email (supports string or field operators)
 * - rawDriveQuery: Escape hatch for advanced Drive query syntax
 *
 * Logical operators:
 * - $and: Array of conditions that must ALL match (recursive)
 * - $or: Array of conditions where ANY must match (recursive)
 * - $not: Nested condition that must NOT match (recursive)
 *
 * Note: Cast through unknown to work around Zod's lazy schema type inference issue
 * with exactOptionalPropertyTypes. The runtime schema is correct; this cast ensures
 * TypeScript sees the strict DriveQueryObject type everywhere the schema is used.
 */
const DriveQueryObjectSchema = z.lazy(() =>
  z
    .object({
      // Logical operators for combining conditions (recursive)
      $and: z.array(DriveQueryObjectSchema).optional().describe('Array of conditions that must ALL match'),
      $or: z.array(DriveQueryObjectSchema).optional().describe('Array of conditions where ANY must match'),
      $not: DriveQueryObjectSchema.optional().describe('Nested condition that must NOT match'),

      // File/folder name search
      name: z
        .union([z.string().min(1), FieldOperatorSchema])
        .optional()
        .describe('Search by file or folder name (partial match, case-insensitive)'),

      // MIME type filtering
      mimeType: z
        .union([z.string().min(1), FieldOperatorSchema])
        .optional()
        .describe('Filter by MIME type (e.g., "application/pdf", "application/vnd.google-apps.folder", "image/jpeg")'),

      // Full-text search across content and metadata
      fullText: z
        .union([z.string().min(1), FieldOperatorSchema])
        .optional()
        .describe('Search file content and metadata (full-text search)'),

      // Parent folder filtering
      parentId: z
        .union([z.string().min(1), FieldOperatorSchema])
        .optional()
        .describe('Search within specific folder by folder ID (use "root" for My Drive root)'),

      // Boolean flags
      starred: z.boolean().optional().describe('Filter by starred status (true = starred, false = not starred)'),
      sharedWithMe: z.boolean().optional().describe('Filter by "shared with me" collection (true = in shared collection, false = not shared)'),
      trashed: z.boolean().optional().describe('Filter by trash status (true = in trash, false = not in trash). Note: Drive tools automatically filter out trashed files unless explicitly requested.'),

      // Date range filtering
      modifiedTime: z
        .object({
          $gte: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/)
            .optional()
            .describe('Files modified on or after this date (ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)'),
          $lt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/)
            .optional()
            .describe('Files modified before this date (ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)'),
        })
        .optional()
        .describe('Filter by modification date range'),

      // Owner filtering
      owner: z
        .union([z.string().min(1), FieldOperatorSchema])
        .optional()
        .describe('Filter by owner email address (partial match)'),

      // Raw Drive query string - escape hatch for advanced syntax
      rawDriveQuery: z.string().min(1).optional().describe("Raw Google Drive query syntax for advanced use cases. Bypasses schema validation - use sparingly. Example: \"name contains 'budget' and mimeType = 'application/pdf'\""),
    })
    .strict()
) as unknown as z.ZodType<DriveQueryObject>;

export type DriveQueryObject = {
  $and?: DriveQueryObject[];
  $or?: DriveQueryObject[];
  $not?: DriveQueryObject;
  name?: string | FieldOperator;
  mimeType?: string | FieldOperator;
  fullText?: string | FieldOperator;
  parentId?: string | FieldOperator;
  starred?: boolean;
  sharedWithMe?: boolean;
  trashed?: boolean;
  modifiedTime?: {
    $gte?: string;
    $lt?: string;
  };
  owner?: string | FieldOperator;
  rawDriveQuery?: string;
};

/**
 * Drive query schema that accepts either:
 * - A structured DriveQueryObject with typed fields
 * - A raw Drive query string for advanced use cases
 *
 * This provides type safety for common queries while allowing
 * direct Google Drive query syntax when needed.
 */
export const DriveQuerySchema = z.union([z.string().min(1), DriveQueryObjectSchema]);

export type DriveQuery = string | DriveQueryObject;
