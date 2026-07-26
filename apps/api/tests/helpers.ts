import type { AppConfig } from '../src/config.js';

export const testConfig: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  cliproxyBaseUrl: 'http://127.0.0.1:8318/v1',
  cliproxyApiKey: 'test-key',
  model: 'gpt-5.6-terra',
  reasoningEffort: 'none',
  timeoutMs: 5000,
  sessionSecret: 'test-session-secret-0000000000000000000000',
  corsOrigins: ['http://localhost:8081'],
  promptsDir: new URL('../../../config/prompts', import.meta.url).pathname,
};
