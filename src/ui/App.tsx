import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameSession } from '../game/session/GameSession';
import type { PlatformAdapter, SafeAreaInsets } from '../platform/PlatformAdapter';
import type { GameSettings } from '../services/save/SaveRepository';
import { DEFAULT_SETTINGS, type SaveRepository } from '../services/save/SaveRepository';
import type { GameBridge } from '../shared/GameBridge';
import { GameCanvas } from './GameCanvas';
import { SettingsDialog } from './SettingsDialog';
import { strings } from './strings';

type Props = {
  session: GameSession;
  bridge: GameBridge;
  platform: PlatformAdapter;
  saves: SaveRepository;
};

export function App({ session, bridge, platform, saves }: Props) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const settingsOpenRef = useRef(settingsOpen);
  const leaveConfirmOpenRef = useRef(leaveConfirmOpen);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    leaveConfirmOpenRef.current = leaveConfirmOpen;
  }, [leaveConfirmOpen]);

  useEffect(() => {
    void saves.load().then((save) => setSettings(save.settings));
    void platform.ready();
    const stopLifecycle = platform.onLifecycleChange((lifecycle) => {
      if (lifecycle === 'inactive') session.pause();
    });
    const stopBack = platform.onBack(() => {
      if (settingsOpenRef.current) setSettingsOpen(false);
      else if (leaveConfirmOpenRef.current) setLeaveConfirmOpen(false);
      else if (session.getSnapshot().phase === 'running') session.pause();
      else if (session.getSnapshot().phase === 'paused') setLeaveConfirmOpen(true);
    });
    const applySafeArea = (insets: SafeAreaInsets) => {
      document.documentElement.style.setProperty('--platform-safe-top', `${insets.top}px`);
      document.documentElement.style.setProperty('--platform-safe-right', `${insets.right}px`);
      document.documentElement.style.setProperty('--platform-safe-bottom', `${insets.bottom}px`);
      document.documentElement.style.setProperty('--platform-safe-left', `${insets.left}px`);
    };
    applySafeArea(platform.getSafeArea());
    const stopSafeArea = platform.onSafeAreaChange(applySafeArea);
    return () => {
      stopLifecycle();
      stopBack();
      stopSafeArea();
      void platform.destroy();
    };
  }, [platform, saves, session]);

  useEffect(() => {
    const active = state.phase === 'running';
    void platform.setGameplayActive(active);
  }, [platform, state.phase]);

  const updateSettings = (next: GameSettings) => {
    setSettings(next);
    void saves.saveSettings(next);
  };

  const start = () => {
    session.start();
    if (settings.vibration) void platform.haptic();
  };

  return (
    <main className="app-shell" data-platform={platform.kind}>
      <section className="game-frame" data-testid="game-frame">
        <GameCanvas session={session} bridge={bridge} />
        {state.phase !== 'menu' && (
          <header className="hud">
            <div>
              <span>{strings.wave}</span>
              <strong>{strings.preparation}</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={strings.pause}
              onClick={() => session.pause()}
            >
              II
            </button>
          </header>
        )}
        {state.phase === 'menu' && (
          <div className="menu-overlay">
            <p className="eyebrow">{strings.foundation}</p>
            <h1>{strings.title}</h1>
            <p className="subtitle">{strings.subtitle}</p>
            <div className="menu-actions">
              <button className="button primary" type="button" onClick={start}>
                {strings.start}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => setSettingsOpen(true)}
              >
                {strings.settings}
              </button>
            </div>
          </div>
        )}
        {state.phase === 'paused' && (
          <div
            className="menu-overlay compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
          >
            <p className="eyebrow">ЗАБЕГ ПРИОСТАНОВЛЕН</p>
            <h2 id="pause-title">{strings.pause}</h2>
            <div className="menu-actions">
              <button className="button primary" type="button" onClick={() => session.resume()}>
                {strings.resume}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => setSettingsOpen(true)}
              >
                {strings.settings}
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => setLeaveConfirmOpen(true)}
              >
                {strings.exit}
              </button>
            </div>
          </div>
        )}
      </section>
      <aside className="desktop-panel" aria-label="Информация о забеге">
        <p className="eyebrow">СТАТУС</p>
        <h2>{state.phase === 'menu' ? 'Ожидание' : strings.preparation}</h2>
        <p>
          Игровая область всегда остаётся 390 × 640. Дополнительное место на desktop используется
          только для интерфейса.
        </p>
        <dl>
          <div>
            <dt>Платформа</dt>
            <dd>{platform.kind}</dd>
          </div>
          <div>
            <dt>Забег</dt>
            <dd>#{state.runId}</dd>
          </div>
        </dl>
      </aside>
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {leaveConfirmOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
          >
            <p className="eyebrow">ПОДТВЕРЖДЕНИЕ</p>
            <h2 id="leave-title">{strings.leaveTitle}</h2>
            <p>{strings.leaveHint}</p>
            <div className="dialog-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setLeaveConfirmOpen(false)}
              >
                {strings.stay}
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => {
                  setLeaveConfirmOpen(false);
                  session.exit();
                }}
              >
                {strings.confirmExit}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
