import type { DriveQuery, DriveQueryObject } from '../schemas/drive-query-schema.js';

/**
 * Field operator interface for query filters
 */
export interface FieldOperator {
  $any?: string[];
  $all?: string[];
  $none?: string[];
}

/**
 * Filters object returned by toDriveQuery for debugging/logging
 */
interface FiltersObject {
  nameIncludes?: string[];
  mimeTypeIncludes?: string[];
  fullTextIncludes?: string[];
  parentIdIncludes?: string[];
  ownerIncludes?: string[];
  starred?: boolean;
  sharedWithMe?: boolean;
  trashed?: boolean;
}

/**
 * Convert structured DriveQuery to Google Drive query string
 *
 * Accepts either:
 * - A raw Drive query string (returned as-is)
 * - A structured DriveQueryObject (converted to Drive query syntax)
 *
 * Drive query syntax reference:
 * - name contains 'text' - Search by filename
 * - mimeType = 'type' - Filter by MIME type
 * - fullText contains 'text' - Search content and metadata
 * - 'parent_id' in parents - Search in folder
 * - starred = true/false - Filter by starred status
 * - sharedWithMe = true - Filter by shared status
 * - modifiedTime >= 'date' - Date filtering
 * - 'email' in owners - Filter by owner
 * - trashed = false - Exclude trashed files (always added)
 */
export function toDriveQuery(query: DriveQuery): {
  q: string;
  filters: FiltersObject;
} {
  // Handle string queries - return as raw query with empty filters
  if (typeof query === 'string') {
    return { q: query, filters: {} };
  }
  const nameIncludes: string[] = [];
  const mimeTypeIncludes: string[] = [];
  const fullTextIncludes: string[] = [];
  const parentIdIncludes: string[] = [];
  const ownerIncludes: string[] = [];

  let starredFlag: boolean | undefined;
  let sharedWithMeFlag: boolean | undefined;
  let trashedFlag: boolean | undefined;

  function p(s: unknown) {
    return `(${String(s ?? '')})`;
  }

  function quote(s?: unknown) {
    const str = String(s ?? '');
    // Escape single quotes for Drive query syntax
    return `'${str.replace(/'/g, "\\'")}'`;
  }

  function fv(field: string, raw?: unknown) {
    const rawVal = String(raw ?? '');
    const v = quote(rawVal);

    if (field === 'name') {
      nameIncludes.push(rawVal);
      return `name contains ${v}`;
    }
    if (field === 'mimeType') {
      mimeTypeIncludes.push(rawVal);
      return `mimeType = ${v}`;
    }
    if (field === 'fullText') {
      fullTextIncludes.push(rawVal);
      return `fullText contains ${v}`;
    }
    if (field === 'parentId') {
      parentIdIncludes.push(rawVal);
      return `${v} in parents`;
    }
    if (field === 'owner') {
      ownerIncludes.push(rawVal);
      return `${v} in owners`;
    }

    return '';
  }

  function chain(op: 'and' | 'or', arr: string[]) {
    const filtered = arr.filter((s) => s && s.trim() !== '');
    if (filtered.length === 0) return '';
    if (filtered.length === 1) {
      const first = filtered[0];
      return first ?? '';
    }
    return p(filtered.join(` ${op} `));
  }

  function fieldExpr(field: string, op: FieldOperator) {
    if (op.$any) {
      const nonEmpty = op.$any.filter((v: string) => String(v ?? '').trim() !== '');
      const results = nonEmpty.map((v: string) => fv(field, String(v ?? ''))).filter((result: string) => result.trim() !== '');
      return results.length > 0 ? chain('or', results) : '';
    }
    if (op.$all) {
      const nonEmpty = op.$all.filter((v: string) => String(v ?? '').trim() !== '');
      const results = nonEmpty.map((v: string) => fv(field, String(v ?? ''))).filter((result: string) => result.trim() !== '');
      return results.length > 0 ? chain('and', results) : '';
    }
    if (op.$none) {
      const nonEmpty = op.$none.filter((v: string) => String(v ?? '').trim() !== '');
      const results = nonEmpty.map((v: string) => fv(field, String(v ?? ''))).filter((result: string) => result.trim() !== '');
      return results.length > 0 ? `not ${p(chain('or', results))}` : '';
    }
    throw new Error(`Unknown field operator ${JSON.stringify(op)}`);
  }

  function dateExpr(d: { $gte?: string; $lt?: string }) {
    const parts: string[] = [];
    if (d.$gte) parts.push(`modifiedTime >= '${d.$gte}'`);
    if (d.$lt) parts.push(`modifiedTime < '${d.$lt}'`);
    return parts.length > 1 ? p(parts.join(' and ')) : (parts[0] ?? '');
  }

  function fieldKeys() {
    return ['name', 'mimeType', 'fullText', 'parentId', 'owner'];
  }

  function emit(n: DriveQueryObject): string {
    if (n.$and) return p(n.$and.map(emit).join(' and '));
    if (n.$or) return p(n.$or.map(emit).join(' or '));
    if (n.$not) return `not ${emit(n.$not)}`;

    const expressions: string[] = [];

    if (typeof n.starred === 'boolean') {
      starredFlag = n.starred;
      expressions.push(`starred = ${n.starred}`);
    }
    if (typeof n.sharedWithMe === 'boolean') {
      sharedWithMeFlag = n.sharedWithMe;
      expressions.push(`sharedWithMe = ${n.sharedWithMe}`);
    }
    if (typeof n.trashed === 'boolean') {
      trashedFlag = n.trashed;
      expressions.push(`trashed = ${n.trashed}`);
    }
    if (n.modifiedTime) {
      expressions.push(dateExpr(n.modifiedTime));
    }

    for (const k of fieldKeys()) {
      if (typeof n === 'object' && n !== null && k in n) {
        const op = (n as Record<string, string | FieldOperator>)[k];
        const normalizedOp: FieldOperator = typeof op === 'string' ? { $any: [op] } : (op ?? {});
        const result = fieldExpr(k, normalizedOp);
        if (result.trim() !== '') {
          expressions.push(result);
        }
      }
    }

    // Handle empty objects
    if (expressions.length === 0 && typeof n === 'object' && n !== null && Object.keys(n).length === 0) {
      return '';
    }

    // Combine multiple expressions with AND
    if (expressions.length > 1) {
      return chain('and', expressions);
    }
    if (expressions.length === 1) {
      return expressions[0] ?? '';
    }

    throw new Error(`Unknown node: ${JSON.stringify(n)}`);
  }

  function emitTop(n: DriveQueryObject): string {
    if (!n) return '';

    // Handle empty objects
    if (typeof n === 'object' && n !== null && Object.keys(n).length === 0) return '';

    if (n.$and) return n.$and.map(emit).join(' and ');
    if (n.$or) return n.$or.map(emit).join(' or ');
    if (n.$not) return `not ${emit(n.$not)}`;

    const result = emit(n);
    return result.trim() === '' ? '' : result;
  }

  const q = emitTop(query);
  const cleanedQuery = q.replace(/\s+and\s+$|\s+or\s+$|^\s+and\s+|^\s+or\s+/gi, '').trim();

  const filters: FiltersObject = {};
  if (nameIncludes.length) filters.nameIncludes = nameIncludes;
  if (mimeTypeIncludes.length) filters.mimeTypeIncludes = mimeTypeIncludes;
  if (fullTextIncludes.length) filters.fullTextIncludes = fullTextIncludes;
  if (parentIdIncludes.length) filters.parentIdIncludes = parentIdIncludes;
  if (ownerIncludes.length) filters.ownerIncludes = ownerIncludes;
  // Use tracked flags from emit() to capture nested boolean conditions
  if (typeof starredFlag === 'boolean') filters.starred = starredFlag;
  if (typeof sharedWithMeFlag === 'boolean') filters.sharedWithMe = sharedWithMeFlag;
  if (typeof trashedFlag === 'boolean') filters.trashed = trashedFlag;

  return { q: cleanedQuery ?? '', filters };
}
