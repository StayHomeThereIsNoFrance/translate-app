import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const key = 'test-api-key';

describe('loadConfig', () => {
  it('loads development defaults and normalizes values', () => {
    const config = loadConfig({
      CLIPROXYAPI_API_KEY: key,
      CLIPROXYAPI_BASE_URL: 'http://localhost:8317/v1/',
      CORS_ORIGINS: ' https://one.test,https://two.test, ',
      PORT: '4321',
    });

    expect(config).toMatchObject({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 4321,
      cliproxyBaseUrl: 'http://localhost:8317/v1',
      model: 'gpt-5.6-terra',
      reasoningEffort: 'none',
      corsOrigins: ['https://one.test', 'https://two.test'],
    });
    expect(config.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('requires access and session secrets in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        CLIPROXYAPI_API_KEY: key,
      }),
    ).toThrow('APP_ACCESS_PIN');

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        CLIPROXYAPI_API_KEY: key,
        APP_ACCESS_PIN: '2468',
      }),
    ).toThrow('SESSION_SECRET');
  });

  it('accepts explicit production paths and secrets', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      CLIPROXYAPI_API_KEY: key,
      APP_ACCESS_PIN: '2468',
      SESSION_SECRET: 's'.repeat(40),
      PROMPTS_DIR: './config/prompts',
      STATIC_DIR: './apps/client/dist',
    });

    expect(config.accessPin).toBe('2468');
    expect(config.sessionSecret).toBe('s'.repeat(40));
    expect(config.promptsDir).toMatch(/config\/prompts$/);
    expect(config.staticDir).toMatch(/apps\/client\/dist$/);
  });
});
