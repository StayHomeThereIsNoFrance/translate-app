import { resolve } from 'node:path';

import type {
  ModelTranslation,
  TranslationRequest,
} from '@thai-translate/contracts';

import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import type { TranslationService } from './translator.js';

function pronunciationWords(female: boolean): ModelTranslation['pronunciationWords'] {
  return [
    {
      latin: 'khop',
      russian: 'кхоп',
      englishTranslation: 'thank',
      russianTranslation: 'благодарить',
    },
    {
      latin: 'khun',
      russian: 'кхун',
      englishTranslation: 'you',
      russianTranslation: 'вас',
    },
    {
      latin: female ? 'kha' : 'khrap',
      russian: female ? 'кха' : 'кхрап',
      englishTranslation: 'polite particle',
      russianTranslation: 'вежливая частица',
    },
  ];
}

class FixtureTranslator implements TranslationService {
  async translate(request: TranslationRequest): Promise<ModelTranslation> {
    if (request.sourceLanguage === 'th') {
      const female = request.text.includes('ค่ะ') || request.text.includes('คะ');
      return {
        translation: 'Спасибо',
        thaiText: request.text,
        pronunciationWords: pronunciationWords(female),
      };
    }
    const female = request.speakerGender === 'female';
    return {
      translation: female ? 'ขอบคุณค่ะ' : 'ขอบคุณครับ',
      thaiText: female ? 'ขอบคุณค่ะ' : 'ขอบคุณครับ',
      pronunciationWords: pronunciationWords(female),
    };
  }
}

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  cliproxyBaseUrl: 'http://127.0.0.1:8318/v1',
  cliproxyApiKey: 'e2e-key',
  model: 'gpt-5.6-terra',
  reasoningEffort: 'none',
  timeoutMs: 5000,
  corsOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  staticDir: resolve(process.cwd(), '../../apps/client/dist'),
};

const app = await buildApp({
  config,
  translator: new FixtureTranslator(),
  logger: false,
});
await app.listen({ host: config.host, port: config.port });
