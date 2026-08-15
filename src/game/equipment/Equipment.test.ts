import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EQUIPMENT,
  applyEquipmentToGuardian,
  addItems,
  equipItem,
  generateVictoryLoot,
  getEquippedItem,
} from './Equipment';
import { FIRST_COMBAT } from '../../content/firstCombat';

describe('Equipment', () => {
  it('generates three deterministic arena-level rewards', () => {
    const first = generateVictoryLoot(21, 7);
    expect(first).toEqual(generateVictoryLoot(21, 7));
    expect(first).toHaveLength(3);
    expect(first.every((item) => item.level === 21 && (item.rank === 2 || item.rank === 3))).toBe(
      true,
    );
  });

  it('generates named affixes and applies their modifiers', () => {
    const rare = Array.from({ length: 50 }, (_, runId) => generateVictoryLoot(21, runId))
      .flat()
      .find((item) => item.rarity === 'rare');
    expect(rare).toBeDefined();
    expect(rare?.affixes).toHaveLength(rare?.affixCount ?? 0);
    expect(rare?.affixes.every((affix) => affix.label && affix.valueLabel && affix.tier >= 8)).toBe(
      true,
    );
  });

  it('starts with the agreed short bow and equips owned items by slot', () => {
    const reward = generateVictoryLoot(1, 3)[0];
    expect(getEquippedItem(DEFAULT_EQUIPMENT, 'bow')?.name).toBe('Короткий лук');
    if (!reward) return;
    const withReward = addItems(DEFAULT_EQUIPMENT, [reward]);
    expect(getEquippedItem(equipItem(withReward, reward.id), reward.slot)?.id).toBe(reward.id);
  });

  it('applies equipped bow and armor base stats to combat', () => {
    const loot = generateVictoryLoot(91, 15);
    const withLoot = addItems(DEFAULT_EQUIPMENT, loot);
    const armor = loot.find((item) => item.armorPercent !== undefined);
    if (!armor) return;
    const guardian = applyEquipmentToGuardian(FIRST_COMBAT.guardian, equipItem(withLoot, armor.id));
    const affixArmor = armor.affixes
      .filter((affix) => affix.modifier === 'armor')
      .reduce((total, affix) => total + affix.value, 0);
    expect(guardian.armorPercent).toBeCloseTo((armor.armorPercent ?? 0) + affixArmor);
  });
});
