import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { type AccountUser, type LibraryOperation, type TranslationEntry, type TranslationLibrary } from '@thai-translate/contracts';

export const secret = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export type LoginAttempt = {
  platform: 'web' | 'native'; challenge: string; nonce: string; googleVerifier: string;
};

export class AccountStore {
  private readonly db: DatabaseSync;
  constructor(path: string, private readonly now = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS account_users (id TEXT PRIMARY KEY, profile TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS account_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_logins (state TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_handoffs (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, challenge TEXT NOT NULL, platform TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_entries (
        user_id TEXT NOT NULL, id TEXT NOT NULL, entry TEXT NOT NULL, created_at TEXT NOT NULL,
        in_history INTEGER NOT NULL, favorite INTEGER NOT NULL, PRIMARY KEY(user_id, id)
      );
      CREATE TABLE IF NOT EXISTS account_operations (user_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(user_id, id));
    `);
  }
  close() { this.db.close(); }
  private cleanup() {
    for (const table of ['account_sessions', 'account_logins', 'account_handoffs']) {
      this.db.prepare(`DELETE FROM ${table} WHERE expires <= ?`).run(this.now());
    }
  }
  startLogin(attempt: LoginAttempt) {
    this.cleanup();
    const state = secret();
    this.db.prepare('INSERT INTO account_logins VALUES (?, ?, ?)').run(hash(state), JSON.stringify(attempt), this.now() + 600000);
    return state;
  }
  takeLogin(state: string): LoginAttempt | null {
    const row = this.db.prepare('DELETE FROM account_logins WHERE state = ? RETURNING *').get(hash(state));
    return row && Number(row.expires) > this.now() ? JSON.parse(String(row.data)) as LoginAttempt : null;
  }
  handoff(user: AccountUser, attempt: LoginAttempt) {
    this.db.prepare('INSERT INTO account_users VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile').run(user.id, JSON.stringify(user));
    const code = secret();
    this.db.prepare('INSERT INTO account_handoffs VALUES (?, ?, ?, ?, ?)')
      .run(hash(code), user.id, attempt.challenge, attempt.platform, this.now() + 120000);
    return code;
  }
  exchange(code: string, verifier: string) {
    const row = this.db.prepare('DELETE FROM account_handoffs WHERE code = ? AND challenge = ? AND expires > ? RETURNING *')
      .get(hash(code), hash(verifier), this.now());
    if (!row) return null;
    const token = secret();
    this.db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(hash(token), String(row.user_id), this.now() + SESSION_SECONDS * 1000);
    return { token, platform: String(row.platform), user: this.user(token)! };
  }
  user(token: string): AccountUser | null {
    const row = this.db.prepare(`SELECT u.profile FROM account_users u JOIN account_sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?`)
      .get(hash(token), this.now());
    return row ? JSON.parse(String(row.profile)) as AccountUser : null;
  }
  logout(token: string) { this.db.prepare('DELETE FROM account_sessions WHERE token=?').run(hash(token)); }

  sync(userId: string, operations: LibraryOperation[]): TranslationLibrary {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const operation of operations) {
        const inserted = this.db.prepare('INSERT OR IGNORE INTO account_operations VALUES (?, ?)').run(userId, operation.id);
        if (!inserted.changes) continue;
        const { entry } = operation;
        this.db.prepare('INSERT OR IGNORE INTO account_entries VALUES (?, ?, ?, ?, ?, ?)')
          .run(userId, entry.id, JSON.stringify(entry), entry.createdAt,
            operation.kind === 'favorite' ? 0 : Number(operation.inHistory), Number(operation.favorite));
        if (operation.kind === 'favorite') {
          this.db.prepare('UPDATE account_entries SET favorite=? WHERE user_id=? AND id=?')
            .run(Number(operation.favorite), userId, entry.id);
        } else if (operation.kind === 'record') {
          this.db.prepare('UPDATE account_entries SET in_history=1 WHERE user_id=? AND id=?').run(userId, entry.id);
        }
        // Import never overwrites an existing star, including a removed star.
      }
      this.db.prepare(`UPDATE account_entries SET in_history=0 WHERE user_id=? AND in_history=1 AND id NOT IN
        (SELECT id FROM account_entries WHERE user_id=? AND in_history=1 ORDER BY created_at DESC, id DESC LIMIT 200)`)
        .run(userId, userId);
      const result = this.library(userId);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  library(userId: string): TranslationLibrary {
    const entries = this.db.prepare('SELECT entry, in_history, favorite FROM account_entries WHERE user_id=? AND (in_history=1 OR favorite=1) ORDER BY created_at DESC, id DESC').all(userId);
    const history: TranslationEntry[] = [];
    const favorites: TranslationEntry[] = [];
    for (const row of entries) {
      const entry = JSON.parse(String(row.entry)) as TranslationEntry;
      if (row.in_history) history.push(entry);
      if (row.favorite) favorites.push(entry);
    }
    return { history, favorites };
  }
}
