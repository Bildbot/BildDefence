import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_ARENA_LEVEL, getArenaBalance } from '../content/arenaBalance';
import { FIRST_COMBAT } from '../content/firstCombat';
import type { CombatSnapshot } from '../game/combat/CombatSimulation';
import {
  applyGuardianStatUpgrades,
  canUpgradeGuardianStat,
  type GuardianStatUpgradeKey,
} from '../game/progression/GuardianStats';
import type { GameSession } from '../game/session/GameSession';
import type { PlatformAdapter, SafeAreaInsets } from '../platform/PlatformAdapter';
import type { GameProgression, GameSettings } from '../services/save/SaveRepository';
import {
  DEFAULT_PROGRESSION,
  DEFAULT_SETTINGS,
  type SaveRepository,
} from '../services/save/SaveRepository';
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

type FinishedAction = 'restart' | 'menu';

export function App({ session, bridge, platform, saves }: Props) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [progression, setProgression] = useState<GameProgression>(DEFAULT_PROGRESSION);
  const [selectedArena, setSelectedArena] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [combat, setCombat] = useState<CombatSnapshot | null>(null);
  const [settlingRun, setSettlingRun] = useState(false);
  const [spendingStat, setSpendingStat] = useState<GuardianStatUpgradeKey | null>(null);
  const settingsOpenRef = useRef(settingsOpen);
  const statsOpenRef = useRef(statsOpen);
  const leaveConfirmOpenRef = useRef(leaveConfirmOpen);

  const guardianStats = applyGuardianStatUpgrades(
    FIRST_COMBAT.guardian,
    progression.guardianStatUpgrades,
  );

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    statsOpenRef.current = statsOpen;
  }, [statsOpen]);

  useEffect(() => {
    leaveConfirmOpenRef.current = leaveConfirmOpen;
  }, [leaveConfirmOpen]);

  useEffect(() => bridge.on('combatSnapshot', setCombat), [bridge]);

  useEffect(() => {
    void saves.load().then((save) => {
      setSettings(save.settings);
      setProgression(save.progression);
      setSelectedArena(save.progression.maxUnlockedArena);
    });
    void platform.ready();
    const stopLifecycle = platform.onLifecycleChange((lifecycle) => {
      if (lifecycle === 'inactive') session.pause();
    });
    const stopBack = platform.onBack(() => {
      if (settingsOpenRef.current) setSettingsOpen(false);
      else if (statsOpenRef.current) setStatsOpen(false);
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
    session.start(guardianStats, progression.guardianTotalExperience, selectedArena);
    if (settings.vibration) void platform.haptic();
  };

  const settleFinishedRun = async (action: FinishedAction) => {
    if (settlingRun || state.phase !== 'finished' || state.result === null) return;
    setSettlingRun(true);
    try {
      const finalExperience =
        combat?.guardianTotalExperience ?? progression.guardianTotalExperience;
      const arenaLevel = combat?.arenaLevel ?? state.arenaLevel ?? selectedArena;
      const nextProgression = await saves.settleRun({
        arenaLevel,
        result: state.result,
        guardianTotalExperience: finalExperience,
      });
      setProgression(nextProgression);
      if (action === 'restart') {
        session.start(guardianStats, nextProgression.guardianTotalExperience, arenaLevel);
        if (settings.vibration) void platform.haptic();
      } else {
        session.exit();
      }
    } finally {
      setSettlingRun(false);
    }
  };

  const spendStatPoint = async (stat: GuardianStatUpgradeKey) => {
    if (
      spendingStat !== null ||
      progression.unspentStatPoints === 0 ||
      !canUpgradeGuardianStat(FIRST_COMBAT.guardian, progression.guardianStatUpgrades, stat)
    ) {
      return;
    }

    setSpendingStat(stat);
    try {
      const nextProgression = await saves.spendGuardianStatPoint(stat);
      setProgression(nextProgression);
      if (settings.vibration) void platform.haptic();
    } finally {
      setSpendingStat(null);
    }
  };

  const canSpendOn = (stat: GuardianStatUpgradeKey) =>
    progression.unspentStatPoints > 0 &&
    spendingStat === null &&
    canUpgradeGuardianStat(FIRST_COMBAT.guardian, progression.guardianStatUpgrades, stat);

  return (
    <main className="app-shell" data-platform={platform.kind}>
      <section className="game-frame" data-testid="game-frame">
        <GameCanvas session={session} bridge={bridge} />
        {state.phase !== 'menu' && combat && (
          <header className="hud">
            <div className="hud-status">
              <div className="hud-title-row">
                <span>Арена {combat.arenaLevel}</span>
                <strong>
                  Ур. {combat.guardianLevel} · {formatTime(combat.elapsedSeconds)}
                </strong>
              </div>
              <div className="hud-meter-row">
                <div
                  className="health-track"
                  aria-label={`${strings.health}: ${Math.ceil(combat.guardianHealth)} / ${combat.guardianMaxHealth}`}
                >
                  <div
                    className="health-value"
                    style={{
                      width: `${(combat.guardianHealth / combat.guardianMaxHealth) * 100}%`,
                    }}
                  />
                </div>
                <span className="bar-label">
                  {Math.ceil(combat.guardianHealth)} / {combat.guardianMaxHealth}
                </span>
              </div>
              <div className="hud-meter-row">
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
                </div>
                <span className="bar-label">
                  {Math.ceil(combat.guardianBarrier)} / {combat.guardianMaxBarrier}
                </span>
              </div>
              <div className="hud-meter-row">
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
                </div>
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
            <ArenaSelector
              selectedArena={selectedArena}
              maxUnlockedArena={progression.maxUnlockedArena}
              onChange={setSelectedArena}
            />
            <div className="menu-actions">
              <button className="button primary" type="button" onClick={start}>
                {strings.start}
              </button>
              <button className="button secondary" type="button" onClick={() => setStatsOpen(true)}>
                Характеристики
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
              <button
                className="button primary"
                type="button"
                disabled={settlingRun}
                onClick={() => void settleFinishedRun('restart')}
              >
                {strings.restart}
              </button>
              <button
                className="button ghost"
                type="button"
                disabled={settlingRun}
                onClick={() => void settleFinishedRun('menu')}
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
          {state.phase === 'menu' && (
            <div>
              <dt>Открыто арен</dt>
              <dd>
                {progression.maxUnlockedArena} / {MAX_ARENA_LEVEL}
              </dd>
            </div>
          )}
          {state.phase === 'menu' && progression.unspentStatPoints > 0 && (
            <div>
              <dt>Очки характеристик</dt>
              <dd>+{progression.unspentStatPoints}</dd>
            </div>
          )}
          {state.phase !== 'menu' && combat && (
            <>
              <div>
                <dt>Арена</dt>
                <dd>{combat.arenaLevel}</dd>
              </div>
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
      {statsOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guardian-stats-title"
          >
            <p className="eyebrow">ПРОКАЧКА</p>
            <h2 id="guardian-stats-title">
              Характеристики стража
              {progression.unspentStatPoints > 0 && (
                <span className="stat-points-badge">+{progression.unspentStatPoints}</span>
              )}
            </h2>
            <div className="guardian-stats-grid">
              <GuardianStat
                label="Здоровье"
                value={formatNumber(guardianStats.maxHealth)}
                upgradeKey="maxHealth"
                canUpgrade={canSpendOn('maxHealth')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Барьер"
                value={formatNumber(guardianStats.maxBarrier)}
                upgradeKey="maxBarrier"
                canUpgrade={canSpendOn('maxBarrier')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Броня"
                value={`${formatNumber(guardianStats.armorPercent * 100)}%`}
                upgradeKey="armorPercent"
                canUpgrade={canSpendOn('armorPercent')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Восстановление"
                value={`${formatNumber(guardianStats.healthRegenPerSecond)}/с`}
                upgradeKey="healthRegenPerSecond"
                canUpgrade={canSpendOn('healthRegenPerSecond')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Урон"
                value={formatNumber(guardianStats.damage)}
                upgradeKey="damage"
                canUpgrade={canSpendOn('damage')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Скорость атаки"
                value={`${formatNumber(guardianStats.attacksPerSecond)}/с`}
                upgradeKey="attacksPerSecond"
                canUpgrade={canSpendOn('attacksPerSecond')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Шанс крит. удара"
                value={`${formatNumber(guardianStats.criticalChance * 100)}%`}
                upgradeKey="criticalChance"
                canUpgrade={canSpendOn('criticalChance')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Крит. множитель"
                value={`×${formatNumber(guardianStats.criticalMultiplier)}`}
                upgradeKey="criticalMultiplier"
                canUpgrade={canSpendOn('criticalMultiplier')}
                onUpgrade={spendStatPoint}
              />
            </div>
            <button className="button primary" type="button" onClick={() => setStatsOpen(false)}>
              Закрыть
            </button>
          </section>
        </div>
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

type ArenaSelectorProps = {
  selectedArena: number;
  maxUnlockedArena: number;
  onChange: (arenaLevel: number) => void;
};

function ArenaSelector({ selectedArena, maxUnlockedArena, onChange }: ArenaSelectorProps) {
  const balance = getArenaBalance(selectedArena);
  const pointerStartY = useRef<number | null>(null);
  const previousArena = selectedArena > 1 ? selectedArena - 1 : null;
  const nextArena = selectedArena < MAX_ARENA_LEVEL ? selectedArena + 1 : null;
  const isNextArenaLocked = nextArena !== null && nextArena > maxUnlockedArena;

  const moveSelection = (direction: -1 | 1) => {
    const nextSelection = selectedArena + direction;
    if (nextSelection >= 1 && nextSelection <= maxUnlockedArena) onChange(nextSelection);
  };

  return (
    <section className="arena-selector" aria-label="Выбор уровня арены">
      <div className="arena-selector-copy">
        <strong>Уровень арены</strong>
        <span>
          Враги ур. {balance.enemyLevel} · {balance.enemyCount} шт.
        </span>
      </div>
      <div
        className="arena-picker"
        role="listbox"
        tabIndex={0}
        aria-label="Уровень арены"
        aria-activedescendant={`arena-option-${selectedArena}`}
        onWheel={(event) => {
          event.preventDefault();
          if (Math.abs(event.deltaY) < 4) return;
          moveSelection(event.deltaY > 0 ? 1 : -1);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          moveSelection(event.key === 'ArrowDown' ? 1 : -1);
        }}
        onPointerDown={(event) => {
          pointerStartY.current = event.clientY;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (pointerStartY.current === null) return;
          const distance = event.clientY - pointerStartY.current;
          pointerStartY.current = null;
          if (Math.abs(distance) >= 24) moveSelection(distance < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          pointerStartY.current = null;
        }}
      >
        <div className="arena-picker-fade arena-picker-fade-top" aria-hidden="true" />
        <div className="arena-picker-fade arena-picker-fade-bottom" aria-hidden="true" />
        <div
          className="arena-option arena-option-adjacent"
          role="option"
          aria-selected="false"
        >
          {previousArena === null ? '\u00a0' : `Арена ${previousArena}`}
        </div>
        <div
          id={`arena-option-${selectedArena}`}
          className="arena-option arena-option-selected"
          role="option"
          aria-selected="true"
        >
          Арена {selectedArena}
        </div>
        <div
          className={`arena-option arena-option-adjacent${
            isNextArenaLocked ? ' arena-option-locked' : ''
          }`}
          role="option"
          aria-selected="false"
          aria-disabled={isNextArenaLocked || undefined}
        >
          {nextArena === null
            ? '\u00a0'
            : `Арена ${nextArena}${isNextArenaLocked ? ' · закрыта' : ''}`}
        </div>
      </div>
    </section>
  );
}

type GuardianStatProps = {
  label: string;
  value: string | number;
  upgradeKey: GuardianStatUpgradeKey;
  canUpgrade: boolean;
  onUpgrade: (stat: GuardianStatUpgradeKey) => void | Promise<void>;
};

function GuardianStat({ label, value, upgradeKey, canUpgrade, onUpgrade }: GuardianStatProps) {
  return (
    <div className="guardian-stat">
      <div className="guardian-stat-copy">
        <span className="guardian-stat-label">{label}</span>
        <strong className="guardian-stat-value">{value}</strong>
      </div>
      <button
        className="stat-upgrade-button"
        type="button"
        disabled={!canUpgrade}
        aria-label={`Увеличить характеристику «${label}»`}
        onClick={() => void onUpgrade(upgradeKey)}
      >
        +
      </button>
    </div>
  );
}

function getExperiencePercent(combat: CombatSnapshot): number {
  if (combat.guardianExperienceForNextLevel === 0) return 100;
  return Math.min(100, (combat.guardianExperience / combat.guardianExperienceForNextLevel) * 100);
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function formatTime(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, '0')}`;
}
