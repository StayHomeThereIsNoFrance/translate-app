import type { ModelTranslation, TranslationRequest } from '@thai-translate/contracts';

import type { TranslationService } from './translator.js';

/** Per-server LRU cache; pending requests share a single provider call. */
export class CachedTranslationService implements TranslationService {
  private readonly results = new Map<string, ModelTranslation>();
  private readonly pending = new Map<string, Promise<ModelTranslation>>();

  constructor(
    private readonly provider: TranslationService,
    private readonly maxEntries = 1000,
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error('Translation cache capacity must be a positive integer');
    }
  }

  async translate(request: TranslationRequest): Promise<ModelTranslation> {
    const normalized = { ...request, text: request.text.trim() };
    const key = JSON.stringify([
      normalized.text,
      normalized.sourceLanguage,
      normalized.targetLanguage,
      normalized.mode,
      normalized.speakerGender,
    ]);
    const cached = this.results.get(key);
    if (cached) {
      this.results.delete(key);
      this.results.set(key, cached);
      return structuredClone(cached);
    }

    let pending = this.pending.get(key);
    if (!pending) {
      // Defer invocation so even synchronous provider errors clear the pending entry.
      pending = Promise.resolve()
        .then(() => this.provider.translate(normalized))
        .then((result) => {
          const saved = structuredClone(result);
          this.results.set(key, saved);
          if (this.results.size > this.maxEntries) {
            this.results.delete(this.results.keys().next().value!);
          }
          return saved;
        })
        .finally(() => {
          this.pending.delete(key);
        });
      this.pending.set(key, pending);
    }
    return structuredClone(await pending);
  }
}
