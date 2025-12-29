import assert from 'assert';
import { toDriveQuery } from '../../../src/lib/query-builder.js';

describe('toDriveQuery - basic field queries', () => {
  it('handles name field (single value)', () => {
    const result = toDriveQuery({ name: 'budget' });

    assert.strictEqual(result.q, "name contains 'budget'");
    assert.deepStrictEqual(result.filters.nameIncludes, ['budget']);
  });

  it('handles mimeType field (single value)', () => {
    const result = toDriveQuery({ mimeType: 'application/pdf' });

    assert.strictEqual(result.q, "mimeType = 'application/pdf'");
    assert.deepStrictEqual(result.filters.mimeTypeIncludes, ['application/pdf']);
  });

  it('handles fullText field (single value)', () => {
    const result = toDriveQuery({ fullText: 'quarterly report' });

    assert.strictEqual(result.q, "fullText contains 'quarterly report'");
    assert.deepStrictEqual(result.filters.fullTextIncludes, ['quarterly report']);
  });

  it('handles parentId field (single value)', () => {
    const result = toDriveQuery({ parentId: '1abc123xyz' });

    assert.strictEqual(result.q, "'1abc123xyz' in parents");
    assert.deepStrictEqual(result.filters.parentIdIncludes, ['1abc123xyz']);
  });

  it('handles owner field (single value)', () => {
    const result = toDriveQuery({ owner: 'alice@example.com' });

    assert.strictEqual(result.q, "'alice@example.com' in owners");
    assert.deepStrictEqual(result.filters.ownerIncludes, ['alice@example.com']);
  });
});

describe('toDriveQuery - field operators', () => {
  it('handles $any operator (OR logic)', () => {
    const result = toDriveQuery({
      name: { $any: ['budget', 'invoice', 'report'] },
    });

    assert.ok(result.q.includes("name contains 'budget'"));
    assert.ok(result.q.includes("name contains 'invoice'"));
    assert.ok(result.q.includes("name contains 'report'"));
    assert.ok(result.q.includes(' or '));
    assert.deepStrictEqual(result.filters.nameIncludes, ['budget', 'invoice', 'report']);
  });

  it('handles $all operator (AND logic)', () => {
    const result = toDriveQuery({
      name: { $all: ['2024', 'Q1'] },
    });

    assert.ok(result.q.includes("name contains '2024'"));
    assert.ok(result.q.includes("name contains 'Q1'"));
    assert.ok(result.q.includes(' and '));
    assert.deepStrictEqual(result.filters.nameIncludes, ['2024', 'Q1']);
  });

  it('handles $none operator (NOT logic)', () => {
    const result = toDriveQuery({
      name: { $none: ['draft', 'old'] },
    });

    assert.ok(result.q.includes('not'));
    assert.ok(result.q.includes("name contains 'draft'"));
    assert.ok(result.q.includes("name contains 'old'"));
    assert.deepStrictEqual(result.filters.nameIncludes, ['draft', 'old']);
  });

  it('handles multiple field operators', () => {
    const result = toDriveQuery({
      mimeType: { $any: ['application/pdf', 'image/jpeg'] },
      name: { $all: ['2024', 'invoice'] },
    });

    assert.ok(result.q.includes("mimeType = 'application/pdf'"));
    assert.ok(result.q.includes("mimeType = 'image/jpeg'"));
    assert.ok(result.q.includes("name contains '2024'"));
    assert.ok(result.q.includes("name contains 'invoice'"));
  });
});

describe('toDriveQuery - boolean flags', () => {
  it('handles starred = true', () => {
    const result = toDriveQuery({ starred: true });

    assert.strictEqual(result.q, 'starred = true');
    assert.strictEqual(result.filters.starred, true);
  });

  it('handles starred = false', () => {
    const result = toDriveQuery({ starred: false });

    assert.strictEqual(result.q, 'starred = false');
    assert.strictEqual(result.filters.starred, false);
  });

  it('handles sharedWithMe = true', () => {
    const result = toDriveQuery({ sharedWithMe: true });

    assert.strictEqual(result.q, 'sharedWithMe = true');
    assert.strictEqual(result.filters.sharedWithMe, true);
  });

  it('handles sharedWithMe = false', () => {
    const result = toDriveQuery({ sharedWithMe: false });

    assert.strictEqual(result.q, 'sharedWithMe = false');
    assert.strictEqual(result.filters.sharedWithMe, false);
  });

  it('handles trashed = true', () => {
    const result = toDriveQuery({ trashed: true });

    assert.strictEqual(result.q, 'trashed = true');
    assert.strictEqual(result.filters.trashed, true);
  });

  it('handles trashed = false', () => {
    const result = toDriveQuery({ trashed: false });

    assert.strictEqual(result.q, 'trashed = false');
    assert.strictEqual(result.filters.trashed, false);
  });

  it('combines multiple boolean flags', () => {
    const result = toDriveQuery({
      starred: true,
      sharedWithMe: false,
    });

    assert.ok(result.q.includes('starred = true'));
    assert.ok(result.q.includes('sharedWithMe = false'));
    assert.strictEqual(result.filters.starred, true);
    assert.strictEqual(result.filters.sharedWithMe, false);
  });
});

describe('toDriveQuery - date ranges', () => {
  it('handles modifiedTime with $gte only', () => {
    const result = toDriveQuery({
      modifiedTime: { $gte: '2024-01-01' },
    });

    assert.strictEqual(result.q, "modifiedTime >= '2024-01-01'");
  });

  it('handles modifiedTime with $lt only', () => {
    const result = toDriveQuery({
      modifiedTime: { $lt: '2024-12-31' },
    });

    assert.strictEqual(result.q, "modifiedTime < '2024-12-31'");
  });

  it('handles modifiedTime with both $gte and $lt (date range)', () => {
    const result = toDriveQuery({
      modifiedTime: { $gte: '2024-01-01', $lt: '2024-02-01' },
    });

    assert.ok(result.q.includes("modifiedTime >= '2024-01-01'"));
    assert.ok(result.q.includes("modifiedTime < '2024-02-01'"));
    assert.ok(result.q.includes(' and '));
  });

  it('handles ISO 8601 timestamps with time', () => {
    const result = toDriveQuery({
      modifiedTime: { $gte: '2024-01-01T00:00:00.000Z' },
    });

    assert.strictEqual(result.q, "modifiedTime >= '2024-01-01T00:00:00.000Z'");
  });
});

describe('toDriveQuery - logical operators', () => {
  it('handles $and operator', () => {
    const result = toDriveQuery({
      $and: [{ name: 'budget' }, { mimeType: 'application/pdf' }],
    });

    assert.ok(result.q.includes("name contains 'budget'"));
    assert.ok(result.q.includes("mimeType = 'application/pdf'"));
    assert.ok(result.q.includes(' and '));
  });

  it('handles $or operator', () => {
    const result = toDriveQuery({
      $or: [{ name: 'invoice' }, { name: 'receipt' }],
    });

    assert.ok(result.q.includes("name contains 'invoice'"));
    assert.ok(result.q.includes("name contains 'receipt'"));
    assert.ok(result.q.includes(' or '));
  });

  it('handles $not operator', () => {
    const result = toDriveQuery({
      $not: { name: 'draft' },
    });

    assert.ok(result.q.includes('not'));
    assert.ok(result.q.includes("name contains 'draft'"));
  });

  it('handles nested logical operators', () => {
    const result = toDriveQuery({
      $and: [
        {
          $or: [{ name: 'budget' }, { name: 'invoice' }],
        },
        { mimeType: 'application/pdf' },
      ],
    });

    assert.ok(result.q.includes("name contains 'budget'"));
    assert.ok(result.q.includes("name contains 'invoice'"));
    assert.ok(result.q.includes("mimeType = 'application/pdf'"));
    assert.ok(result.q.includes(' or '));
    assert.ok(result.q.includes(' and '));
  });

  it('handles complex nested query with multiple operators', () => {
    const result = toDriveQuery({
      $and: [
        {
          $or: [{ mimeType: 'application/pdf' }, { mimeType: 'image/jpeg' }],
        },
        { starred: true },
        {
          $not: { name: 'draft' },
        },
      ],
    });

    assert.ok(result.q.includes('or'));
    assert.ok(result.q.includes('and'));
    assert.ok(result.q.includes('not'));
    assert.ok(result.q.includes('starred = true'));
  });
});

describe('toDriveQuery - special characters and escaping', () => {
  it('escapes single quotes in name field', () => {
    const result = toDriveQuery({ name: "Alice's file" });

    assert.ok(result.q.includes("\\'"));
    assert.strictEqual(result.q, "name contains 'Alice\\'s file'");
  });

  it('handles filenames with parentheses', () => {
    const result = toDriveQuery({ name: 'Budget (2024)' });

    assert.strictEqual(result.q, "name contains 'Budget (2024)'");
  });

  it('handles filenames with special characters', () => {
    const result = toDriveQuery({ name: 'file-name_2024.pdf' });

    assert.strictEqual(result.q, "name contains 'file-name_2024.pdf'");
  });

  it('handles email addresses in owner field', () => {
    const result = toDriveQuery({ owner: 'user+tag@example.com' });

    assert.strictEqual(result.q, "'user+tag@example.com' in owners");
  });

  it('handles multiple special characters', () => {
    const result = toDriveQuery({
      name: 'O\'Brien\'s "important" file (2024)',
    });

    assert.ok(result.q.includes("\\'"));
    // Should escape single quotes but preserve other characters
  });
});

describe('toDriveQuery - edge cases', () => {
  it('handles empty query object', () => {
    const result = toDriveQuery({});

    assert.strictEqual(result.q, '');
    assert.deepStrictEqual(result.filters, {});
  });

  it('filters out empty strings in field operators', () => {
    const result = toDriveQuery({
      name: { $any: ['', '  ', 'valid'] },
    });

    // Should filter out empty/whitespace values
    assert.ok(result.q.includes("name contains 'valid'"));
    assert.ok(!result.q.includes("name contains ''"));
  });

  it('handles single-element field operator arrays', () => {
    const result = toDriveQuery({
      name: { $any: ['budget'] },
    });

    // Should not add OR operator for single element
    assert.strictEqual(result.q, "name contains 'budget'");
  });

  it('combines all query types in one complex query', () => {
    const result = toDriveQuery({
      $and: [
        { name: 'budget' },
        {
          mimeType: {
            $any: ['application/pdf', 'application/vnd.google-apps.spreadsheet'],
          },
        },
        { starred: true },
        { modifiedTime: { $gte: '2024-01-01', $lt: '2024-12-31' } },
        { parentId: '1abc123' },
      ],
    });

    assert.ok(result.q.includes("name contains 'budget'"));
    assert.ok(result.q.includes("mimeType = 'application/pdf'"));
    assert.ok(result.q.includes('starred = true'));
    assert.ok(result.q.includes("modifiedTime >= '2024-01-01'"));
    assert.ok(result.q.includes("'1abc123' in parents"));
    assert.deepStrictEqual(result.filters.nameIncludes, ['budget']);
    assert.ok(result.filters.mimeTypeIncludes?.length === 2);
    assert.strictEqual(result.filters.starred, true);
  });
});

describe('toDriveQuery - query string normalization', () => {
  it('cleans up leading/trailing whitespace', () => {
    const result = toDriveQuery({ name: '  budget  ' });

    // Query builder should handle the value as-is (normalization happens at input validation)
    assert.strictEqual(result.q, "name contains '  budget  '");
  });

  it('removes trailing logical operators', () => {
    // This tests the close logic in the query builder
    const result = toDriveQuery({
      $and: [{ name: 'budget' }],
    });

    // Should not have trailing 'and'
    assert.ok(!result.q.endsWith(' and'));
    assert.ok(!result.q.endsWith(' or'));
  });

  it('handles whitespace normalization in complex queries', () => {
    const result = toDriveQuery({
      $and: [{ name: 'budget' }, { starred: true }],
    });

    // Should not have excessive whitespace
    assert.ok(!result.q.includes('  '));
  });
});

describe('toDriveQuery - filters extraction', () => {
  it('extracts all field filters correctly', () => {
    const result = toDriveQuery({
      name: 'budget',
      mimeType: 'application/pdf',
      fullText: 'quarterly',
      parentId: '1abc',
      owner: 'alice@example.com',
      starred: true,
      sharedWithMe: false,
      trashed: false,
    });

    assert.deepStrictEqual(result.filters.nameIncludes, ['budget']);
    assert.deepStrictEqual(result.filters.mimeTypeIncludes, ['application/pdf']);
    assert.deepStrictEqual(result.filters.fullTextIncludes, ['quarterly']);
    assert.deepStrictEqual(result.filters.parentIdIncludes, ['1abc']);
    assert.deepStrictEqual(result.filters.ownerIncludes, ['alice@example.com']);
    assert.strictEqual(result.filters.starred, true);
    assert.strictEqual(result.filters.sharedWithMe, false);
    assert.strictEqual(result.filters.trashed, false);
  });

  it('filters are empty when no relevant fields present', () => {
    const result = toDriveQuery({ starred: true });

    assert.strictEqual(result.filters.nameIncludes, undefined);
    assert.strictEqual(result.filters.mimeTypeIncludes, undefined);
    assert.strictEqual(result.filters.starred, true);
  });
});

describe('toDriveQuery - real-world query examples', () => {
  it('finds PDFs in specific folder modified this year', () => {
    const result = toDriveQuery({
      $and: [{ mimeType: 'application/pdf' }, { parentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' }, { modifiedTime: { $gte: '2024-01-01' } }],
    });

    assert.ok(result.q.includes("mimeType = 'application/pdf'"));
    assert.ok(result.q.includes("'1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' in parents"));
    assert.ok(result.q.includes("modifiedTime >= '2024-01-01'"));
  });

  it('finds starred spreadsheets or documents shared with me', () => {
    const result = toDriveQuery({
      $and: [
        {
          $or: [{ mimeType: 'application/vnd.google-apps.spreadsheet' }, { mimeType: 'application/vnd.google-apps.document' }],
        },
        {
          $or: [{ starred: true }, { sharedWithMe: true }],
        },
      ],
    });

    assert.ok(result.q.includes('application/vnd.google-apps.spreadsheet'));
    assert.ok(result.q.includes('application/vnd.google-apps.document'));
    assert.ok(result.q.includes('starred = true'));
    assert.ok(result.q.includes('sharedWithMe = true'));
  });

  it('finds files by name excluding drafts', () => {
    const result = toDriveQuery({
      $and: [{ name: { $any: ['budget', 'invoice'] } }, { $not: { name: 'draft' } }],
    });

    assert.ok(result.q.includes("name contains 'budget'"));
    assert.ok(result.q.includes("name contains 'invoice'"));
    assert.ok(result.q.includes('not'));
    assert.ok(result.q.includes("name contains 'draft'"));
  });

  it('finds files owned by specific user in date range', () => {
    const result = toDriveQuery({
      $and: [{ owner: 'bob@example.com' }, { modifiedTime: { $gte: '2024-01-01', $lt: '2024-02-01' } }],
    });

    assert.ok(result.q.includes("'bob@example.com' in owners"));
    assert.ok(result.q.includes("modifiedTime >= '2024-01-01'"));
    assert.ok(result.q.includes("modifiedTime < '2024-02-01'"));
  });

  it('searches file content with additional filters', () => {
    const result = toDriveQuery({
      $and: [
        { fullText: 'quarterly report' },
        {
          mimeType: {
            $any: ['application/pdf', 'application/vnd.google-apps.document'],
          },
        },
        { starred: true },
      ],
    });

    assert.ok(result.q.includes("fullText contains 'quarterly report'"));
    assert.ok(result.q.includes("mimeType = 'application/pdf'"));
    assert.ok(result.q.includes('starred = true'));
  });
});
