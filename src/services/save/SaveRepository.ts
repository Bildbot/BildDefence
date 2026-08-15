import { MAX_ARENA_LEVEL } from '../../content/arenaBalance';
import { FIRST_COMBAT } from '../../content/firstCombat';
import {
  MAX_GUARDIAN_LEVEL,
  getGuardianLevelForTotalExperience,
  getTotalExperienceAfterDeath,
  getTotalExperienceToReachGuardianLevel,
} from '../../game/progression/GuardianProgression';
import {
  DEFAULT_GUARDIAN_STAT_UPGRADES,
  GUARDIAN_STAT_UPGRADE_KEYS,
  canUpgradeGuardianStat,
  type GuardianStatUpgradeKey,
  type GuardianStatUpgrades,
} from '../../game/progression/GuardianStats';
import {
  DEFAULT_EQUIPMENT,
  addItems,
  applyEquipmentToGuardian,
  equipItem,
  isEquipmentState,
  type EquipmentItem,
  type EquipmentState,
} from '../../game/equipment/Equipment';
import { SAVE_KEY, SAVE_VERSION } from '../../shared/constants';
import type { StorageAdapter } from '../storage/StorageAdapter';

export type GameSettings = Readonly<{
  musicVolume: number;
  effectsVolume: number;
  vibration: boolean;
  reducedEffects: boolean;
}>;

export type GameProgression = Readonly<{
  completedRuns: number;
  unspentStatPoints: number;
  guardianTotalExperience: number;
  maxUnlockedArena: number;
  guardianStatUpgrades: GuardianStatUpgrades;
  equipment: EquipmentState;
}>;

export type RunSettlement = Readonly<{
  arenaLevel: number;
  result: 'victory' | 'defeat';
  guardianTotalExperience: number;
}>;

export type SaveDataV6 = Readonly<{
  version: 6;
  settings: GameSettings;
  progression: GameProgression;
}>;

type LegacySaveDataV5 = Readonly<{
  version: 5;
  settings: GameSettings;
  progression: Omit<GameProgression, 'equipment'>;
}>;

type LegacyGuardianStatUpgrades = Readonly<
  Record<GuardianStatUpgradeKey | 'maxBarrier' | 'armorPercent', number>
>;

type LegacySaveDataV4 = Readonly<{
  version: 4;
  settings: GameSettings;
  progression: Omit<GameProgression, 'guardianStatUpgrades' | 'equipment'> &
    Readonly<{ guardianStatUpgrades: LegacyGuardianStatUpgrades }>;
}>;

type LegacySaveDataV3 = Readonly<{
  version: 3;
  settings: GameSettings;
  progression: Readonly<{
    completedRuns: number;
    unspentStatPoints: number;
    guardianTotalExperience: number;
    guardianStatUpgrades: LegacyGuardianStatUpgrades;
  }>;
}>;

type LegacySaveDataV2 = Readonly<{
  version: 2;
  settings: GameSettings;
  progression: Readonly<{
    completedRuns: number;
    unspentStatPoints: number;
    guardianStatUpgrades: LegacyGuardianStatUpgrades;
  }>;
}>;

type LegacySaveDataV1 = Readonly<{
  version: 1;
  settings: GameSettings;
  progression: Readonly<{ completedRuns: number }>;
}>;

const MAX_TOTAL_EXPERIENCE = getTotalExperienceToReachGuardianLevel(MAX_GUARDIAN_LEVEL);

export const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 0.7,
  effectsVolume: 0.8,
  vibration: true,
  reducedEffects: false,
};

export const DEFAULT_PROGRESSION: GameProgression = {
  completedRuns: 0,
  unspentStatPoints: 0,
  guardianTotalExperience: 0,
  maxUnlockedArena: 1,
  guardianStatUpgrades: DEFAULT_GUARDIAN_STAT_UPGRADES,
  equipment: DEFAULT_EQUIPMENT,
};

export const DEFAULT_SAVE: SaveDataV6 = {
  version: SAVE_VERSION,
  settings: DEFAULT_SETTINGS,
  progression: DEFAULT_PROGRESSION,
};

export class SaveRepository {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StorageAdapter) {}

  async load(): Promise<SaveDataV6> {
    const raw = await this.storage.read(SAVE_KEY);
    if (raw === null) return DEFAULT_SAVE;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isSaveDataV6(parsed)) return parsed;
      if (isLegacySaveDataV5(parsed)) {
        const migrated = migrateLegacySaveV5(parsed);
        await this.storage.write(SAVE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      if (isLegacySaveDataV4(parsed)) {
        const migrated = migrateLegacySaveV4(parsed);
        await this.storage.write(SAVE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      if (isLegacySaveDataV3(parsed)) {
        const migrated = migrateLegacySaveV3(parsed);
        await this.storage.write(SAVE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      if (isLegacySaveDataV2(parsed)) {
        const migrated = migrateLegacySaveV2(parsed);
        await this.storage.write(SAVE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      if (isLegacySaveDataV1(parsed)) {
        const migrated = migrateLegacySaveV1(parsed);
        await this.storage.write(SAVE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      throw new Error('Unsupported or invalid save');
    } catch {
      await this.storage.quarantine(SAVE_KEY, raw);
      await this.storage.remove(SAVE_KEY);
      return DEFAULT_SAVE;
    }
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    await this.mutate((current) => ({ ...current, settings }));
  }

  async settleRun(settlement: RunSettlement): Promise<GameProgression> {
    validateRunSettlement(settlement);

    let nextProgression = DEFAULT_PROGRESSION;
    await this.mutate((current) => {
      const previousExperience = current.progression.guardianTotalExperience;
      const runExperience = Math.max(previousExperience, settlement.guardianTotalExperience);
      const nextExperience =
        settlement.result === 'defeat'
          ? getTotalExperienceAfterDeath(runExperience)
          : runExperience;
      const previousLevel = getGuardianLevelForTotalExperience(previousExperience);
      const nextLevel = getGuardianLevelForTotalExperience(nextExperience);
      const statPointsEarned = Math.max(0, nextLevel - previousLevel);
      const unlockedAfterVictory =
        settlement.result === 'victory'
          ? Math.min(MAX_ARENA_LEVEL, settlement.arenaLevel + 1)
          : current.progression.maxUnlockedArena;

      nextProgression = {
        ...current.progression,
        completedRuns: current.progression.completedRuns + 1,
        unspentStatPoints: current.progression.unspentStatPoints + statPointsEarned,
        guardianTotalExperience: nextExperience,
        maxUnlockedArena: Math.max(current.progression.maxUnlockedArena, unlockedAfterVictory),
      };
      return { ...current, progression: nextProgression };
    });
    return nextProgression;
  }

  async spendGuardianStatPoint(stat: GuardianStatUpgradeKey): Promise<GameProgression> {
    let nextProgression = DEFAULT_PROGRESSION;
    await this.mutate((current) => {
      nextProgression = current.progression;
      if (current.progression.unspentStatPoints === 0) return current;
      if (
        !canUpgradeGuardianStat(
          applyEquipmentToGuardian(FIRST_COMBAT.guardian, current.progression.equipment),
          current.progression.guardianStatUpgrades,
          stat,
        )
      ) {
        return current;
      }

      nextProgression = {
        ...current.progression,
        unspentStatPoints: current.progression.unspentStatPoints - 1,
        guardianStatUpgrades: {
          ...current.progression.guardianStatUpgrades,
          [stat]: current.progression.guardianStatUpgrades[stat] + 1,
        },
      };
      return { ...current, progression: nextProgression };
    });
    return nextProgression;
  }

  async addVictoryLoot(items: readonly EquipmentItem[]): Promise<GameProgression> {
    let nextProgression = DEFAULT_PROGRESSION;
    await this.mutate((current) => {
      nextProgression = {
        ...current.progression,
        equipment: addItems(current.progression.equipment, items),
      };
      return { ...current, progression: nextProgression };
    });
    return nextProgression;
  }

  async equipItem(itemId: string): Promise<GameProgression> {
    let nextProgression = DEFAULT_PROGRESSION;
    await this.mutate((current) => {
      nextProgression = {
        ...current.progression,
        equipment: equipItem(current.progression.equipment, itemId),
      };
      return { ...current, progression: nextProgression };
    });
    return nextProgression;
  }

  private async mutate(transform: (current: SaveDataV6) => SaveDataV6): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      const current = await this.load();
      const next = transform(current);
      await this.storage.write(SAVE_KEY, JSON.stringify(next));
    });
    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}

function migrateLegacySaveV5(save: LegacySaveDataV5): SaveDataV6 {
  return {
    version: SAVE_VERSION,
    settings: save.settings,
    progression: { ...save.progression, equipment: DEFAULT_EQUIPMENT },
  };
}

function validateRunSettlement(settlement: RunSettlement): void {
  if (
    !Number.isInteger(settlement.guardianTotalExperience) ||
    settlement.guardianTotalExperience < 0 ||
    settlement.guardianTotalExperience > MAX_TOTAL_EXPERIENCE
  ) {
    throw new RangeError('Guardian experience must be a valid total experience value');
  }
  if (
    !Number.isInteger(settlement.arenaLevel) ||
    settlement.arenaLevel < 1 ||
    settlement.arenaLevel > MAX_ARENA_LEVEL
  ) {
    throw new RangeError(`Arena level must be between 1 and ${MAX_ARENA_LEVEL}`);
  }
}

function migrateGuardianStatUpgrades(upgrades: LegacyGuardianStatUpgrades): GuardianStatUpgrades {
  return {
    maxHealth: upgrades.maxHealth,
    healthRegenPerSecond: upgrades.healthRegenPerSecond,
    damage: upgrades.damage,
    attacksPerSecond: upgrades.attacksPerSecond,
    criticalChance: upgrades.criticalChance,
    criticalMultiplier: upgrades.criticalMultiplier,
  };
}

function migrateLegacySaveV4(save: LegacySaveDataV4): SaveDataV6 {
  const removedStatPoints =
    save.progression.guardianStatUpgrades.maxBarrier +
    save.progression.guardianStatUpgrades.armorPercent;
  return {
    version: SAVE_VERSION,
    settings: save.settings,
    progression: {
      ...save.progression,
      unspentStatPoints: save.progression.unspentStatPoints + removedStatPoints,
      guardianStatUpgrades: migrateGuardianStatUpgrades(save.progression.guardianStatUpgrades),
      equipment: DEFAULT_EQUIPMENT,
    },
  };
}

function migrateLegacySaveV3(save: LegacySaveDataV3): SaveDataV6 {
  const removedStatPoints =
    save.progression.guardianStatUpgrades.maxBarrier +
    save.progression.guardianStatUpgrades.armorPercent;
  return {
    version: SAVE_VERSION,
    settings: save.settings,
    progression: {
      ...save.progression,
      unspentStatPoints: save.progression.unspentStatPoints + removedStatPoints,
      guardianStatUpgrades: migrateGuardianStatUpgrades(save.progression.guardianStatUpgrades),
      maxUnlockedArena: 1,
      equipment: DEFAULT_EQUIPMENT,
    },
  };
}

function migrateLegacySaveV2(save: LegacySaveDataV2): SaveDataV6 {
  const removedStatPoints =
    save.progression.guardianStatUpgrades.maxBarrier +
    save.progression.guardianStatUpgrades.armorPercent;
  return {
    version: SAVE_VERSION,
    settings: save.settings,
    progression: {
      ...save.progression,
      unspentStatPoints: save.progression.unspentStatPoints + removedStatPoints,
      guardianStatUpgrades: migrateGuardianStatUpgrades(save.progression.guardianStatUpgrades),
      guardianTotalExperience: 0,
      maxUnlockedArena: 1,
      equipment: DEFAULT_EQUIPMENT,
    },
  };
}

function migrateLegacySaveV1(save: LegacySaveDataV1): SaveDataV6 {
  return {
    version: SAVE_VERSION,
    settings: save.settings,
    progression: {
      completedRuns: save.progression.completedRuns,
      unspentStatPoints: 0,
      guardianTotalExperience: 0,
      maxUnlockedArena: 1,
      guardianStatUpgrades: { ...DEFAULT_GUARDIAN_STAT_UPGRADES },
      equipment: DEFAULT_EQUIPMENT,
    },
  };
}

function isSaveDataV6(value: unknown): value is SaveDataV6 {
  if (!isRecord(value) || value.version !== SAVE_VERSION) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  const { settings, progression } = value;
  return (
    isSettings(settings) &&
    isNonNegativeInteger(progression.completedRuns) &&
    isNonNegativeInteger(progression.unspentStatPoints) &&
    isValidTotalExperience(progression.guardianTotalExperience) &&
    isArenaLevel(progression.maxUnlockedArena) &&
    isGuardianStatUpgrades(progression.guardianStatUpgrades) &&
    isEquipmentState(progression.equipment)
  );
}

function isLegacySaveDataV5(value: unknown): value is LegacySaveDataV5 {
  if (!isRecord(value) || value.version !== 5) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  const { settings, progression } = value;
  return (
    isSettings(settings) &&
    isNonNegativeInteger(progression.completedRuns) &&
    isNonNegativeInteger(progression.unspentStatPoints) &&
    isValidTotalExperience(progression.guardianTotalExperience) &&
    isArenaLevel(progression.maxUnlockedArena) &&
    isGuardianStatUpgrades(progression.guardianStatUpgrades)
  );
}

function isLegacySaveDataV4(value: unknown): value is LegacySaveDataV4 {
  if (!isRecord(value) || value.version !== 4) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  const { settings, progression } = value;
  return (
    isSettings(settings) &&
    isNonNegativeInteger(progression.completedRuns) &&
    isNonNegativeInteger(progression.unspentStatPoints) &&
    isValidTotalExperience(progression.guardianTotalExperience) &&
    isArenaLevel(progression.maxUnlockedArena) &&
    isLegacyGuardianStatUpgrades(progression.guardianStatUpgrades)
  );
}

function isLegacySaveDataV3(value: unknown): value is LegacySaveDataV3 {
  if (!isRecord(value) || value.version !== 3) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  return (
    isSettings(value.settings) &&
    isNonNegativeInteger(value.progression.completedRuns) &&
    isNonNegativeInteger(value.progression.unspentStatPoints) &&
    isValidTotalExperience(value.progression.guardianTotalExperience) &&
    isLegacyGuardianStatUpgrades(value.progression.guardianStatUpgrades)
  );
}

function isLegacySaveDataV2(value: unknown): value is LegacySaveDataV2 {
  if (!isRecord(value) || value.version !== 2) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  return (
    isSettings(value.settings) &&
    isNonNegativeInteger(value.progression.completedRuns) &&
    isNonNegativeInteger(value.progression.unspentStatPoints) &&
    isLegacyGuardianStatUpgrades(value.progression.guardianStatUpgrades)
  );
}

function isLegacySaveDataV1(value: unknown): value is LegacySaveDataV1 {
  if (!isRecord(value) || value.version !== 1) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  return isSettings(value.settings) && isNonNegativeInteger(value.progression.completedRuns);
}

function isSettings(
  settings: Record<string, unknown>,
): settings is GameSettings & Record<string, unknown> {
  return (
    isVolume(settings.musicVolume) &&
    isVolume(settings.effectsVolume) &&
    typeof settings.vibration === 'boolean' &&
    typeof settings.reducedEffects === 'boolean'
  );
}

function isGuardianStatUpgrades(value: unknown): value is GuardianStatUpgrades {
  if (!isRecord(value)) return false;
  return GUARDIAN_STAT_UPGRADE_KEYS.every((key) => isNonNegativeInteger(value[key]));
}

function isLegacyGuardianStatUpgrades(value: unknown): value is LegacyGuardianStatUpgrades {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value.maxBarrier) &&
    isNonNegativeInteger(value.armorPercent) &&
    isGuardianStatUpgrades(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isValidTotalExperience(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= MAX_TOTAL_EXPERIENCE;
}

function isArenaLevel(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_ARENA_LEVEL
  );
}
