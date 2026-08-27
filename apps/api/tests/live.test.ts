import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { CliproxyTranslationService } from '../src/translator.js';

function localProxyKey(): string | undefined {
  if (process.env.CLIPROXYAPI_API_KEY) {
    return process.env.CLIPROXYAPI_API_KEY;
  }
  try {
    const yaml = readFileSync(
      resolve(
        process.cwd(),
        '../../../agent-docker/config/cliproxyapi/config.yaml',
      ),
      'utf8',
    );
    return yaml.match(/api-keys:\s*\n\s*-\s*["']?([^"'\s]+)["']?/)?.[1];
  } catch {
    return undefined;
  }
}

const key = localProxyKey();
const live = key ? describe : describe.skip;

live('live cliproxyapi translation', () => {
  it(
    'translates a canonical formal phrase with the correct male particle',
    async () => {
      const config = loadConfig({
        NODE_ENV: 'test',
        CLIPROXYAPI_API_KEY: key,
        CLIPROXYAPI_BASE_URL:
          process.env.CLIPROXYAPI_BASE_URL ??
          'https://cliproxyapi.hetz.autismstaking.xyz/v1',
        OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-5.6-terra',
        OPENAI_REASONING_EFFORT: 'none',
        PROMPTS_DIR: resolve(process.cwd(), '../../config/prompts'),
      });
      const service = new CliproxyTranslationService(config);
      const result = await service.translate({
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'thai-formal',
        speakerGender: 'male',
      });

      expect(result.translation).toContain('ขอบคุณ');
      expect(result.translation).toContain('ครับ');
      expect(result.translation).not.toMatch(/ค่ะ|คะ/);
      expect(result.pronunciationWords.length).toBeGreaterThan(0);
      expect(result.pronunciationWords[0]?.latin.length).toBeGreaterThan(0);
      expect(
        result.pronunciationWords[0]?.russianTranslation.length,
      ).toBeGreaterThan(0);
    },
    60_000,
  );
});
