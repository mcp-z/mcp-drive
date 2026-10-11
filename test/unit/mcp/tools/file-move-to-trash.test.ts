import assert from 'assert';
import createTool from '../../../../src/mcp/tools/file-move-to-trash.ts';

describe('file-move-to-trash input schema', () => {
  const { inputSchema } = createTool().config;
  const ids = (count: number) => Array.from({ length: count }, (_, i) => `file-${i}`);

  it('rejects an empty id list', () => {
    assert.strictEqual(inputSchema.safeParse({ ids: [] }).success, false);
  });

  it('accepts a single id', () => {
    assert.strictEqual(inputSchema.safeParse({ ids: ids(1) }).success, true);
  });

  it('accepts the maximum batch of 1000 ids', () => {
    assert.strictEqual(inputSchema.safeParse({ ids: ids(1000) }).success, true);
  });

  it('rejects 1001 ids', () => {
    assert.strictEqual(inputSchema.safeParse({ ids: ids(1001) }).success, false);
  });

  it('rejects an empty id string', () => {
    assert.strictEqual(inputSchema.safeParse({ ids: [''] }).success, false);
  });
});
