import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const RECIPE_COLORS = new Set([
  'butter',
  'blush',
  'sky',
  'sage',
  'lilac',
  'apricot',
  'linen',
]);

const rowToRecipe = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function validateRecipe(input) {
  if (!input || typeof input !== 'object') {
    throw new RecipeValidationError('Receptet saknar innehåll.');
  }

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const content = typeof input.content === 'string' ? input.content : '';
  const color = typeof input.color === 'string' ? input.color : '';

  if (!title) throw new RecipeValidationError('Ge receptet ett namn.');
  if (title.length > 120) throw new RecipeValidationError('Namnet får vara högst 120 tecken.');
  if (content.length > 50_000) throw new RecipeValidationError('Recepttexten är för lång.');
  if (!RECIPE_COLORS.has(color)) throw new RecipeValidationError('Välj en giltig färg.');

  return { title, content, color };
}

export class RecipeValidationError extends Error {}
export class UserAlreadyExistsError extends Error {}

export function createRecipeStore(databasePath, migrationsPath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = database.prepare('SELECT name FROM schema_migrations').all();
  const appliedNames = new Set(applied.map((migration) => migration.name));

  for (const name of readdirSync(migrationsPath).filter((file) => file.endsWith('.sql')).sort()) {
    if (appliedNames.has(name)) continue;
    const sql = readFileSync(join(migrationsPath, name), 'utf8');
    database.exec('BEGIN IMMEDIATE;');
    try {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
        .run(name, new Date().toISOString());
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  }

  const statements = {
    allByUser: database.prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at ASC'),
    oneByUser: database.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?'),
    insert: database.prepare(`
      INSERT INTO recipes (id, title, content, color, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    update: database.prepare(`
      UPDATE recipes
      SET title = ?, content = ?, color = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `),
    remove: database.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?'),
    countByUser: database.prepare('SELECT count(*) AS count FROM recipes WHERE user_id = ?'),
    countUsers: database.prepare('SELECT count(*) AS count FROM users'),
    userByEmail: database.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE'),
    userById: database.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: database.prepare(`
      INSERT INTO users (id, name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    insertSession: database.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `),
    userBySession: database.prepare(`
      SELECT users.id, users.name, users.email, users.created_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `),
    deleteSession: database.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    refreshSession: database.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
    deleteExpiredSessions: database.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  const publicUser = (row) => row ? {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  } : null;

  return {
    list(userId) {
      return statements.allByUser.all(userId).map(rowToRecipe);
    },
    get(id, userId) {
      const row = statements.oneByUser.get(id, userId);
      return row ? rowToRecipe(row) : null;
    },
    create(input, userId) {
      if (!userId) throw new RecipeValidationError('Receptet måste tillhöra ett konto.');
      const recipe = validateRecipe(input);
      const id = randomUUID();
      const timestamp = new Date().toISOString();
      statements.insert.run(id, recipe.title, recipe.content, recipe.color, timestamp, timestamp, userId);
      return this.get(id, userId);
    },
    update(id, input, userId) {
      const recipe = validateRecipe(input);
      const result = statements.update.run(
        recipe.title,
        recipe.content,
        recipe.color,
        new Date().toISOString(),
        id,
        userId,
      );
      return result.changes ? this.get(id, userId) : null;
    },
    remove(id, userId) {
      return statements.remove.run(id, userId).changes > 0;
    },
    count(userId) {
      return statements.countByUser.get(userId).count;
    },
    countUsers() {
      return statements.countUsers.get().count;
    },
    createUser({ name, email, passwordHash }) {
      if (statements.userByEmail.get(email)) throw new UserAlreadyExistsError('E-postadressen används redan.');
      const id = randomUUID();
      statements.insertUser.run(id, name, email, passwordHash, new Date().toISOString());
      return publicUser(statements.userById.get(id));
    },
    findUserForLogin(email) {
      const row = statements.userByEmail.get(email);
      return row ? { ...publicUser(row), passwordHash: row.password_hash } : null;
    },
    getUser(id) {
      return publicUser(statements.userById.get(id));
    },
    createSession(tokenHash, userId, expiresAt) {
      statements.insertSession.run(tokenHash, userId, expiresAt, new Date().toISOString());
    },
    getUserBySession(tokenHash, now = new Date().toISOString()) {
      return publicUser(statements.userBySession.get(tokenHash, now));
    },
    deleteSession(tokenHash) {
      return statements.deleteSession.run(tokenHash).changes > 0;
    },
    refreshSession(tokenHash, expiresAt) {
      return statements.refreshSession.run(expiresAt, tokenHash).changes > 0;
    },
    deleteExpiredSessions(now = new Date().toISOString()) {
      return statements.deleteExpiredSessions.run(now).changes;
    },
    close() {
      database.close();
    },
  };
}
