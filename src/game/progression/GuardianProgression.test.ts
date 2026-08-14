import { describe, expect, it } from 'vitest';
import {
  ENEMY_EXPERIENCE_MULTIPLIERS,
  GuardianProgression,
  MAX_GUARDIAN_LEVEL,
  getEnemyExperienceReward,
  getExperienceForNextGuardianLevel,
  getTotalExperienceToReachGuardianLevel,
} from './GuardianProgression';

describe('GuardianProgression', () => {
  it('uses the agreed 50-level experience curve', () => {
    expect(getExperienceForNextGuardianLevel(1)).toBe(100);
    expect(getExperienceForNextGuardianLevel(10)).toBe(6310);
    expect(getExperienceForNextGuardianLevel(20)).toBe(21971);
    expect(getExperienceForNextGuardianLevel(30)).toBe(45585);
    expect(getExperienceForNextGuardianLevel(40)).toBe(76508);
    expect(getExperienceForNextGuardianLevel(50)).toBe(0);
    expect(getTotalExperienceToReachGuardianLevel(50)).toBe(1984718);
  });

  it('can gain multiple levels from one reward and carries leftover experience', () => {
    const progression = new GuardianProgression();
    expect(progression.addExperience(500)).toBe(2);
    expect(progression.getSnapshot()).toMatchObject({
      level: 3,
      experience: 52,
      totalExperience: 500,
      experienceForNextLevel: 722,
    });
  });

  it('caps progression at level 50', () => {
    const progression = new GuardianProgression();
    progression.addExperience(Number.MAX_SAFE_INTEGER);
    expect(progression.getSnapshot()).toEqual({
      level: MAX_GUARDIAN_LEVEL,
      experience: 0,
      experienceForNextLevel: 0,
      totalExperience: getTotalExperienceToReachGuardianLevel(MAX_GUARDIAN_LEVEL),
      maxLevel: MAX_GUARDIAN_LEVEL,
    });
  });

  it('applies enemy rank multipliers to the base reward', () => {
    expect(ENEMY_EXPERIENCE_MULTIPLIERS).toEqual({
      normal: 1,
      enhanced: 2,
      rare: 5,
      elite: 10,
      boss: 40,
    });
    expect(getEnemyExperienceReward(10, 'normal')).toBe(10);
    expect(getEnemyExperienceReward(10, 'enhanced')).toBe(20);
    expect(getEnemyExperienceReward(10, 'rare')).toBe(50);
    expect(getEnemyExperienceReward(10, 'elite')).toBe(100);
    expect(getEnemyExperienceReward(10, 'boss')).toBe(400);
  });
});
