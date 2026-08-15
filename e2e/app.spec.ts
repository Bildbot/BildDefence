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

test('browses the backpack and filters items from equipment slots', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Инвентарь' }).click();
  await expect(page.getByRole('dialog', { name: 'Инвентарь' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Рюкзак/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Короткий лук', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Предметы в рюкзаке')).toBeVisible();

  await page.getByRole('tab', { name: 'Экипировка' }).click();
  for (const slot of ['Лук', 'Колчан', 'Шлем', 'Броня', 'Перчатки', 'Штаны']) {
    const equipmentSlot = page.getByRole('button', { name: new RegExp(`^${slot}:`) });
    await expect(equipmentSlot).toBeVisible();
    await expect(equipmentSlot.locator('[data-equipment-icon]')).toBeVisible();
  }

  await page.getByRole('button', { name: /^Шлем:/ }).click();
  await expect(page.getByRole('tab', { name: /Рюкзак/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Фильтр: Шлем' })).toHaveClass(/active/);
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

test('selects unlocked arenas with navigation and scrolling', async ({ page }) => {
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

  const picker = page.getByLabel('Выбор уровня арены');
  await expect(picker.getByText('АРЕНА 6')).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Предыдущая арена' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Арена заблокирована' })).toBeDisabled();

  for (const arena of [5, 4, 3, 2, 1]) {
    await picker.dispatchEvent('wheel', { deltaY: -100 });
    await expect(picker.getByText(`АРЕНА ${arena}`)).toBeVisible();
  }
  await picker.dispatchEvent('wheel', { deltaY: -100 });
  await expect(picker.getByText('АРЕНА 1')).toBeVisible();

  for (const arena of [2, 3, 4, 5, 6]) {
    await picker.dispatchEvent('wheel', { deltaY: 100 });
    await expect(picker.getByText(`АРЕНА ${arena}`)).toBeVisible();
  }
  await picker.dispatchEvent('wheel', { deltaY: 100 });
  await expect(picker.getByText('АРЕНА 6')).toBeVisible();
});
