import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  SpeakerGender,
  TranslationMode,
  TranslationRequest,
} from '@thai-translate/contracts';
import matter from 'gray-matter';

type PromptDefinition = {
  id: TranslationMode;
  label: string;
  body: string;
};

const modeFiles: Record<TranslationMode, string> = {
  'farang-ploy': 'farang-ploy.md',
  'thai-formal': 'thai-formal.md',
};

function findDefaultPromptsDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), 'config/prompts'),
    resolve(process.cwd(), '../../config/prompts'),
    resolve(moduleDirectory, '../../../config/prompts'),
    resolve(moduleDirectory, '../../../../config/prompts'),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error('Could not locate config/prompts');
  }
  return match;
}

function genderName(gender: SpeakerGender): string {
  return gender === 'male' ? 'male' : 'female';
}

export class PromptRepository {
  private readonly prompts: Map<TranslationMode, PromptDefinition>;

  constructor(directory = findDefaultPromptsDirectory()) {
    this.prompts = new Map(
      (Object.entries(modeFiles) as Array<[TranslationMode, string]>).map(
        ([mode, filename]) => {
          const source = readFileSync(resolve(directory, filename), 'utf8');
          const parsed = matter(source);
          if (parsed.data.id !== mode || typeof parsed.data.label !== 'string') {
            throw new Error(`Invalid prompt metadata in ${filename}`);
          }
          if (!parsed.content.trim()) {
            throw new Error(`Prompt ${filename} is empty`);
          }
          return [
            mode,
            {
              id: mode,
              label: parsed.data.label,
              body: parsed.content.trim(),
            },
          ];
        },
      ),
    );
  }

  render(request: TranslationRequest): string {
    const definition = this.prompts.get(request.mode);
    if (!definition) {
      throw new Error(`Unknown translation mode: ${request.mode}`);
    }
    const rendered = definition.body
      .replaceAll('{{sourceLanguage}}', request.sourceLanguage === 'ru' ? 'Russian' : 'Thai')
      .replaceAll('{{targetLanguage}}', request.targetLanguage === 'ru' ? 'Russian' : 'Thai')
      .replaceAll('{{speakerGender}}', genderName(request.speakerGender));

    if (rendered.includes('{{')) {
      throw new Error(`Prompt ${request.mode} contains unresolved placeholders`);
    }
    return rendered;
  }
}
