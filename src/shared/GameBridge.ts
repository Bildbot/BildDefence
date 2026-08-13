export type GameBridgeEventMap = {
  guardianPulse: { intensity: number };
};

type Listener<K extends keyof GameBridgeEventMap> = (payload: GameBridgeEventMap[K]) => void;

export class GameBridge {
  private readonly listeners = new Map<keyof GameBridgeEventMap, Set<Listener<never>>>();

  on<K extends keyof GameBridgeEventMap>(event: K, listener: Listener<K>): () => void {
    const listeners = this.listeners.get(event) ?? new Set<Listener<never>>();
    listeners.add(listener as Listener<never>);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as Listener<never>);
  }

  emit<K extends keyof GameBridgeEventMap>(event: K, payload: GameBridgeEventMap[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload as never));
  }
}
