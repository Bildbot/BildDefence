import { FIRST_COMBAT } from '../../content/firstCombat';
import {
  DEFAULT_GUARDIAN_STAT_UPGRADES,
  GUARDIAN_STAT_UPGRADE_KEYS,
  canUpgradeGuardianStat,
  type GuardianStatUpgradeKey,
  type GuardianStatUpgrades,
} from '../../game/progression/GuardianStats';
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
  guardianStatUpgrades: GuardianStatUpgrades;
}>;

export type SaveDataV2 = Readonly<{
  version: 2;
  settings: GameSettings;
  progression: GameProgression;
}>;

type LegacySaveDataV1 = Readonly<{
  version: 1;
  settings: GameSettings;
  progression: Readonly<{ completedRuns: number }>;
}>;

export const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 0.7,
  effectsVolume: 0.8,
  vibration: true,
  reducedEffects: false,
};

export const DEFAULT_PROGRESSION: GameProgression = {
  completedRuns: 0,
  unspentStatPoints: 0,
  guardianStatUpgrades: DEFAULT_GUARDIAN_STAT_UPGRADES,
};

export const DEFAULT_SAVE: SaveDataV2 = {
  version: SAVE_VERSION,
  settings: DEFAULT_SETTINGS,
  progression: DEFAULT_PROGRESSION,
};

export class SaveRepository {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StorageAdapter) {}

  async load(): Promise<SaveDataV2> {
    const raw = await this.storage.read(SAVE_KEY);
    if (raw === null) return DEFAULT_SAVE;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isSaveDataV2(parsed)) return parsed;
      if (isLegacySaveDataV1(parsed)) {
        const migrated = migrateLegacySave(parsed);
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

  async completeRun(statPointsEarned: number): Promise<GameProgression> {
    if (!Number.isInteger(statPointsEarned) || statPointsEarned < 0) {
      throw new RangeError('Earned stat points must be a non-negative integer');
    }

    let nextProgression = DEFAULT_PROGRESSION;
    await this.mutate((current) => {
      nextProgression = {
        ...current.progression,
        completedRuns: current.progression.completedRuns + 1,
        unspentStatPoints: current.progression.unspentStatPoints + statPointsEarned,
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
          FIRST_COMBAT.guardian,
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

  private async mutate(transform: (current: SaveDataV2) => SaveDataV2): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      const current = await this.load();
      const next = transform(current);
      await this.storage.write(SAVE_KEY, JSON.stringify(next));
    });
    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}

function migrateLegacySave(save: LegacySaveDataV1): SaveDataV2 {
  return {
    version: SAVE_VERSION,
    settings: save.settings,
    progression: {
      completedRuns: save.progression.completedRuns,
      unspentStatPoints: 0,
      guardianStatUpgrades: { ...DEFAULT_GUARDIAN_STAT_UPGRADES },
    },
  };
}

function isSaveDataV2(value: unknown): value is SaveDataV2 {
  if (!isRecord(value) || value.version !== SAVE_VERSION) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  const { settings, progression } = value;
  return (
    isSettings(settings) &&
    isNonNegativeInteger(progression.completedRuns) &&
    isNonNegativeInteger(progression.unspentStatPoints) &&
    isGuardianStatUpgrades(progression.guardianStatUpgrades)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
