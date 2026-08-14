export const MAX_GUARDIAN_LEVEL = 50;

const EXPERIENCE_CURVE_BASE = 100;
const EXPERIENCE_CURVE_EXPONENT = 1.8;

export const ENEMY_EXPERIENCE_MULTIPLIERS = {
  normal: 1,
  enhanced: 2,
  rare: 5,
  elite: 10,
  boss: 40,
} as const;

export type EnemyExperienceRank = keyof typeof ENEMY_EXPERIENCE_MULTIPLIERS;

export type GuardianProgressionSnapshot = Readonly<{
  level: number;
  experience: number;
  experienceForNextLevel: number;
  totalExperience: number;
  maxLevel: number;
}>;

export function getExperienceForNextGuardianLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_GUARDIAN_LEVEL) {
    throw new RangeError(`Guardian level must be between 1 and ${MAX_GUARDIAN_LEVEL}`);
  }
  if (level === MAX_GUARDIAN_LEVEL) return 0;
  return Math.round(EXPERIENCE_CURVE_BASE * level ** EXPERIENCE_CURVE_EXPONENT);
}

export function getTotalExperienceToReachGuardianLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_GUARDIAN_LEVEL) {
    throw new RangeError(`Guardian level must be between 1 and ${MAX_GUARDIAN_LEVEL}`);
  }

  let total = 0;
  for (let currentLevel = 1; currentLevel < level; currentLevel += 1) {
    total += getExperienceForNextGuardianLevel(currentLevel);
  }
  return total;
}

export function getEnemyExperienceReward(
  baseExperience: number,
  rank: EnemyExperienceRank,
): number {
  if (!Number.isFinite(baseExperience) || baseExperience <= 0) return 0;
  return Math.max(0, Math.round(baseExperience * ENEMY_EXPERIENCE_MULTIPLIERS[rank]));
}

export class GuardianProgression {
  private level = 1;
  private experience = 0;
  private totalExperience = 0;

  addExperience(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0 || this.level === MAX_GUARDIAN_LEVEL) return 0;

    const maxTotalExperience = getTotalExperienceToReachGuardianLevel(MAX_GUARDIAN_LEVEL);
    const acceptedExperience = Math.min(
      Math.floor(amount),
      maxTotalExperience - this.totalExperience,
    );
    if (acceptedExperience <= 0) return 0;

    this.totalExperience += acceptedExperience;
    this.experience += acceptedExperience;

    let gainedLevels = 0;
    while (this.level < MAX_GUARDIAN_LEVEL) {
      const requiredExperience = getExperienceForNextGuardianLevel(this.level);
      if (this.experience < requiredExperience) break;
      this.experience -= requiredExperience;
      this.level += 1;
      gainedLevels += 1;
    }

    if (this.level === MAX_GUARDIAN_LEVEL) this.experience = 0;
    return gainedLevels;
  }

  getSnapshot(): GuardianProgressionSnapshot {
    return {
      level: this.level,
      experience: this.experience,
      experienceForNextLevel: getExperienceForNextGuardianLevel(this.level),
      totalExperience: this.totalExperience,
      maxLevel: MAX_GUARDIAN_LEVEL,
    };
  }
}
