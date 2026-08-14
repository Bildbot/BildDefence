import { describe, expect, it, vi } from 'vitest';
import { FIRST_COMBAT } from '../../content/firstCombat';
import { GameSession } from './GameSession';

describe('GameSession', () => {
  it('follows the supported run lifecycle and carries guardian stats into the run', () => {
    const session = new GameSession();
    const listener = vi.fn();
    session.subscribe(listener);

    session.start(FIRST_COMBAT.guardian);
    expect(session.getSnapshot()).toEqual({
      phase: 'running',
      runId: 1,
      result: null,
      guardian: FIRST_COMBAT.guardian,
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
    });
    session.exit();
    expect(session.getSnapshot()).toEqual({
      phase: 'menu',
      runId: 1,
      result: null,
      guardian: null,
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
    });
  });
});
