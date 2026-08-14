import type { GuardianDefinition } from '../../content/firstCombat';

export type GamePhase = 'menu' | 'running' | 'paused' | 'finished';

export type GameSessionState = Readonly<{
  phase: GamePhase;
  runId: number;
  result: 'victory' | 'defeat' | null;
  guardian: GuardianDefinition | null;
}>;

type SessionListener = () => void;

const INITIAL_STATE: GameSessionState = { phase: 'menu', runId: 0, result: null, guardian: null };

export class GameSession {
  private state: GameSessionState = INITIAL_STATE;
  private readonly listeners = new Set<SessionListener>();

  getSnapshot = (): GameSessionState => this.state;

  subscribe = (listener: SessionListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(guardian: GuardianDefinition): void {
    this.setState({
      phase: 'running',
      runId: this.state.runId + 1,
      result: null,
      guardian,
    });
  }

  pause(): void {
    if (this.state.phase === 'running') this.setState({ ...this.state, phase: 'paused' });
  }

  resume(): void {
    if (this.state.phase === 'paused') this.setState({ ...this.state, phase: 'running' });
  }

  finish(result: 'victory' | 'defeat'): void {
    if (this.state.phase === 'running' || this.state.phase === 'paused') {
      this.setState({ ...this.state, phase: 'finished', result });
    }
  }

  exit(): void {
    this.setState({ ...this.state, phase: 'menu', result: null, guardian: null });
  }

  private setState(nextState: GameSessionState): void {
    this.state = nextState;
    this.listeners.forEach((listener) => listener());
  }
}
