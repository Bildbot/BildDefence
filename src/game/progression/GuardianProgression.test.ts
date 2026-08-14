import { describe, expect, it } from 'vitest';
import {
  DEATH_EXPERIENCE_PENALTY_START_LEVEL,
  ENEMY_EXPERIENCE_MULTIPLIERS,
  GuardianProgression,
  MAX_GUARDIAN_LEVEL,
  getEnemyExperienceMultiplier,
  getEnemyExperienceReward,
  getExperienceForNextGuardianLevel,
  getTotalExperienceAfterDeath,
  getTotalExperienceToReachGuardianLevel,
} from './GuardianProgression';

describe('GuardianProgression', () => {
  it('uses the agreed 100-level experience curve', () => {
    expect(getExperienceForNextGuardianLevel(1)).toBe(100);
    expect(getExperienceForNextGuardianLevel(10)).toBe(6310);
    expect(getExperienceForNextGuardianLevel(20)).toBe(21971);
    expect(getExperienceForNextGuardianLevel(30)).toBe(45585);
    expect(getExperienceForNextGuardianLevel(50)).toBe(114326);
    expect(getExperienceForNextGuardianLevel(99)).toBe(390970);
    expect(getExperienceForNextGuardianLevel(100)).toBe(0);
    expect(getTotalExperienceToReachGuardianLevel(100)).toBe(14019656);
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

  it('restores an existing total experience value between runs', () => {
    expect(new GuardianProgression(500).getSnapshot()).toMatchObject({
      level: 3,
      experience: 52,
      totalExperience: 500,
    });
  });

  it('caps progression at level 100', () => {
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

  it('reduces experience by ten percent per enemy level below the guardian', () => {
    expect(getEnemyExperienceMultiplier(20, 25)).toBe(1);
    expect(getEnemyExperienceMultiplier(20, 20)).toBe(1);
    expect(getEnemyExperienceMultiplier(20, 19)).toBeCloseTo(0.9);
    expect(getEnemyExperienceMultiplier(20, 18)).toBeCloseTo(0.8);
    expect(getEnemyExperienceMultiplier(20, 15)).toBeCloseTo(0.5);
    expect(getEnemyExperienceMultiplier(20, 11)).toBeCloseTo(0.1);
    expect(getEnemyExperienceMultiplier(20, 10)).toBe(0);
    expect(getEnemyExperienceMultiplier(20, 1)).toBe(0);
  });

  it('keeps levels through death while applying the post-30 experience penalty', () => {
    const level30Start = getTotalExperienceToReachGuardianLevel(30);
    expect(getTotalExperienceAfterDeath(level30Start + 1000)).toBe(level30Start + 1000);

    const level31Start = getTotalExperienceToReachGuardianLevel(
      DEATH_EXPERIENCE_PENALTY_START_LEVEL,
    );
    expect(getTotalExperienceAfterDeath(level31Start + 500)).toBe(level31Start);

    const withEnoughProgress = level31Start + 10000;
    expect(getTotalExperienceAfterDeath(withEnoughProgress)).toBe(
      Math.max(level31Start, Math.floor(withEnoughProgress * 0.9)),
    );
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
