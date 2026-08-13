import { SAVE_KEY, SAVE_VERSION } from '../../shared/constants';
import type { StorageAdapter } from '../storage/StorageAdapter';

export type GameSettings = Readonly<{
  musicVolume: number;
  effectsVolume: number;
  vibration: boolean;
  reducedEffects: boolean;
}>;

export type SaveDataV1 = Readonly<{
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

export const DEFAULT_SAVE: SaveDataV1 = {
  version: SAVE_VERSION,
  settings: DEFAULT_SETTINGS,
  progression: { completedRuns: 0 },
};

export class SaveRepository {
  constructor(private readonly storage: StorageAdapter) {}

  async load(): Promise<SaveDataV1> {
    const raw = await this.storage.read(SAVE_KEY);
    if (raw === null) return DEFAULT_SAVE;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isSaveDataV1(parsed)) throw new Error('Unsupported or invalid save');
      return parsed;
    } catch {
      await this.storage.quarantine(SAVE_KEY, raw);
      await this.storage.remove(SAVE_KEY);
      return DEFAULT_SAVE;
    }
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    const current = await this.load();
    await this.storage.write(SAVE_KEY, JSON.stringify({ ...current, settings }));
  }
}

function isSaveDataV1(value: unknown): value is SaveDataV1 {
  if (!isRecord(value) || value.version !== SAVE_VERSION) return false;
  if (!isRecord(value.settings) || !isRecord(value.progression)) return false;
  const { settings, progression } = value;
  return (
    isVolume(settings.musicVolume) &&
    isVolume(settings.effectsVolume) &&
    typeof settings.vibration === 'boolean' &&
    typeof settings.reducedEffects === 'boolean' &&
    typeof progression.completedRuns === 'number' &&
    Number.isInteger(progression.completedRuns) &&
    progression.completedRuns >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
