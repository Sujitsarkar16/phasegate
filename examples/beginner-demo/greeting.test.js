import test from 'node:test';
import assert from 'node:assert/strict';
import { greet } from './greeting.js';

test('greets a named developer and trims surrounding whitespace', () => {
  assert.equal(greet('  Ada  '), 'Hello, Ada!');
});

test('uses a friendly fallback for missing or blank names', () => {
  for (const name of [undefined, null, '', '   ']) {
    assert.equal(greet(name), 'Hello, developer!');
  }
});
