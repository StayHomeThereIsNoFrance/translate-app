import { resolve } from 'node:path';

import { z } from 'zod';

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIPROXYAPI_BASE_URL: z.url().default('http://cliproxyapi:8317/v1'),
  CLIPROXYAPI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default('gpt-5.6-terra'),
  OPENAI_REASONING_EFFORT: z
    .enum(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
    .default('none'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:3000'),
  PROMPTS_DIR: z.string().optional(),
  STATIC_DIR: z.string().optional(),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  cliproxyBaseUrl: string;
  cliproxyApiKey: string;
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  timeoutMs: number;
  corsOrigins: string[];
  promptsDir?: string;
  staticDir?: string;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.parse(environment);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    cliproxyBaseUrl: parsed.CLIPROXYAPI_BASE_URL.replace(/\/$/, ''),
    cliproxyApiKey: parsed.CLIPROXYAPI_API_KEY,
    model: parsed.OPENAI_MODEL,
    reasoningEffort: parsed.OPENAI_REASONING_EFFORT,
    timeoutMs: parsed.OPENAI_TIMEOUT_MS,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    promptsDir: parsed.PROMPTS_DIR ? resolve(parsed.PROMPTS_DIR) : undefined,
    staticDir: parsed.STATIC_DIR ? resolve(parsed.STATIC_DIR) : undefined,
  };
}
