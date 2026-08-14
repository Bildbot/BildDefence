import { describe, expect, it, vi } from 'vitest';
import { FIRST_COMBAT } from '../../content/firstCombat';
import { GameSession } from './GameSession';

describe('GameSession', () => {
  it('follows the supported run lifecycle and carries guardian state into the run', () => {
    const session = new GameSession();
    const listener = vi.fn();
    session.subscribe(listener);

    session.start(FIRST_COMBAT.guardian, 300);
    expect(session.getSnapshot()).toEqual({
      phase: 'running',
      runId: 1,
      result: null,
      guardian: FIRST_COMBAT.guardian,
      guardianTotalExperience: 300,
    });
    session.pause();
    expect(session.getSnapshot().phase).toBe('paused');
    session.resume();
    session.finish('victory');
    expect(session.getSnapshot()).toEqual({
      phase: 'finished',
      runId: 1,
      result: 'victory',
      guardian: FIRST_COMBAT.guardian,
      guardianTotalExperience: 300,
    });
    session.exit();
    expect(session.getSnapshot()).toEqual({
      phase: 'menu',
      runId: 1,
      result: null,
      guardian: null,
      guardianTotalExperience: 0,
    });
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('ignores transitions that are invalid for the current phase', () => {
    const session = new GameSession();
    session.pause();
    session.resume();
    session.finish('defeat');
    expect(session.getSnapshot()).toEqual({
      phase: 'menu',
      runId: 0,
      result: null,
      guardian: null,
      guardianTotalExperience: 0,
    });
  });
});
