import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FIRST_COMBAT } from '../content/firstCombat';
import type { CombatSnapshot } from '../game/combat/CombatSimulation';
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
  const [combat, setCombat] = useState<CombatSnapshot | null>(null);
  const settingsOpenRef = useRef(settingsOpen);
  const leaveConfirmOpenRef = useRef(leaveConfirmOpen);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    leaveConfirmOpenRef.current = leaveConfirmOpen;
  }, [leaveConfirmOpen]);

  useEffect(() => bridge.on('combatSnapshot', setCombat), [bridge]);

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
        {state.phase !== 'menu' && combat && (
          <header className="hud">
            <div className="hud-status">
              <div className="hud-title-row">
                <span>{strings.wave}</span>
                <strong>
                  Ур. {combat.guardianLevel} · {formatTime(combat.elapsedSeconds)}
                </strong>
              </div>
              <div
                className="health-track"
                aria-label={`${strings.health}: ${Math.ceil(combat.guardianHealth)} / ${combat.guardianMaxHealth}`}
              >
                <div
                  className="health-value"
                  style={{ width: `${(combat.guardianHealth / combat.guardianMaxHealth) * 100}%` }}
                />
                <span className="bar-label">
                  {Math.ceil(combat.guardianHealth)} / {combat.guardianMaxHealth}
                </span>
              </div>
              <div
                className="barrier-track"
                aria-label={`${strings.barrier}: ${Math.ceil(combat.guardianBarrier)} / ${combat.guardianMaxBarrier}`}
              >
                <div
                  className="barrier-value"
                  style={{
                    width: `${(combat.guardianBarrier / combat.guardianMaxBarrier) * 100}%`,
                  }}
                />
                <span className="bar-label">
                  {Math.ceil(combat.guardianBarrier)} / {combat.guardianMaxBarrier}
                </span>
              </div>
              <div
                className="experience-track"
                aria-label={
                  combat.guardianExperienceForNextLevel === 0
                    ? `Уровень ${combat.guardianLevel}, максимум`
                    : `Опыт: ${combat.guardianExperience} / ${combat.guardianExperienceForNextLevel}`
                }
              >
                <div
                  className="experience-value"
                  style={{ width: `${getExperiencePercent(combat)}%` }}
                />
                <span className="bar-label">
                  {combat.guardianExperienceForNextLevel === 0
                    ? 'MAX'
                    : `${combat.guardianExperience} / ${combat.guardianExperienceForNextLevel} XP`}
                </span>
              </div>
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
            <section className="guardian-stats" aria-labelledby="guardian-stats-title">
              <h2 id="guardian-stats-title">Характеристики стража</h2>
              <dl>
                <GuardianStat label="Здоровье" value={FIRST_COMBAT.guardian.maxHealth} />
                <GuardianStat label="Барьер" value={FIRST_COMBAT.guardian.maxBarrier} />
                <GuardianStat
                  label="Броня"
                  value={`${FIRST_COMBAT.guardian.armorPercent * 100}%`}
                />
                <GuardianStat
                  label="Восстановление"
                  value={`${FIRST_COMBAT.guardian.healthRegenPerSecond}/с`}
                />
                <GuardianStat label="Урон" value={FIRST_COMBAT.guardian.damage} />
                <GuardianStat
                  label="Скорость атаки"
                  value={`${FIRST_COMBAT.guardian.attacksPerSecond}/с`}
                />
                <GuardianStat
                  label="Шанс крит. удара"
                  value={`${FIRST_COMBAT.guardian.criticalChance * 100}%`}
                />
                <GuardianStat
                  label="Крит. множитель"
                  value={`×${FIRST_COMBAT.guardian.criticalMultiplier}`}
                />
              </dl>
            </section>
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
        {state.phase === 'finished' && (
          <div
            className={`menu-overlay compact result-${state.result ?? 'defeat'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <p className="eyebrow">ЗАБЕГ ЗАВЕРШЁН</p>
            <h2 id="result-title">
              {state.result === 'victory' ? strings.victory : strings.defeat}
            </h2>
            <p className="subtitle">
              {state.result === 'victory' ? strings.victoryHint : strings.defeatHint}
            </p>
            <div className="menu-actions">
              <button className="button primary" type="button" onClick={start}>
                {strings.restart}
              </button>
              <button className="button ghost" type="button" onClick={() => session.exit()}>
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
          {state.phase !== 'menu' && combat && (
            <>
              <div>
                <dt>Уровень</dt>
                <dd>
                  {combat.guardianLevel} / {combat.guardianMaxLevel}
                </dd>
              </div>
              <div>
                <dt>Опыт</dt>
                <dd>
                  {combat.guardianExperienceForNextLevel === 0
                    ? 'MAX'
                    : `${combat.guardianExperience} / ${combat.guardianExperienceForNextLevel}`}
                </dd>
              </div>
              <div>
                <dt>{strings.health}</dt>
                <dd>
                  {combat.guardianHealth} / {combat.guardianMaxHealth}
                </dd>
              </div>
              <div>
                <dt>{strings.enemies}</dt>
                <dd>{combat.aliveEnemies} на поле</dd>
              </div>
            </>
          )}
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

function GuardianStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getExperiencePercent(combat: CombatSnapshot): number {
  if (combat.guardianExperienceForNextLevel === 0) return 100;
  return Math.min(100, (combat.guardianExperience / combat.guardianExperienceForNextLevel) * 100);
}

function formatTime(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, '0')}`;
}
