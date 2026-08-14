import type { GuardianDefinition } from '../../content/firstCombat';

export const GUARDIAN_STAT_UPGRADE_KEYS = [
  'maxHealth',
  'maxBarrier',
  'armorPercent',
  'healthRegenPerSecond',
  'damage',
  'attacksPerSecond',
  'criticalChance',
  'criticalMultiplier',
] as const;

export type GuardianStatUpgradeKey = (typeof GUARDIAN_STAT_UPGRADE_KEYS)[number];

export type GuardianStatUpgrades = Readonly<Record<GuardianStatUpgradeKey, number>>;

type GuardianStatUpgradeRule = Readonly<{
  increment: number;
  maximum?: number;
}>;

export const GUARDIAN_STAT_UPGRADE_RULES: Readonly<
  Record<GuardianStatUpgradeKey, GuardianStatUpgradeRule>
> = {
  maxHealth: { increment: 10 },
  maxBarrier: { increment: 5 },
  armorPercent: { increment: 0.02, maximum: 0.5 },
  healthRegenPerSecond: { increment: 0.1, maximum: 5 },
  damage: { increment: 2 },
  attacksPerSecond: { increment: 0.075, maximum: 3 },
  criticalChance: { increment: 0.03, maximum: 0.5 },
  criticalMultiplier: { increment: 0.15, maximum: 3 },
};

export const DEFAULT_GUARDIAN_STAT_UPGRADES: GuardianStatUpgrades = {
  maxHealth: 0,
  maxBarrier: 0,
  armorPercent: 0,
  healthRegenPerSecond: 0,
  damage: 0,
  attacksPerSecond: 0,
  criticalChance: 0,
  criticalMultiplier: 0,
};

export function applyGuardianStatUpgrades(
  base: GuardianDefinition,
  upgrades: GuardianStatUpgrades,
): GuardianDefinition {
  return {
    ...base,
    maxHealth: applyUpgrade(
      base.maxHealth,
      upgrades.maxHealth,
      GUARDIAN_STAT_UPGRADE_RULES.maxHealth,
    ),
    maxBarrier: applyUpgrade(
      base.maxBarrier,
      upgrades.maxBarrier,
      GUARDIAN_STAT_UPGRADE_RULES.maxBarrier,
    ),
    armorPercent: applyUpgrade(
      base.armorPercent,
      upgrades.armorPercent,
      GUARDIAN_STAT_UPGRADE_RULES.armorPercent,
    ),
    healthRegenPerSecond: applyUpgrade(
      base.healthRegenPerSecond,
      upgrades.healthRegenPerSecond,
      GUARDIAN_STAT_UPGRADE_RULES.healthRegenPerSecond,
    ),
    damage: applyUpgrade(base.damage, upgrades.damage, GUARDIAN_STAT_UPGRADE_RULES.damage),
    attacksPerSecond: applyUpgrade(
      base.attacksPerSecond,
      upgrades.attacksPerSecond,
      GUARDIAN_STAT_UPGRADE_RULES.attacksPerSecond,
    ),
    criticalChance: applyUpgrade(
      base.criticalChance,
      upgrades.criticalChance,
      GUARDIAN_STAT_UPGRADE_RULES.criticalChance,
    ),
    criticalMultiplier: applyUpgrade(
      base.criticalMultiplier,
      upgrades.criticalMultiplier,
      GUARDIAN_STAT_UPGRADE_RULES.criticalMultiplier,
    ),
  };
}

export function canUpgradeGuardianStat(
  base: GuardianDefinition,
  upgrades: GuardianStatUpgrades,
  stat: GuardianStatUpgradeKey,
): boolean {
  const rule = GUARDIAN_STAT_UPGRADE_RULES[stat];
  if (rule.maximum === undefined) return true;
  return applyUpgrade(base[stat], upgrades[stat], rule) < rule.maximum;
}

function applyUpgrade(base: number, count: number, rule: GuardianStatUpgradeRule): number {
  const upgraded = base + Math.max(0, Math.floor(count)) * rule.increment;
  return roundStat(rule.maximum === undefined ? upgraded : Math.min(rule.maximum, upgraded));
}

function roundStat(value: number): number {
  return Math.round(value * 1000) / 1000;
}
