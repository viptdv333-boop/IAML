// The Mongolian dictionary must cover every string the public site asks to translate (docs/I18N.md §4).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check } from '../scripts/i18n-check.js';

test('every translatable string has a Mongolian translation, with matching placeholders and markup', () => {
  const r = check();
  const brief = (list) => list.slice(0, 15).map((x) => JSON.stringify((x.key ?? '').slice(0, 80))).join('\n  ');
  assert.ok(r.total > 0, 'the checker found no translatable strings at all');
  assert.equal(r.problems.missing.length, 0, `missing translations (${r.problems.missing.length}):\n  ${brief(r.problems.missing)}`);
  assert.equal(r.problems.placeholders.length, 0, `placeholder mismatch:\n  ${brief(r.problems.placeholders)}`);
  assert.equal(r.problems.markup.length, 0, `markup mismatch:\n  ${brief(r.problems.markup)}`);
  assert.equal(r.problems.unsafe.length, 0, `unsafe values:\n  ${brief(r.problems.unsafe)}`);
  assert.equal(r.problems.stale.length, 0, `stale dictionary entries:\n  ${brief(r.problems.stale)}`);
});
