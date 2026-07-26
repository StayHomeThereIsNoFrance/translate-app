import { resolve } from 'node:path';

import type {
  ModelTranslation,
  TranslationRequest,
} from '@thai-translate/contracts';

import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import type { TranslationService } from './translator.js';

class FixtureTranslator implements TranslationService {
  async translate(request: TranslationRequest): Promise<ModelTranslation> {
    if (request.sourceLanguage === 'th') {
      return {
        translation: 'Спасибо',
        thaiText: request.text,
        pronunciationLatin: 'khop khun kha',
        pronunciationRussian: 'кхоп кхун кха',
      };
    }
    const female = request.speakerGender === 'female';
    return {
      translation: female ? 'ขอบคุณค่ะ' : 'ขอบคุณครับ',
      thaiText: female ? 'ขอบคุณค่ะ' : 'ขอบคุณครับ',
      pronunciationLatin: female ? 'khop khun kha' : 'khop khun khrap',
      pronunciationRussian: female ? 'кхоп кхун кха' : 'кхоп кхун кхрап',
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
  sessionSecret: 'e2e-session-secret-000000000000000000000000',
  corsOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  staticDir: resolve(process.cwd(), '../../apps/client/dist'),
};

const app = await buildApp({
  config,
  translator: new FixtureTranslator(),
  logger: false,
});
await app.listen({ host: config.host, port: config.port });
