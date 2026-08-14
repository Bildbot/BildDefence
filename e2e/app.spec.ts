import { expect, test } from '@playwright/test';

test('starts, pauses, resumes, and exits a run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BILD DEFENCE' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать забег' }).click();
  const healthBar = page.getByLabel('Здоровье стража: 100 / 100');
  await expect(healthBar).toBeVisible();
  await expect(healthBar).toHaveText('100 / 100');
  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByRole('heading', { name: 'Пауза' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('button', { name: 'Пауза' }).click();
  await page.getByRole('button', { name: 'Выйти в меню' }).click();
  await expect(page.getByRole('heading', { name: 'Завершить забег?' })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить' }).click();
  await expect(page.getByRole('button', { name: 'Начать забег' })).toBeVisible();
});

test('persists settings across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('checkbox', { name: 'Вибрация' }).uncheck();
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('checkbox', { name: 'Вибрация' })).not.toBeChecked();
});

test('keeps the same logical arena on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  const frame = page.getByTestId('game-frame');
  const desktopBox = await frame.boundingBox();
  expect(desktopBox?.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 360, height: 760 });
  const mobileBox = await frame.boundingBox();
  expect(mobileBox?.width).toBeLessThanOrEqual(390);
  await expect(frame).toBeVisible();
});
