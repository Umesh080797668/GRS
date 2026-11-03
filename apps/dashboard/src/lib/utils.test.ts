import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeCsvCell } from './utils.ts';

describe('CSV Sanitizer (Plan Invariant 9)', () => {
  it('escapes standard formula injection prefixes (=, +, -, @)', () => {
    assert.strictEqual(sanitizeCsvCell('=1+1'), `"'=1+1"`);
    assert.strictEqual(sanitizeCsvCell('+cmd'), `"'+cmd"`);
    assert.strictEqual(sanitizeCsvCell('-cmd'), `"'-cmd"`);
    assert.strictEqual(sanitizeCsvCell('@SUM(A1)'), `"'@SUM(A1)"`);
  });

  it('escapes tab (\\t) and carriage return (\\r) per Plan Invariant 9', () => {
    assert.strictEqual(sanitizeCsvCell('\t=calc'), `"'\t=calc"`);
    assert.strictEqual(sanitizeCsvCell('\r=calc'), `"'\r=calc"`);
    assert.strictEqual(sanitizeCsvCell('\ttab_content'), `"'\ttab_content"`);
    assert.strictEqual(sanitizeCsvCell('\rcarriage_return_content'), `"'\rcarriage_return_content"`);
  });

  it('handles benign values and double-quotes inside content', () => {
    assert.strictEqual(sanitizeCsvCell('Normal Text'), `"Normal Text"`);
    assert.strictEqual(sanitizeCsvCell('He said "Hello"'), `"He said ""Hello"""`);
    assert.strictEqual(sanitizeCsvCell(12345), `"12345"`);
    assert.strictEqual(sanitizeCsvCell(null), `""`);
    assert.strictEqual(sanitizeCsvCell(undefined), `""`);
  });
});
