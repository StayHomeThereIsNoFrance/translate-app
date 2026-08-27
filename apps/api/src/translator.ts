import type {
  ModelTranslation,
  TranslationRequest,
} from '@thai-translate/contracts';
import { ModelTranslationSchema } from '@thai-translate/contracts';
import OpenAI from 'openai';

import type { AppConfig } from './config.js';
import { PromptRepository } from './prompts.js';

export interface TranslationService {
  translate(request: TranslationRequest): Promise<ModelTranslation>;
}

export class TranslationProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'upstream' | 'invalid_response' | 'refusal',
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = 'TranslationProviderError';
  }
}

const translationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    translation: { type: 'string', minLength: 1 },
    thaiText: { type: 'string', minLength: 1 },
    pronunciationWords: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          latin: { type: 'string', minLength: 1 },
          russian: { type: 'string', minLength: 1 },
          englishTranslation: { type: 'string', minLength: 1 },
          russianTranslation: { type: 'string', minLength: 1 },
        },
        required: [
          'latin',
          'russian',
          'englishTranslation',
          'russianTranslation',
        ],
      },
    },
  },
  required: ['translation', 'thaiText', 'pronunciationWords'],
} as const;

export class CliproxyTranslationService implements TranslationService {
  private readonly client: Pick<OpenAI, 'responses'>;

  constructor(
    private readonly config: AppConfig,
    private readonly prompts = new PromptRepository(config.promptsDir),
    client?: Pick<OpenAI, 'responses'>,
  ) {
    this.client =
      client ??
      new OpenAI({
        apiKey: config.cliproxyApiKey,
        baseURL: config.cliproxyBaseUrl,
        timeout: config.timeoutMs,
        maxRetries: 1,
      });
  }

  async translate(request: TranslationRequest): Promise<ModelTranslation> {
    try {
      const response = await this.client.responses.create({
        model: this.config.model,
        reasoning: { effort: this.config.reasoningEffort },
        store: false,
        instructions: this.prompts.render(request),
        input: request.text,
        max_output_tokens: 1000,
        text: {
          format: {
            type: 'json_schema',
            name: 'thai_translation',
            strict: true,
            schema: translationJsonSchema,
          },
        },
      });

      if (!response.output_text) {
        const refusal = response.output
          .flatMap((item) => (item.type === 'message' ? item.content : []))
          .find((item) => item.type === 'refusal');
        if (refusal && 'refusal' in refusal) {
          throw new TranslationProviderError(
            refusal.refusal,
            'refusal',
            422,
          );
        }
        throw new TranslationProviderError(
          'The translation provider returned no text',
          'invalid_response',
        );
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(response.output_text);
      } catch {
        throw new TranslationProviderError(
          'The translation provider returned invalid JSON',
          'invalid_response',
        );
      }
      const translated = ModelTranslationSchema.safeParse(decoded);
      if (!translated.success) {
        throw new TranslationProviderError(
          'The translation provider response did not match the contract',
          'invalid_response',
        );
      }

      return request.sourceLanguage === 'th'
        ? { ...translated.data, thaiText: request.text.trim() }
        : translated.data;
    } catch (error) {
      if (error instanceof TranslationProviderError) {
        throw error;
      }
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new TranslationProviderError(
          'Translation timed out',
          'timeout',
          504,
        );
      }
      const detail = error instanceof Error ? error.message : 'Unknown upstream error';
      throw new TranslationProviderError(detail, 'upstream', 502);
    }
  }
}
