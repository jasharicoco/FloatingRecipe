import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRecipeStore, RecipeValidationError } from '../lib/database.js';

const migrationsPath = fileURLToPath(new URL('../migrations', import.meta.url));

function temporaryStore(t) {
  const directory = mkdtempSync(join(tmpdir(), 'floating-recipe-'));
  const store = createRecipeStore(join(directory, 'test.sqlite'), migrationsPath);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return store;
}

function owner(store, email = 'test@example.com') {
  return store.createUser({ name: 'Test User', email, passwordHash: 'test-hash' });
}

test('creates, retrieves, and preserves recipe text exactly', (t) => {
  const store = temporaryStore(t);
  const user = owner(store);
  const content = '2 eggs\n\n  Mix gently.  \nServe immediately.';
  const created = store.create({ title: '  Pancakes  ', content, color: 'butter' }, user.id);

  assert.equal(created.title, 'Pancakes');
  assert.equal(created.content, content);
  assert.equal(created.color, 'butter');
  assert.equal(store.get(created.id, user.id).content, content);
  assert.equal(store.list(user.id).length, 1);
});

test('updates a recipe without changing its creation date', (t) => {
  const store = temporaryStore(t);
  const user = owner(store);
  const created = store.create({ title: 'Soup', content: 'Tomato', color: 'blush' }, user.id);
  const updated = store.update(created.id, { title: 'Tomato soup', content: 'Tomato\nOnion', color: 'sage' }, user.id);

  assert.equal(updated.title, 'Tomato soup');
  assert.equal(updated.content, 'Tomato\nOnion');
  assert.equal(updated.color, 'sage');
  assert.equal(updated.createdAt, created.createdAt);
});

test('removes recipes and returns null for unknown IDs', (t) => {
  const store = temporaryStore(t);
  const user = owner(store);
  const created = store.create({ title: 'Pie', content: '', color: 'sky' }, user.id);

  assert.equal(store.remove(created.id, user.id), true);
  assert.equal(store.get(created.id, user.id), null);
  assert.equal(store.remove('missing', user.id), false);
});

test('rejects empty titles and unknown colors', (t) => {
  const store = temporaryStore(t);
  const user = owner(store);

  assert.throws(
    () => store.create({ title: '   ', content: '', color: 'sky' }, user.id),
    RecipeValidationError,
  );
  assert.throws(
    () => store.create({ title: 'Soup', content: '', color: 'neon' }, user.id),
    RecipeValidationError,
  );
});

test('isolates recipes between accounts', (t) => {
  const store = temporaryStore(t);
  const first = owner(store, 'first@example.com');
  const second = owner(store, 'second@example.com');
  const recipe = store.create({ title: 'Private recipe', content: 'Mine only', color: 'lilac' }, first.id);

  assert.equal(store.list(first.id).length, 1);
  assert.equal(store.list(second.id).length, 0);
  assert.equal(store.get(recipe.id, second.id), null);
  assert.equal(store.update(recipe.id, { title: 'Hijacked', content: '', color: 'sky' }, second.id), null);
  assert.equal(store.remove(recipe.id, second.id), false);
  assert.equal(store.get(recipe.id, first.id).title, 'Private recipe');
});

test('refreshes an existing session', (t) => {
  const store = temporaryStore(t);
  const user = owner(store);
  const tokenHash = 'session-token-hash';
  store.createSession(tokenHash, user.id, '2026-01-02T00:00:00.000Z');

  assert.equal(store.refreshSession(tokenHash, '2027-01-01T00:00:00.000Z'), true);
  assert.equal(store.getUserBySession(tokenHash, '2026-12-31T00:00:00.000Z').id, user.id);
  assert.equal(store.refreshSession('missing', '2027-01-01T00:00:00.000Z'), false);
});
