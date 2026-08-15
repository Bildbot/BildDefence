import type { GuardianDefinition } from '../../content/firstCombat';

export const GUARDIAN_STAT_UPGRADE_KEYS = [
  'maxHealth',
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
  maximumUpgrades?: number;
}>;

export const GUARDIAN_STAT_UPGRADE_RULES: Readonly<
  Record<GuardianStatUpgradeKey, GuardianStatUpgradeRule>
> = {
  maxHealth: { increment: 10 },
  healthRegenPerSecond: { increment: 0.1, maximum: 5 },
  damage: { increment: 2 },
  attacksPerSecond: { increment: 0.075, maximum: 3 },
  criticalChance: { increment: 0.02, maximum: 1, maximumUpgrades: 20 },
  criticalMultiplier: { increment: 0.15, maximum: 3 },
};

export const DEFAULT_GUARDIAN_STAT_UPGRADES: GuardianStatUpgrades = {
  maxHealth: 0,
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
    healthRegenPerSecond: applyUpgrade(
      base.healthRegenPerSecond,
      upgrades.healthRegenPerSecond,
      GUARDIAN_STAT_UPGRADE_RULES.healthRegenPerSecond,
    ),
    minimumDamage: applyUpgrade(
      base.minimumDamage,
      upgrades.damage,
      GUARDIAN_STAT_UPGRADE_RULES.damage,
    ),
    maximumDamage: applyUpgrade(
      base.maximumDamage,
      upgrades.damage,
      GUARDIAN_STAT_UPGRADE_RULES.damage,
    ),
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
  if (stat === 'damage') return true;
  const rule = GUARDIAN_STAT_UPGRADE_RULES[stat];
  if (rule.maximumUpgrades !== undefined && upgrades[stat] >= rule.maximumUpgrades) return false;
  if (rule.maximum === undefined) return true;
  return applyUpgrade(base[stat], upgrades[stat], rule) < rule.maximum;
}

function applyUpgrade(base: number, count: number, rule: GuardianStatUpgradeRule): number {
  const upgradeCount = Math.min(
    Math.max(0, Math.floor(count)),
    rule.maximumUpgrades ?? Number.POSITIVE_INFINITY,
  );
  const upgraded = base + upgradeCount * rule.increment;
  return roundStat(rule.maximum === undefined ? upgraded : Math.min(rule.maximum, upgraded));
}

function roundStat(value: number): number {
  return Math.round(value * 1000) / 1000;
}
