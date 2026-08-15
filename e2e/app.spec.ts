import { expect, test } from '@playwright/test';

test('starts, pauses, resumes, and exits a run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать забег' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать забег' }).click();
  const healthBar = page.getByLabel('Здоровье стража: 100 / 100');
  await expect(healthBar).toBeVisible();
  await expect(healthBar.locator('..').getByText('100 / 100', { exact: true })).toBeVisible();
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

test('shows the six equipment slots and the starting bow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Инвентарь' }).click();
  await expect(page.getByRole('dialog', { name: 'Инвентарь' })).toBeVisible();
  await expect(page.getByText('Короткий лук', { exact: true }).first()).toBeVisible();
  for (const slot of ['Лук', 'Колчан', 'Шлем', 'Броня', 'Перчатки', 'Штаны']) {
    const equipmentSlot = page.getByRole('button', { name: new RegExp(`^${slot}:`) });
    await expect(equipmentSlot).toBeVisible();
    await expect(equipmentSlot.locator('[data-equipment-icon]')).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'В рюкзаке' })).toBeVisible();
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

test('selects unlocked arenas only by vertical scrolling', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'bild-defence.save',
      JSON.stringify({
        version: 4,
        settings: {
          musicVolume: 0.7,
          effectsVolume: 0.8,
          vibration: true,
          reducedEffects: false,
        },
        progression: {
          completedRuns: 5,
          unspentStatPoints: 0,
          guardianTotalExperience: 0,
          maxUnlockedArena: 6,
          guardianStatUpgrades: {
            maxHealth: 0,
            maxBarrier: 0,
            armorPercent: 0,
            healthRegenPerSecond: 0,
            damage: 0,
            attacksPerSecond: 0,
            criticalChance: 0,
            criticalMultiplier: 0,
          },
        },
      }),
    );
  });
  await page.goto('/');

  const picker = page.getByRole('listbox', { name: 'Уровень арены' });
  await expect(picker.getByRole('option', { selected: true })).toHaveText('Арена 6');
  await expect(picker.getByText('Арена 7 · закрыта')).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Предыдущая арена' })).toHaveCount(0);

  for (const arena of [5, 4, 3, 2, 1]) {
    await picker.dispatchEvent('wheel', { deltaY: -100 });
    await expect(picker.getByRole('option', { selected: true })).toHaveText(`Арена ${arena}`);
  }
  await picker.dispatchEvent('wheel', { deltaY: -100 });
  await expect(picker.getByRole('option', { selected: true })).toHaveText('Арена 1');

  for (const arena of [2, 3, 4, 5, 6]) {
    await picker.dispatchEvent('wheel', { deltaY: 100 });
    await expect(picker.getByRole('option', { selected: true })).toHaveText(`Арена ${arena}`);
  }
  await picker.dispatchEvent('wheel', { deltaY: 100 });
  await expect(picker.getByRole('option', { selected: true })).toHaveText('Арена 6');
});
