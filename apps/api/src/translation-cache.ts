import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ModelTranslationSchema, type ModelTranslation, type TranslationRequest } from '@thai-translate/contracts';

import type { TranslationService } from './translator.js';

/** Durable translations; identical in-flight requests share one provider call. */
export class CachedTranslationService implements TranslationService {
  private readonly database: DatabaseSync;
  private readonly pending = new Map<string, Promise<ModelTranslation>>();

  constructor(
    private readonly provider: TranslationService,
    path: string,
    private readonly namespace: string,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS translations (
        key TEXT PRIMARY KEY,
        result TEXT NOT NULL
      );
    `);
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.pending.values());
    this.database.close();
  }

  async translate(request: TranslationRequest): Promise<ModelTranslation> {
    const normalized = { ...request, text: request.text.trim() };
    const key = JSON.stringify([
      this.namespace,
      normalized.text,
      normalized.sourceLanguage,
      normalized.targetLanguage,
      normalized.mode,
      normalized.speakerGender,
    ]);
    const cached = this.read(key);
    if (cached) return cached;

    let pending = this.pending.get(key);
    if (!pending) {
      // Defer invocation so synchronous provider errors also clear the pending entry.
      pending = Promise.resolve()
        .then(() => this.provider.translate(normalized))
        .then((result) => {
          const saved = ModelTranslationSchema.parse(result);
          // First writer wins if multiple processes translate the same phrase.
          this.database.prepare('INSERT OR IGNORE INTO translations (key, result) VALUES (?, ?)')
            .run(key, JSON.stringify(saved));
          return this.read(key)!;
        })
        .finally(() => {
          this.pending.delete(key);
        });
      this.pending.set(key, pending);
    }
    return structuredClone(await pending);
  }

  private read(key: string): ModelTranslation | undefined {
    const row = this.database.prepare('SELECT result FROM translations WHERE key = ?').get(key);
    if (!row) return undefined;
    try {
      return ModelTranslationSchema.parse(JSON.parse(String(row.result)));
    } catch {
      // An invalid individual entry can be rebuilt without discarding the database.
      this.database.prepare('DELETE FROM translations WHERE key = ?').run(key);
      return undefined;
    }
  }
}
