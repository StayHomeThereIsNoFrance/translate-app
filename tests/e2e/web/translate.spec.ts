import { expect, test } from '@playwright/test';

test('translates a Russian phrase and configures pronunciation glosses', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        getVoices() {
          return [];
        },
        pause() {},
        resume() {},
        speak(utterance: SpeechSynthesisUtterance) {
          (
            window as typeof window & { __spokenThai?: string }
          ).__spokenThai = utterance.text;
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('Thai AI Translate')).toBeVisible();

  await page.getByTestId('mode-control-thai-formal').click();
  await page.getByTestId('translation-input').fill('Спасибо');
  await page.getByTestId('translate-button').click();

  await expect(page.getByTestId('translation-output')).toHaveText('ขอบคุณครับ');
  await expect(page.getByTestId('thai-text')).toHaveText('ขอบคุณครับ');
  await expect(page.getByTestId('latin-pronunciation-word-0')).toHaveText('khop');
  await expect(page.getByTestId('russian-pronunciation-word-0')).toHaveText(
    'кхоп',
  );
  await expect(page.getByTestId('latin-word-translation-0')).toHaveText('thank');
  await expect(page.getByTestId('russian-word-translation-0')).toHaveText(
    'благодарить',
  );
  await page.getByTestId('speak-result').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __spokenThai?: string }).__spokenThai,
      ),
    )
    .toBe('ขอบคุณครับ');

  await page.getByTestId('copy-result').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    'ขอบคุณครับ',
  );

  await page.getByTestId('settings-button').click();
  const wordTranslationsSwitch = page.getByRole('switch', {
    name: 'Показывать перевод под словами',
  });
  await expect(wordTranslationsSwitch).toBeChecked();
  await wordTranslationsSwitch.click();
  await expect(page.getByTestId('latin-word-translation-0')).toBeHidden();
  await expect(page.getByTestId('russian-word-translation-0')).toBeHidden();
  await expect(page.getByTestId('latin-pronunciation-word-0')).toBeVisible();

  await page.reload();
  await page.getByTestId('settings-button').click();
  await expect(wordTranslationsSwitch).not.toBeChecked();
  await wordTranslationsSwitch.click();
});

test('changes gender and translation direction', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gender-control-female').click();
  await page.getByTestId('translation-input').fill('Спасибо');
  await page.getByTestId('translate-button').click();
  await expect(page.getByTestId('translation-output')).toHaveText('ขอบคุณค่ะ');

  await page.getByTestId('swap-languages').click();
  await expect(page.getByTestId('translation-input')).toHaveValue('ขอบคุณค่ะ');
  await page.getByTestId('translate-button').click();
  await expect(page.getByTestId('translation-output')).toHaveText('Спасибо');
});

test('shows a safe API error and retries successfully', async ({ page }) => {
  let failNextRequest = true;
  await page.route('**/api/v1/translate', async (route) => {
    if (failNextRequest) {
      failNextRequest = false;
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'UPSTREAM',
            message: 'Сервис перевода временно недоступен',
          },
          requestId: 'failed-request',
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('translation-input').fill('Спасибо');
  await page.getByTestId('translate-button').click();
  await expect(
    page.getByText('Сервис перевода временно недоступен'),
  ).toBeVisible();

  await page.getByTestId('retry-button').click();
  await expect(page.getByTestId('translation-output')).toHaveText('ขอบคุณครับ');
});
