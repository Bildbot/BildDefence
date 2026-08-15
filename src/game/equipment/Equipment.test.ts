import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EQUIPMENT,
  applyEquipmentToGuardian,
  addItems,
  equipItem,
  generateVictoryLoot,
  getStrongestAffixTier,
  orderAffixes,
  getEquippedItem,
} from './Equipment';
import { FIRST_COMBAT } from '../../content/firstCombat';

describe('Equipment', () => {
  it('generates three deterministic arena-level rewards', () => {
    const first = generateVictoryLoot(21, 7);
    expect(first).toEqual(generateVictoryLoot(21, 7));
    expect(first).toHaveLength(3);
    expect(first.every((item) => item.affixes.length === item.affixCount)).toBe(true);
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
    expect(rare?.affixes.every((affix) => affix.label && affix.valueLabel && affix.tier >= 6)).toBe(
      true,
    );
  });

  it('unlocks eight affix tiers with T1 reserved for item level 100', () => {
    expect([1, 11, 21, 36, 51, 66, 81, 99, 100].map(getStrongestAffixTier)).toEqual([
      8, 7, 6, 5, 4, 3, 2, 2, 1,
    ]);
  });

  it('adds flat bow damage before applying increased physical damage', () => {
    const bow = {
      ...DEFAULT_EQUIPMENT.items[0]!,
      id: 'test-hybrid-bow',
      affixCount: 2,
      affixes: [
        {
          family: 'flat-physical-damage',
          kind: 'prefix' as const,
          label: 'Дополнительный физический урон',
          tier: 8,
          value: 2,
          secondaryValue: 4,
          valueLabel: '+2–4',
          modifier: 'flatDamage' as const,
        },
        {
          family: 'hybrid-physical-damage',
          kind: 'prefix' as const,
          label: 'Физический и дополнительный физический урон',
          tier: 8,
          value: 0.1,
          addedMinimumDamage: 1,
          addedMaximumDamage: 2,
          valueLabel: '+10% · +1–2',
          modifier: 'damage' as const,
        },
      ],
    };
    const guardian = applyEquipmentToGuardian(FIRST_COMBAT.guardian, {
      items: [bow],
      equipped: { bow: bow.id },
    });
    expect(guardian.minimumDamage).toBe(18);
    expect(guardian.maximumDamage).toBe(28);
  });

  it('applies bow attack speed locally and orders prefixes above suffixes', () => {
    const prefix = {
      family: 'damage',
      kind: 'prefix' as const,
      label: 'Увеличение физического урона',
      tier: 8,
      value: 0.1,
      valueLabel: '+10%',
      modifier: 'damage' as const,
    };
    const suffix = {
      family: 'attack-speed',
      kind: 'suffix' as const,
      label: 'Скорость атаки',
      tier: 8,
      value: 0.04,
      valueLabel: '+4%',
      modifier: 'localAttackSpeed' as const,
    };
    const bow = {
      ...DEFAULT_EQUIPMENT.items[0]!,
      id: 'test-speed-bow',
      affixCount: 2,
      affixes: [suffix, prefix],
    };
    const guardian = applyEquipmentToGuardian(FIRST_COMBAT.guardian, {
      items: [bow],
      equipped: { bow: bow.id },
    });
    expect(guardian.attacksPerSecond).toBeCloseTo(1.55 * 1.04);
    expect(orderAffixes(bow.affixes)).toEqual([prefix, suffix]);
  });

  it('applies local bow critical chance, combat properties, and global crit chance', () => {
    const bow = {
      ...DEFAULT_EQUIPMENT.items[0]!,
      id: 'test-critical-bow',
      affixCount: 3,
      affixes: [
        {
          family: 'critical-chance',
          kind: 'suffix' as const,
          label: 'Шанс критического удара',
          tier: 1,
          value: 1,
          valueLabel: '+100%',
          modifier: 'localCriticalChance' as const,
        },
        {
          family: 'ricochet',
          kind: 'suffix' as const,
          label: 'Рикошет',
          tier: 1,
          value: 3,
          secondaryValue: 0.7,
          valueLabel: '3 · 70% урона',
          modifier: 'ricochet' as const,
        },
        {
          family: 'additional-projectiles',
          kind: 'suffix' as const,
          label: 'Дополнительные стрелы',
          tier: 3,
          value: 1,
          valueLabel: '+1',
          modifier: 'additionalProjectiles' as const,
        },
      ],
    };
    const quiver = {
      ...bow,
      id: 'test-critical-quiver',
      slot: 'quiver' as const,
      affixCount: 1,
      affixes: [
        {
          ...bow.affixes[0]!,
          value: 0.05,
          valueLabel: '+5%',
          modifier: 'criticalChance' as const,
        },
      ],
    };
    const guardian = applyEquipmentToGuardian(FIRST_COMBAT.guardian, {
      items: [bow, quiver],
      equipped: { bow: bow.id, quiver: quiver.id },
    });
    expect(guardian.criticalChance).toBeCloseTo(0.15);
    expect(guardian.ricochetCount).toBe(3);
    expect(guardian.ricochetDamageMultiplier).toBe(0.7);
    expect(guardian.additionalProjectiles).toBe(1);
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
