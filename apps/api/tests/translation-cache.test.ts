import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ModelTranslation, TranslationRequest } from '@thai-translate/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CachedTranslationService } from '../src/translation-cache.js';

const request: TranslationRequest = {
  text: 'Спасибо', sourceLanguage: 'ru', targetLanguage: 'th',
  mode: 'thai-formal', speakerGender: 'male',
};
const result: ModelTranslation = {
  translation: 'ขอบคุณครับ', thaiText: 'ขอบคุณครับ',
  pronunciationWords: [{ latin: 'khop', russian: 'кхоп',
    englishTranslation: 'thank', russianTranslation: 'благодарить' }],
};

const caches: CachedTranslationService[] = [];
const directories: string[] = [];
function makeCache(provider: { translate: (request: TranslationRequest) => Promise<ModelTranslation> }, path = ':memory:', namespace = 'v1') {
  const cache = new CachedTranslationService(provider, path, namespace);
  caches.push(cache);
  return cache;
}
function diskPath() {
  const directory = mkdtempSync(join(tmpdir(), 'translation-cache-'));
  directories.push(directory);
  return join(directory, 'nested', 'translations.sqlite');
}
afterEach(async () => {
  await Promise.all(caches.splice(0).map((cache) => cache.close()));
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

describe('CachedTranslationService', () => {
  it('reuses the complete result, trims edges and protects cached values from mutation', async () => {
    const translate = vi.fn(async () => structuredClone(result));
    const cache = makeCache({ translate });
    const first = await cache.translate({ ...request, text: '  Спасибо\n' });
    first.pronunciationWords[0]!.latin = 'changed';
    expect(await cache.translate(request)).toEqual(result);
    expect(translate).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each<Partial<TranslationRequest>>([
    { text: 'спасибо' }, { text: 'Спасибо!' },
    { sourceLanguage: 'th' }, { targetLanguage: 'ru' },
    { mode: 'farang-ploy' }, { speakerGender: 'female' },
  ])('separates requests with different text or settings: %j', async (change) => {
    const translate = vi.fn(async () => result);
    const cache = makeCache({ translate });
    await cache.translate(request);
    await cache.translate({ ...request, ...change });
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight request and returns independent results', async () => {
    let complete!: (value: ModelTranslation) => void;
    const translate = vi.fn(() => new Promise<ModelTranslation>((resolve) => { complete = resolve; }));
    const cache = makeCache({ translate });
    const first = cache.translate(request);
    const second = cache.translate(request);
    await Promise.resolve();
    expect(translate).toHaveBeenCalledTimes(1);
    complete(result);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(await cache.translate(request)).toEqual(result);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('does not cache failures (synchronous: %s)', async (synchronous) => {
    const error = new Error('provider failed');
    const translate = vi.fn((): Promise<ModelTranslation> => {
      if (synchronous) throw error;
      return Promise.reject(error);
    });
    const cache = makeCache({ translate });
    const failed = await Promise.allSettled([cache.translate(request), cache.translate(request)]);
    expect(failed).toEqual([
      { status: 'rejected', reason: error }, { status: 'rejected', reason: error },
    ]);
    expect(translate).toHaveBeenCalledTimes(1);
    translate.mockResolvedValue(result);
    expect(await cache.translate(request)).toEqual(result);
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('persists the full result across database close and reopen', async () => {
    const path = diskPath();
    const translate = vi.fn(async () => result);
    const cache = makeCache({ translate }, path);
    await cache.translate(request);
    await cache.close();
    caches.splice(caches.indexOf(cache), 1);
    const reopened = makeCache({ translate }, path);
    expect(await reopened.translate(request)).toEqual(result);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('separates model and prompt revisions via namespace', async () => {
    const path = diskPath();
    const translate = vi.fn(async () => result);
    await makeCache({ translate }, path, 'old').translate(request);
    await makeCache({ translate }, path, 'new').translate(request);
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('uses the first saved result when two database connections race', async () => {
    const path = diskPath();
    let complete!: (value: ModelTranslation) => void;
    const slow = makeCache({ translate: () => new Promise((resolve) => { complete = resolve; }) }, path);
    const fast = makeCache({ translate: async () => result }, path);
    const pending = slow.translate(request);
    await Promise.resolve();
    await fast.translate(request);
    complete({ ...result, translation: 'different' });
    expect(await pending).toEqual(result);
    expect(await slow.translate(request)).toEqual(result);
  });

  it.each(['broken JSON', '{}'])('rebuilds corrupt entries: %s', async (invalid) => {
    const path = diskPath();
    const translate = vi.fn(async () => result);
    const cache = makeCache({ translate }, path);
    await cache.translate(request);
    const database = new DatabaseSync(path);
    database.prepare('UPDATE translations SET result = ?').run(invalid);
    database.close();
    expect(await cache.translate(request)).toEqual(result);
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid provider results without saving them', async () => {
    const translate = vi.fn(async () => ({} as ModelTranslation));
    const cache = makeCache({ translate });
    await expect(cache.translate(request)).rejects.toThrow();
    translate.mockResolvedValue(result);
    expect(await cache.translate(request)).toEqual(result);
    expect(translate).toHaveBeenCalledTimes(2);
  });
});
