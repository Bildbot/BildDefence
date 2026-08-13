import { useEffect, useRef } from 'react';
import { createGame } from '../game/createGame';
import type { GameSession } from '../game/session/GameSession';
import type { GameBridge } from '../shared/GameBridge';

type Props = { session: GameSession; bridge: GameBridge };

export function GameCanvas({ session, bridge }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parentRef.current) return undefined;
    const game = createGame(parentRef.current, session, bridge);
    return () => game.destroy(true);
  }, [bridge, session]);

  return <div ref={parentRef} className="game-canvas" aria-label="Игровая арена" />;
}
