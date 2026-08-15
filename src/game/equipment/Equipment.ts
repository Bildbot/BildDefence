export const EQUIPMENT_SLOTS = ['bow', 'quiver', 'helmet', 'chest', 'gloves', 'pants'] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type ItemRarity = 'normal' | 'magic' | 'rare';

export type EquipmentItem = Readonly<{
  id: string;
  slot: EquipmentSlot;
  name: string;
  level: number;
  rank: number;
  rarity: ItemRarity;
  affixCount: number;
  primaryLabel: string;
  primaryValue: string;
  minimumDamage?: number;
  maximumDamage?: number;
  attacksPerSecond?: number;
  criticalChance?: number;
  armorPercent?: number;
}>;

export type EquipmentState = Readonly<{
  items: readonly EquipmentItem[];
  equipped: Readonly<Partial<Record<EquipmentSlot, string>>>;
}>;

export const SLOT_LABELS: Readonly<Record<EquipmentSlot, string>> = {
  bow: 'Лук',
  quiver: 'Колчан',
  helmet: 'Шлем',
  chest: 'Броня',
  gloves: 'Перчатки',
  pants: 'Штаны',
};

export const RARITY_LABELS: Readonly<Record<ItemRarity, string>> = {
  normal: 'Обычный',
  magic: 'Магический',
  rare: 'Редкий',
};

export const STARTING_BOW: EquipmentItem = {
  id: 'starting-short-bow',
  slot: 'bow',
  name: 'Короткий лук',
  level: 1,
  rank: 1,
  rarity: 'normal',
  affixCount: 0,
  primaryLabel: 'Физический урон',
  primaryValue: '13–19 · 1,55/с',
  minimumDamage: 13,
  maximumDamage: 19,
  attacksPerSecond: 1.55,
  criticalChance: 0.05,
};

export const DEFAULT_EQUIPMENT: EquipmentState = {
  items: [STARTING_BOW],
  equipped: { bow: STARTING_BOW.id },
};

const BASE_NAMES: Readonly<Record<EquipmentSlot, readonly string[]>> = {
  bow: ['Короткий лук', 'Длинный лук', 'Составной лук'],
  quiver: ['Колчан силы', 'Колчан скорости', 'Колчан меткости'],
  helmet: ['Шлем стража'],
  chest: ['Броня стража'],
  gloves: ['Перчатки стража'],
  pants: ['Штаны стража'],
};

export function generateVictoryLoot(arenaLevel: number, runId: number): readonly EquipmentItem[] {
  const random = createRandom(arenaLevel * 100_003 + runId * 97);
  return Array.from({ length: 3 }, (_, index) => createItem(arenaLevel, runId, index, random));
}

export function addItems(state: EquipmentState, items: readonly EquipmentItem[]): EquipmentState {
  const knownIds = new Set(state.items.map((item) => item.id));
  return { ...state, items: [...state.items, ...items.filter((item) => !knownIds.has(item.id))] };
}

export function equipItem(state: EquipmentState, itemId: string): EquipmentState {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return state;
  return { ...state, equipped: { ...state.equipped, [item.slot]: item.id } };
}

export function getEquippedItem(
  state: EquipmentState,
  slot: EquipmentSlot,
): EquipmentItem | undefined {
  const id = state.equipped[slot];
  return id ? state.items.find((item) => item.id === id) : undefined;
}

export function applyEquipmentToGuardian(
  guardian: GuardianDefinition,
  equipment: EquipmentState,
): GuardianDefinition {
  const bow = getEquippedItem(equipment, 'bow');
  const armorPercent = EQUIPMENT_SLOTS.reduce(
    (total, slot) => total + (getEquippedItem(equipment, slot)?.armorPercent ?? 0),
    0,
  );
  return {
    ...guardian,
    minimumDamage: bow?.minimumDamage ?? guardian.minimumDamage,
    maximumDamage: bow?.maximumDamage ?? guardian.maximumDamage,
    attacksPerSecond: bow?.attacksPerSecond ?? guardian.attacksPerSecond,
    criticalChance: bow?.criticalChance ?? guardian.criticalChance,
    armorPercent,
  };
}

function createItem(
  level: number,
  runId: number,
  index: number,
  random: () => number,
): EquipmentItem {
  const slot = EQUIPMENT_SLOTS[Math.floor(random() * EQUIPMENT_SLOTS.length)] ?? 'bow';
  const unlockedRank = Math.min(10, Math.floor((level - 1) / 10) + 1);
  const rank = unlockedRank === 1 || random() < 0.15 ? unlockedRank : unlockedRank - 1;
  const rarityRoll = random();
  const rarity: ItemRarity = rarityRoll < 0.1 ? 'rare' : rarityRoll < 0.4 ? 'magic' : 'normal';
  const affixCount =
    rarity === 'normal'
      ? 0
      : rarity === 'magic'
        ? 1 + Math.floor(random() * 2)
        : 3 + Math.floor(random() * 2);
  const bases = BASE_NAMES[slot];
  const baseName = bases[Math.floor(random() * bases.length)] ?? SLOT_LABELS[slot];
  return {
    id: `drop-${runId}-${level}-${index}`,
    slot,
    name: `${baseName} ${toRoman(rank)}`,
    level,
    rank,
    rarity,
    affixCount,
    ...getPrimaryStat(slot, rank, baseName),
  };
}

function getPrimaryStat(slot: EquipmentSlot, rank: number, baseName: string) {
  if (slot === 'bow') {
    const multiplier = 1 + (rank - 1) * 0.35;
    const [minimum, maximum, speed] = baseName.startsWith('Короткий')
      ? [13, 19, 1.55]
      : baseName.startsWith('Длинный')
        ? [20, 32, 0.95]
        : [16, 24, 1.2];
    return {
      primaryLabel: 'Физический урон',
      primaryValue: `${Math.round(minimum * multiplier)}–${Math.round(maximum * multiplier)} · ${speed.toFixed(2).replace('.', ',')}/с`,
      minimumDamage: Math.round(minimum * multiplier),
      maximumDamage: Math.round(maximum * multiplier),
      attacksPerSecond: speed,
      criticalChance: baseName.startsWith('Составной') ? 0.08 : 0.05,
    };
  }
  if (slot === 'quiver') {
    return { primaryLabel: 'Усиление атак', primaryValue: `+${2 + rank * 2}%` };
  }
  const fullSetArmor = 10 + (rank - 1) * 4;
  const share = slot === 'chest' ? 0.4 : slot === 'pants' ? 0.3 : slot === 'helmet' ? 0.2 : 0.1;
  const armorPercent = Math.max(1, Math.round(fullSetArmor * share)) / 100;
  return {
    primaryLabel: 'Броня',
    primaryValue: `${armorPercent * 100}%`,
    armorPercent,
  };
}

function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function toRoman(value: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][value - 1] ?? 'I';
}

export function isEquipmentState(value: unknown): value is EquipmentState {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.equipped)) return false;
  if (!value.items.every(isEquipmentItem)) return false;
  const ids = new Set(value.items.map((item) => item.id));
  return Object.entries(value.equipped).every(
    ([slot, id]) =>
      EQUIPMENT_SLOTS.includes(slot as EquipmentSlot) && typeof id === 'string' && ids.has(id),
  );
}

function isEquipmentItem(value: unknown): value is EquipmentItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    EQUIPMENT_SLOTS.includes(value.slot as EquipmentSlot) &&
    typeof value.name === 'string' &&
    Number.isInteger(value.level) &&
    Number.isInteger(value.rank) &&
    (value.rarity === 'normal' || value.rarity === 'magic' || value.rarity === 'rare') &&
    Number.isInteger(value.affixCount) &&
    typeof value.primaryLabel === 'string' &&
    typeof value.primaryValue === 'string' &&
    isOptionalFiniteNumber(value.minimumDamage) &&
    isOptionalFiniteNumber(value.maximumDamage) &&
    isOptionalFiniteNumber(value.attacksPerSecond) &&
    isOptionalFiniteNumber(value.criticalChance) &&
    isOptionalFiniteNumber(value.armorPercent)
  );
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
import type { GuardianDefinition } from '../../content/firstCombat';
