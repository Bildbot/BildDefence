import { describe, expect, it, vi } from 'vitest';
import { GameSession } from './GameSession';

describe('GameSession', () => {
  it('follows the supported run lifecycle', () => {
    const session = new GameSession();
    const listener = vi.fn();
    session.subscribe(listener);

    session.start();
    expect(session.getSnapshot()).toEqual({ phase: 'running', runId: 1, result: null });
    session.pause();
    expect(session.getSnapshot().phase).toBe('paused');
    session.resume();
    session.finish('victory');
    expect(session.getSnapshot()).toEqual({ phase: 'finished', runId: 1, result: 'victory' });
    session.exit();
    expect(session.getSnapshot()).toEqual({ phase: 'menu', runId: 1, result: null });
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('ignores transitions that are invalid for the current phase', () => {
    const session = new GameSession();
    session.pause();
    session.resume();
    session.finish('defeat');
    expect(session.getSnapshot()).toEqual({ phase: 'menu', runId: 0, result: null });
  });
});
