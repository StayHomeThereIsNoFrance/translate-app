import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PromptRepository } from '../src/prompts.js';
import { testConfig } from './helpers.js';

describe('PromptRepository', () => {
  const prompts = new PromptRepository(testConfig.promptsDir);
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('renders the selected mode and gender without unresolved variables', () => {
    const rendered = prompts.render({
      text: 'Спасибо',
      sourceLanguage: 'ru',
      targetLanguage: 'th',
      mode: 'thai-formal',
      speakerGender: 'female',
    });

    expect(rendered).toContain('female');
    expect(rendered).toContain('ค่ะ');
    expect(rendered).not.toContain('{{');
    expect(rendered).not.toContain('Farang - Ploy');
  });

  it('keeps the informal prompt distinct', () => {
    const rendered = prompts.render({
      text: 'Привет',
      sourceLanguage: 'ru',
      targetLanguage: 'th',
      mode: 'farang-ploy',
      speakerGender: 'male',
    });
    expect(rendered).toContain('relaxed personal chat');
    expect(rendered).toContain('male');
  });

  it('renders the reverse language direction and female gender', () => {
    const rendered = prompts.render({
      text: 'สวัสดีค่ะ',
      sourceLanguage: 'th',
      targetLanguage: 'ru',
      mode: 'thai-formal',
      speakerGender: 'female',
    });
    expect(rendered).toContain('Thai');
    expect(rendered).toContain('Russian');
    expect(rendered).toContain('female');
  });

  it('rejects missing metadata, empty prompts and unresolved placeholders', () => {
    const makeDirectory = (formal: string) => {
      const directory = mkdtempSync(resolve(tmpdir(), 'thai-prompts-'));
      temporaryDirectories.push(directory);
      writeFileSync(
        resolve(directory, 'farang-ploy.md'),
        '---\nid: farang-ploy\nlabel: Informal\n---\nValid prompt',
      );
      writeFileSync(resolve(directory, 'thai-formal.md'), formal);
      return directory;
    };

    expect(
      () =>
        new PromptRepository(
          makeDirectory('---\nid: wrong\nlabel: Formal\n---\nPrompt'),
        ),
    ).toThrow('Invalid prompt metadata');

    expect(
      () =>
        new PromptRepository(
          makeDirectory('---\nid: thai-formal\nlabel: Formal\n---\n'),
        ),
    ).toThrow('empty');

    const unresolved = new PromptRepository(
      makeDirectory(
        '---\nid: thai-formal\nlabel: Formal\n---\n{{unknownValue}}',
      ),
    );
    expect(() =>
      unresolved.render({
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'thai-formal',
        speakerGender: 'male',
      }),
    ).toThrow('unresolved placeholders');
  });

  it('rejects an unknown runtime mode defensively', () => {
    expect(() =>
      prompts.render({
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'not-a-mode',
        speakerGender: 'male',
      } as never),
    ).toThrow('Unknown translation mode');
  });
});
