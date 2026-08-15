export const EQUIPMENT_SLOTS = ['bow', 'quiver', 'helmet', 'chest', 'gloves', 'pants'] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type ItemRarity = 'normal' | 'magic' | 'rare';

export type EquipmentAffix = Readonly<{
  family: string;
  kind: 'prefix' | 'suffix';
  label: string;
  tier: number;
  value: number;
  secondaryValue?: number;
  addedMinimumDamage?: number;
  addedMaximumDamage?: number;
  valueLabel: string;
  modifier:
    | 'maxHealth'
    | 'healthRegen'
    | 'armor'
    | 'damage'
    | 'flatDamage'
    | 'localAttackSpeed'
    | 'localCriticalChance'
    | 'attackSpeed'
    | 'criticalChance'
    | 'criticalMultiplier'
    | 'ricochet'
    | 'additionalProjectiles';
}>;

export type EquipmentItem = Readonly<{
  id: string;
  slot: EquipmentSlot;
  name: string;
  level: number;
  rank: number;
  rarity: ItemRarity;
  affixCount: number;
  affixes: readonly EquipmentAffix[];
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
  affixes: [],
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

export function orderAffixes(affixes: readonly EquipmentAffix[]): readonly EquipmentAffix[] {
  return [...affixes].sort((left, right) =>
    left.kind === right.kind ? 0 : left.kind === 'prefix' ? -1 : 1,
  );
}

export function applyEquipmentToGuardian(
  guardian: GuardianDefinition,
  equipment: EquipmentState,
): GuardianDefinition {
  const bow = getEquippedItem(equipment, 'bow');
  const equippedItems = EQUIPMENT_SLOTS.map((slot) => getEquippedItem(equipment, slot)).filter(
    (item): item is EquipmentItem => item !== undefined,
  );
  const affixes = equippedItems.flatMap((item) => item.affixes);
  const modifierTotal = (modifier: EquipmentAffix['modifier']) =>
    affixes
      .filter((affix) => affix.modifier === modifier)
      .reduce((total, affix) => total + affix.value, 0);
  const baseArmor = equippedItems.reduce((total, item) => total + (item.armorPercent ?? 0), 0);
  const damageMultiplier = 1 + modifierTotal('damage');
  const localAttackSpeedMultiplier = 1 + modifierTotal('localAttackSpeed');
  const localCriticalChanceMultiplier = 1 + modifierTotal('localCriticalChance');
  const globalAttackSpeedMultiplier = 1 + modifierTotal('attackSpeed');
  const addedMinimumDamage = affixes.reduce(
    (total, affix) =>
      total + (affix.modifier === 'flatDamage' ? affix.value : 0) + (affix.addedMinimumDamage ?? 0),
    0,
  );
  const addedMaximumDamage = affixes.reduce(
    (total, affix) =>
      total +
      (affix.modifier === 'flatDamage' ? (affix.secondaryValue ?? affix.value) : 0) +
      (affix.addedMaximumDamage ?? 0),
    0,
  );
  return {
    ...guardian,
    maxHealth: guardian.maxHealth + modifierTotal('maxHealth'),
    healthRegenPerSecond: guardian.healthRegenPerSecond + modifierTotal('healthRegen'),
    minimumDamage: Math.round(
      ((bow?.minimumDamage ?? guardian.minimumDamage) + addedMinimumDamage) * damageMultiplier,
    ),
    maximumDamage: Math.round(
      ((bow?.maximumDamage ?? guardian.maximumDamage) + addedMaximumDamage) * damageMultiplier,
    ),
    attacksPerSecond: Math.min(
      3,
      (bow?.attacksPerSecond ?? guardian.attacksPerSecond) *
        localAttackSpeedMultiplier *
        globalAttackSpeedMultiplier,
    ),
    criticalChance: Math.min(
      1,
      (bow?.criticalChance ?? guardian.criticalChance) * localCriticalChanceMultiplier +
        modifierTotal('criticalChance'),
    ),
    criticalMultiplier: guardian.criticalMultiplier + modifierTotal('criticalMultiplier'),
    ricochetCount: Math.round(modifierTotal('ricochet')),
    ricochetDamageMultiplier:
      affixes.find((affix) => affix.modifier === 'ricochet')?.secondaryValue ?? 0,
    additionalProjectiles: Math.round(modifierTotal('additionalProjectiles')),
    armorPercent: baseArmor + modifierTotal('armor'),
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
  const affixes = generateAffixes(slot, level, affixCount, random);
  return {
    id: `drop-${runId}-${level}-${index}`,
    slot,
    name: `${baseName} ${toRoman(rank)}`,
    level,
    rank,
    rarity,
    affixCount: affixes.length,
    affixes,
    ...getPrimaryStat(slot, rank, baseName),
  };
}

type AffixDefinition = Readonly<{
  family: string;
  kind: EquipmentAffix['kind'];
  label: string;
  modifier: EquipmentAffix['modifier'];
  valueAtTier: (power: number, random: () => number) => number;
  format: (value: number) => string;
  rollAtTier?: (power: number, random: () => number) => AffixRoll;
  familyWeight?: number;
  tierWeights?: Readonly<Partial<Record<number, number>>>;
}>;

type AffixRoll = Pick<
  EquipmentAffix,
  'value' | 'valueLabel' | 'secondaryValue' | 'addedMinimumDamage' | 'addedMaximumDamage'
>;

const percent = (value: number) => `+${Math.round(value * 100)}%`;
const number = (value: number) => `+${value.toFixed(1).replace('.', ',')}`;

const BOW_AFFIXES: readonly AffixDefinition[] = [
  {
    family: 'damage',
    kind: 'prefix',
    label: 'Увеличение физического урона',
    modifier: 'damage',
    valueAtTier: (power, random) => {
      const minimum = power === 8 ? 90 : power * 10;
      const maximum = power === 8 ? 100 : minimum + 9;
      return (minimum + Math.floor(random() * (maximum - minimum + 1))) / 100;
    },
    format: percent,
  },
  {
    family: 'flat-physical-damage',
    kind: 'prefix',
    label: 'Дополнительный физический урон',
    modifier: 'flatDamage',
    valueAtTier: () => 0,
    format: String,
    rollAtTier: (power, random) => {
      const [minimum, maximum] = rollDamageRange(FLAT_DAMAGE_RANGES[power - 1] ?? [1, 2], random);
      return { value: minimum, secondaryValue: maximum, valueLabel: `+${minimum}–${maximum}` };
    },
  },
  {
    family: 'hybrid-physical-damage',
    kind: 'prefix',
    label: 'Физический и дополнительный физический урон',
    modifier: 'damage',
    valueAtTier: () => 0,
    format: String,
    rollAtTier: (power, random) => {
      const percentRange = HYBRID_PERCENT_RANGES[power - 1] ?? [5, 9];
      const percentValue = rollInteger(percentRange[0], percentRange[1], random) / 100;
      const [minimum, maximum] = rollDamageRange(HYBRID_FLAT_RANGES[power - 1] ?? [1, 1], random);
      return {
        value: percentValue,
        addedMinimumDamage: minimum,
        addedMaximumDamage: maximum,
        valueLabel: `+${Math.round(percentValue * 100)}% · +${minimum}–${maximum}`,
      };
    },
  },
  {
    family: 'attack-speed',
    kind: 'suffix',
    label: 'Скорость атаки',
    modifier: 'localAttackSpeed',
    valueAtTier: (power, random) => {
      const range = ATTACK_SPEED_RANGES[power - 1] ?? [2, 4];
      return rollInteger(range[0], range[1], random) / 100;
    },
    format: percent,
  },
  {
    family: 'critical-chance',
    kind: 'suffix',
    label: 'Шанс критического удара',
    modifier: 'localCriticalChance',
    valueAtTier: (power, random) => {
      const range = CRITICAL_CHANCE_RANGES[power - 1] ?? [10, 14];
      return rollInteger(range[0], range[1], random) / 100;
    },
    format: percent,
    familyWeight: 0.8,
  },
  {
    family: 'critical-multiplier',
    kind: 'suffix',
    label: 'Множитель критического удара',
    modifier: 'criticalMultiplier',
    valueAtTier: (power, random) => {
      const range = CRITICAL_MULTIPLIER_RANGES[power - 1] ?? [5, 8];
      return rollInteger(range[0], range[1], random) / 100;
    },
    format: percent,
    familyWeight: 0.7,
  },
  {
    family: 'ricochet',
    kind: 'suffix',
    label: 'Рикошет',
    modifier: 'ricochet',
    valueAtTier: () => 0,
    format: String,
    tierWeights: { 8: 1000, 7: 700, 6: 450, 5: 250, 4: 120, 3: 50, 2: 12, 1: 1 },
    rollAtTier: (power) => {
      const [count, damagePercent] = RICOCHET_VALUES[power - 1] ?? [1, 40];
      return {
        value: count,
        secondaryValue: damagePercent / 100,
        valueLabel: `${count} · ${damagePercent}% урона`,
      };
    },
  },
  {
    family: 'additional-projectiles',
    kind: 'suffix',
    label: 'Дополнительные стрелы',
    modifier: 'additionalProjectiles',
    valueAtTier: (power) => power - 5,
    format: (value) => `+${value}`,
    tierWeights: { 3: 1000, 2: 150, 1: 10 },
  },
];

const STANDARD_TIER_WEIGHTS: Readonly<Record<number, number>> = {
  8: 10000,
  7: 7000,
  6: 4500,
  5: 2500,
  4: 1200,
  3: 500,
  2: 120,
  1: 10,
};

const CRITICAL_CHANCE_RANGES: readonly (readonly [number, number])[] = [
  [10, 14],
  [15, 24],
  [25, 34],
  [35, 44],
  [45, 54],
  [55, 64],
  [65, 79],
  [80, 100],
];
const CRITICAL_MULTIPLIER_RANGES: readonly (readonly [number, number])[] = [
  [5, 8],
  [9, 12],
  [13, 17],
  [18, 22],
  [23, 27],
  [28, 32],
  [33, 37],
  [38, 45],
];
const RICOCHET_VALUES: readonly (readonly [number, number])[] = [
  [1, 40],
  [1, 50],
  [1, 60],
  [2, 45],
  [2, 55],
  [2, 65],
  [3, 60],
  [3, 70],
];

const FLAT_DAMAGE_RANGES: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 4],
  [4, 7],
  [6, 10],
  [9, 14],
  [12, 19],
  [16, 25],
  [22, 34],
];
const HYBRID_PERCENT_RANGES: readonly (readonly [number, number])[] = [
  [5, 9],
  [10, 14],
  [15, 19],
  [20, 24],
  [25, 29],
  [30, 34],
  [35, 39],
  [45, 50],
];
const HYBRID_FLAT_RANGES: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, 2],
  [2, 4],
  [3, 5],
  [4, 7],
  [6, 9],
  [8, 12],
  [11, 17],
];
const ATTACK_SPEED_RANGES: readonly (readonly [number, number])[] = [
  [2, 4],
  [5, 7],
  [8, 10],
  [11, 13],
  [14, 16],
  [17, 19],
  [20, 22],
  [23, 25],
];

const toGlobalOffence = (affix: AffixDefinition): AffixDefinition => {
  if (affix.family === 'attack-speed') return { ...affix, modifier: 'attackSpeed' };
  if (affix.family === 'critical-chance') return { ...affix, modifier: 'criticalChance' };
  return affix;
};

const QUIVER_AFFIXES = BOW_AFFIXES.filter(
  (affix) =>
    affix.kind === 'prefix' ||
    ['attack-speed', 'critical-chance', 'critical-multiplier'].includes(affix.family),
).map(toGlobalOffence);

const DEFENSIVE_AFFIXES: readonly AffixDefinition[] = [
  {
    family: 'vitality',
    kind: 'prefix',
    label: 'Максимум здоровья',
    modifier: 'maxHealth',
    valueAtTier: (power) => 3 + power * 2,
    format: (value) => `+${value}`,
  },
  {
    family: 'armor',
    kind: 'prefix',
    label: 'Дополнительная броня',
    modifier: 'armor',
    valueAtTier: (power) => (0.4 + power * 0.3) / 100,
    format: percent,
  },
  {
    family: 'regeneration',
    kind: 'suffix',
    label: 'Восстановление здоровья в секунду',
    modifier: 'healthRegen',
    valueAtTier: (power) => 0.05 + power * 0.03,
    format: number,
  },
  {
    family: 'physical-reduction',
    kind: 'suffix',
    label: 'Снижение физического урона',
    modifier: 'armor',
    valueAtTier: (power) => (0.3 + power * 0.2) / 100,
    format: percent,
  },
];

function generateAffixes(
  slot: EquipmentSlot,
  level: number,
  count: number,
  random: () => number,
): readonly EquipmentAffix[] {
  const pool =
    slot === 'bow'
      ? BOW_AFFIXES
      : slot === 'quiver'
        ? QUIVER_AFFIXES
        : slot === 'gloves'
          ? [
              ...DEFENSIVE_AFFIXES,
              ...BOW_AFFIXES.filter(
                (affix) => affix.family === 'attack-speed' || affix.family === 'critical-chance',
              ).map(toGlobalOffence),
            ]
          : DEFENSIVE_AFFIXES;
  const available = [...pool];
  const result: EquipmentAffix[] = [];
  while (result.length < count && available.length > 0) {
    const allowed = available.filter(
      (candidate) => result.filter((affix) => affix.kind === candidate.kind).length < 2,
    );
    if (allowed.length === 0) break;
    const strongestTier = getStrongestAffixTier(level);
    const entries = allowed.flatMap((definition) =>
      Object.entries(definition.tierWeights ?? STANDARD_TIER_WEIGHTS)
        .map(([tier, weight]) => ({
          definition,
          tier: Number(tier),
          weight: (weight ?? 0) * (definition.familyWeight ?? 1),
        }))
        .filter((entry) => entry.tier >= strongestTier && entry.weight > 0),
    );
    const selected = selectWeighted(entries, random);
    if (!selected) break;
    const { definition, tier } = selected;
    available.splice(available.indexOf(definition), 1);
    const power = 9 - tier;
    const roll = definition.rollAtTier?.(power, random);
    const value = roll?.value ?? definition.valueAtTier(power, random);
    result.push({
      ...definition,
      tier,
      ...(roll ?? { value, valueLabel: definition.format(value) }),
    });
  }
  return result;
}

function selectWeighted<T extends { weight: number }>(
  entries: readonly T[],
  random: () => number,
): T | undefined {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries.at(-1);
}

function rollDamageRange(range: readonly [number, number], random: () => number): [number, number] {
  const middle = Math.floor((range[0] + range[1]) / 2);
  return [
    rollInteger(range[0], middle, random),
    rollInteger(Math.max(middle + 1, range[0]), range[1], random),
  ];
}

function rollInteger(minimum: number, maximum: number, random: () => number): number {
  if (maximum <= minimum) return minimum;
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

export function getStrongestAffixTier(level: number): number {
  if (level >= 100) return 1;
  if (level >= 81) return 2;
  if (level >= 66) return 3;
  if (level >= 51) return 4;
  if (level >= 36) return 5;
  if (level >= 21) return 6;
  if (level >= 11) return 7;
  return 8;
}

export function addMissingAffixes(item: Omit<EquipmentItem, 'affixes'>): EquipmentItem {
  const seed = [...item.id].reduce((total, character) => total * 31 + character.charCodeAt(0), 7);
  return {
    ...item,
    affixes: generateAffixes(item.slot, item.level, item.affixCount, createRandom(seed)),
  };
}

function getPrimaryStat(slot: EquipmentSlot, rank: number, baseName: string) {
  if (slot === 'bow') {
    const line = baseName.startsWith('Короткий') ? 0 : baseName.startsWith('Длинный') ? 1 : 2;
    const [minimum, maximum] = BOW_DAMAGE_RANGES[line]?.[rank - 1] ?? [13, 19];
    const speed = [1.55, 0.95, 1.2][line] ?? 1.55;
    return {
      primaryLabel: 'Физический урон',
      primaryValue: `${minimum}–${maximum} · ${speed.toFixed(2).replace('.', ',')}/с`,
      minimumDamage: minimum,
      maximumDamage: maximum,
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

const BOW_DAMAGE_RANGES: readonly (readonly (readonly [number, number])[])[] = [
  [
    [13, 19],
    [18, 26],
    [23, 33],
    [29, 42],
    [35, 51],
    [42, 62],
    [50, 73],
    [59, 86],
    [68, 99],
    [78, 114],
  ],
  [
    [20, 32],
    [27, 43],
    [35, 56],
    [44, 70],
    [54, 86],
    [65, 104],
    [77, 123],
    [90, 144],
    [104, 166],
    [120, 192],
  ],
  [
    [16, 24],
    [22, 32],
    [28, 42],
    [35, 53],
    [43, 65],
    [52, 78],
    [62, 92],
    [72, 108],
    [83, 125],
    [96, 144],
  ],
];

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
    Array.isArray(value.affixes) &&
    value.affixes.length === value.affixCount &&
    value.affixes.every(isEquipmentAffix) &&
    typeof value.primaryLabel === 'string' &&
    typeof value.primaryValue === 'string' &&
    isOptionalFiniteNumber(value.minimumDamage) &&
    isOptionalFiniteNumber(value.maximumDamage) &&
    isOptionalFiniteNumber(value.attacksPerSecond) &&
    isOptionalFiniteNumber(value.criticalChance) &&
    isOptionalFiniteNumber(value.armorPercent)
  );
}

function isEquipmentAffix(value: unknown): value is EquipmentAffix {
  return (
    isRecord(value) &&
    typeof value.family === 'string' &&
    (value.kind === 'prefix' || value.kind === 'suffix') &&
    typeof value.label === 'string' &&
    Number.isInteger(value.tier) &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    isOptionalFiniteNumber(value.secondaryValue) &&
    isOptionalFiniteNumber(value.addedMinimumDamage) &&
    isOptionalFiniteNumber(value.addedMaximumDamage) &&
    typeof value.valueLabel === 'string' &&
    [
      'maxHealth',
      'healthRegen',
      'armor',
      'damage',
      'flatDamage',
      'localAttackSpeed',
      'localCriticalChance',
      'attackSpeed',
      'criticalChance',
      'criticalMultiplier',
      'ricochet',
      'additionalProjectiles',
    ].includes(value.modifier as string)
  );
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
import type { GuardianDefinition } from '../../content/firstCombat';
