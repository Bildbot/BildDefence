import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import confetti from 'canvas-confetti';
import {
  Shield,
  Swords,
  Crosshair,
  Zap,
  Activity,
  Heart,
  TrendingUp,
  Award,
  Settings as SettingsIcon,
  Play,
  RotateCcw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Package,
  Layers,
  Sparkles,
  Lock,
  Pause,
  X,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Clock,
  Compass,
  Coins,
  Hammer,
  Trash2,
} from 'lucide-react';
import { MAX_ARENA_LEVEL, getArenaBalance } from '../content/arenaBalance';
import { FIRST_COMBAT } from '../content/firstCombat';
import type { CombatSnapshot } from '../game/combat/CombatSimulation';
import {
  EQUIPMENT_SLOTS,
  RARITY_LABELS,
  SLOT_LABELS,
  applyEquipmentToGuardian,
  generateVictoryLoot,
  getAddAffixCost,
  getItemSalePrice,
  getRerollAffixCost,
  getEquippedItem,
  orderAffixes,
  type EquipmentItem,
  type EquipmentSlot,
} from '../game/equipment/Equipment';
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
import { soundFX } from '../services/audio/SoundFX';
import type { GameBridge } from '../shared/GameBridge';
import { GameCanvas } from './GameCanvas';
import { EquipmentIcon } from './EquipmentIcon';
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
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [rewards, setRewards] = useState<readonly EquipmentItem[] | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [combat, setCombat] = useState<CombatSnapshot | null>(null);
  const [settlingRun, setSettlingRun] = useState(false);
  const [spendingStat, setSpendingStat] = useState<GuardianStatUpgradeKey | null>(null);

  const settingsOpenRef = useRef(settingsOpen);
  const statsOpenRef = useRef(statsOpen);
  const inventoryOpenRef = useRef(inventoryOpen);
  const leaveConfirmOpenRef = useRef(leaveConfirmOpen);

  const equippedGuardian = applyEquipmentToGuardian(FIRST_COMBAT.guardian, progression.equipment);
  const guardianStats = applyGuardianStatUpgrades(
    equippedGuardian,
    progression.guardianStatUpgrades,
  );

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    statsOpenRef.current = statsOpen;
  }, [statsOpen]);

  useEffect(() => {
    inventoryOpenRef.current = inventoryOpen;
  }, [inventoryOpen]);

  useEffect(() => {
    leaveConfirmOpenRef.current = leaveConfirmOpen;
  }, [leaveConfirmOpen]);

  useEffect(() => bridge.on('combatSnapshot', setCombat), [bridge]);

  useEffect(() => {
    void saves.load().then((save) => {
      setSettings(save.settings);
      setProgression(save.progression);
      setSelectedArena(save.progression.maxUnlockedArena);
      soundFX.setVolumes(save.settings.musicVolume, save.settings.effectsVolume);
    });
    void platform.ready();
    const stopLifecycle = platform.onLifecycleChange((lifecycle) => {
      if (lifecycle === 'inactive') session.pause();
    });
    const stopBack = platform.onBack(() => {
      if (settingsOpenRef.current) setSettingsOpen(false);
      else if (statsOpenRef.current) setStatsOpen(false);
      else if (inventoryOpenRef.current) setInventoryOpen(false);
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
    soundFX.playClick();
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

  const claimVictory = async () => {
    if (settlingRun || state.phase !== 'finished' || state.result !== 'victory') return;
    setSettlingRun(true);
    try {
      const arenaLevel = combat?.arenaLevel ?? state.arenaLevel ?? selectedArena;
      const generatedRewards = generateVictoryLoot(arenaLevel, progression.completedRuns + 1);
      const settled = await saves.settleRun({
        arenaLevel,
        result: 'victory',
        guardianTotalExperience:
          combat?.guardianTotalExperience ?? progression.guardianTotalExperience,
      });
      const withLoot = await saves.addVictoryLoot(generatedRewards);
      setProgression({
        ...withLoot,
        maxUnlockedArena: settled.maxUnlockedArena,
      });
      setRewards(generatedRewards);

      void confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#00f0ff', '#38bdf8', '#fbbf24', '#a855f7'],
      });
    } finally {
      setSettlingRun(false);
    }
  };

  const equip = async (itemId: string) => {
    soundFX.playEquip();
    const nextProgression = await saves.equipItem(itemId);
    setProgression(nextProgression);
    if (settings.vibration) void platform.haptic();
  };

  const sellInventoryItem = async (itemId: string) => {
    const item = progression.equipment.items.find((candidate) => candidate.id === itemId);
    if (!item || !window.confirm(`Продать «${item.name}» за ${getItemSalePrice(item)} золота?`))
      return;
    soundFX.playClick();
    setProgression(await saves.sellItem(itemId));
  };

  const addInventoryAffix = async (itemId: string) => {
    soundFX.playClick();
    setProgression(await saves.addItemAffix(itemId));
  };

  const rerollInventoryAffix = async (itemId: string, family: string) => {
    soundFX.playClick();
    setProgression(await saves.rerollItemAffix(itemId, family));
  };

  const spendStatPoint = async (stat: GuardianStatUpgradeKey) => {
    if (
      spendingStat !== null ||
      progression.unspentStatPoints === 0 ||
      !canUpgradeGuardianStat(equippedGuardian, progression.guardianStatUpgrades, stat)
    ) {
      return;
    }

    soundFX.playLevelUp();
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
    canUpgradeGuardianStat(equippedGuardian, progression.guardianStatUpgrades, stat);

  const equippedCount = EQUIPMENT_SLOTS.filter(
    (s) => getEquippedItem(progression.equipment, s) !== undefined,
  ).length;

  return (
    <main className="app-shell" data-platform={platform.kind}>
      <section className="game-frame" data-testid="game-frame">
        <GameCanvas session={session} bridge={bridge} />

        {/* COMBAT HUD */}
        {state.phase !== 'menu' && combat && (
          <header className="hud">
            <div className="hud-status">
              <div className="hud-title-row">
                <div className="hud-badge-arena">
                  <Shield size={13} className="text-cyan-400" />
                  <span>Арена {combat.arenaLevel}</span>
                </div>
                <div className="hud-badge-level">
                  <Flame size={13} className="text-amber-400" />
                  <span>Ур. {combat.guardianLevel}</span>
                </div>
                <div className="hud-badge-timer">
                  <Clock size={13} className="text-slate-400" />
                  <span>{formatTime(combat.elapsedSeconds)}</span>
                </div>
                <div className="hud-badge-enemies ml-auto">
                  <Crosshair size={13} className="text-red-400" />
                  <span>
                    {combat.defeatedEnemies}/{combat.totalEnemies}
                  </span>
                </div>
              </div>

              {/* Health Meter */}
              <div className="hud-meter-row">
                <div className="meter-icon-wrap text-emerald-400">
                  <Heart size={14} />
                </div>
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
                  {Math.ceil(combat.guardianHealth)}{' '}
                  <small className="text-slate-400">/ {combat.guardianMaxHealth}</small>
                </span>
              </div>

              {/* Experience Meter */}
              <div className="hud-meter-row">
                <div className="meter-icon-wrap text-purple-400">
                  <Sparkles size={14} />
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
                </div>
                <span className="bar-label text-purple-300">
                  {combat.guardianExperienceForNextLevel === 0
                    ? 'MAX'
                    : `${combat.guardianExperience} / ${combat.guardianExperienceForNextLevel} XP`}
                </span>
              </div>
            </div>

            <button
              className="icon-button pause-btn"
              type="button"
              aria-label={strings.pause}
              onClick={() => {
                soundFX.playClick();
                session.pause();
              }}
            >
              <Pause size={17} />
            </button>
          </header>
        )}

        {/* MAIN MENU OVERLAY */}
        {state.phase === 'menu' && (
          <div className="menu-overlay">
            <div className="brand-header">
              <div className="brand-logo-icon">
                <Shield size={24} className="text-cyan-400" />
              </div>
              <div className="brand-copy">
                <h1 className="brand-title">BILD DEFENCE</h1>
                <span className="brand-tagline">ТАКТИЧЕСКАЯ ОБОРОНА И ПРОКАЧКА</span>
              </div>
            </div>

            <ArenaSelector
              selectedArena={selectedArena}
              maxUnlockedArena={progression.maxUnlockedArena}
              onChange={(lvl) => {
                soundFX.playClick();
                setSelectedArena(lvl);
              }}
            />

            <div className="menu-actions">
              <button className="button primary play-button" type="button" onClick={start}>
                <Play size={20} className="fill-current mr-1" />
                {strings.start}
              </button>

              <div className="menu-subactions-grid">
                <button
                  className="button secondary stat-menu-btn"
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setStatsOpen(true);
                  }}
                >
                  <TrendingUp size={18} className="text-cyan-400 mr-2 shrink-0" />
                  <span className="truncate">Прокачка</span>
                  {progression.unspentStatPoints > 0 && (
                    <span className="stat-badge-pulse shrink-0">
                      +{progression.unspentStatPoints}
                    </span>
                  )}
                </button>

                <button
                  className="button secondary"
                  type="button"
                  aria-label="Инвентарь"
                  onClick={() => {
                    soundFX.playClick();
                    setInventoryOpen(true);
                  }}
                >
                  <Package size={18} className="text-purple-400 mr-2 shrink-0" />
                  <span className="truncate">Арсенал</span>
                  <span className="gear-count-pill shrink-0">{equippedCount}/6</span>
                </button>
              </div>

              <button
                className="button ghost settings-btn"
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setSettingsOpen(true);
                }}
              >
                <SettingsIcon size={17} className="mr-2 text-slate-400" />
                <span>{strings.settings}</span>
              </button>
            </div>
          </div>
        )}

        {/* PAUSE OVERLAY */}
        {state.phase === 'paused' && (
          <div
            className="menu-overlay compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
          >
            <div className="pause-dialog-card">
              <div className="pause-icon-badge">
                <Pause size={28} className="text-cyan-400" />
              </div>
              <p className="eyebrow">БОЙ ПРИОСТАНОВЛЕН</p>
              <h2 id="pause-title" className="pause-heading">
                {strings.pause}
              </h2>
              <div className="menu-actions">
                <button
                  className="button primary"
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    session.resume();
                  }}
                >
                  <Play size={18} className="fill-current mr-2" />
                  {strings.resume}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setSettingsOpen(true);
                  }}
                >
                  <SettingsIcon size={17} className="mr-2" />
                  {strings.settings}
                </button>
                <button
                  className="button danger"
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setLeaveConfirmOpen(true);
                  }}
                >
                  <LogOut size={17} className="mr-2" />
                  {strings.exit}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FINISHED RUN OVERLAY */}
        {state.phase === 'finished' && rewards === null && (
          <div
            className={`menu-overlay compact result-${state.result ?? 'defeat'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <div className="result-card-inner">
              <div
                className={`result-icon-orb ${state.result === 'victory' ? 'victory-glow' : 'defeat-glow'}`}
              >
                {state.result === 'victory' ? (
                  <Award size={36} className="text-amber-400" />
                ) : (
                  <AlertTriangle size={36} className="text-red-400" />
                )}
              </div>
              <p className="eyebrow">{state.result === 'victory' ? 'ТРИУМФ' : 'РУБЕЖ ПРОРВАН'}</p>
              <h2 id="result-title" className="result-title-heading">
                {state.result === 'victory' ? strings.victory : strings.defeat}
              </h2>
              <p className="subtitle">
                {state.result === 'victory' ? strings.victoryHint : strings.defeatHint}
              </p>
              <div className="menu-actions">
                {state.result === 'victory' ? (
                  <button
                    className="button primary victory-claim-btn"
                    type="button"
                    disabled={settlingRun}
                    onClick={() => void claimVictory()}
                  >
                    <Sparkles size={18} className="mr-2 text-amber-300" />
                    Получить награду
                  </button>
                ) : (
                  <button
                    className="button primary"
                    type="button"
                    disabled={settlingRun}
                    onClick={() => {
                      soundFX.playClick();
                      void settleFinishedRun('restart');
                    }}
                  >
                    <RotateCcw size={18} className="mr-2" />
                    {strings.restart}
                  </button>
                )}
                <button
                  className="button ghost"
                  type="button"
                  disabled={settlingRun}
                  onClick={() => {
                    soundFX.playClick();
                    void settleFinishedRun('menu');
                  }}
                >
                  <LogOut size={16} className="mr-2" />
                  {strings.exit}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* DESKTOP SIDEBAR PANEL */}
      <aside className="desktop-panel" aria-label="Информация о забеге">
        <div className="terminal-header">
          <div className="terminal-status-dot" />
          <p className="eyebrow">ТАКТИЧЕСКАЯ КОНСОЛЬ</p>
        </div>
        <h2 className="terminal-title">
          {state.phase === 'menu' ? 'Готовность к бою' : 'Боевая симуляция'}
        </h2>
        <p className="terminal-desc">
          Портативная арена обороны 390 × 640. Реальное время, детерминированный боевой движок и
          постоянная мета-прогрессия.
        </p>

        <div className="terminal-specs-grid">
          <div className="terminal-spec-card">
            <span className="spec-label">Платформа</span>
            <strong className="spec-value text-cyan-400 capitalize">{platform.kind}</strong>
          </div>
          <div className="terminal-spec-card">
            <span className="spec-label">Боевой номер</span>
            <strong className="spec-value text-slate-200">#{state.runId}</strong>
          </div>
          {state.phase === 'menu' && (
            <>
              <div className="terminal-spec-card">
                <span className="spec-label">Открыто арен</span>
                <strong className="spec-value text-amber-400">
                  {progression.maxUnlockedArena} / {MAX_ARENA_LEVEL}
                </strong>
              </div>
              <div className="terminal-spec-card">
                <span className="spec-label">Свободных очков</span>
                <strong
                  className={`spec-value ${progression.unspentStatPoints > 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}
                >
                  +{progression.unspentStatPoints}
                </strong>
              </div>
            </>
          )}
          {state.phase !== 'menu' && combat && (
            <>
              <div className="terminal-spec-card">
                <span className="spec-label">Арена</span>
                <strong className="spec-value text-cyan-400">Уровень {combat.arenaLevel}</strong>
              </div>
              <div className="terminal-spec-card">
                <span className="spec-label">Уровень стража</span>
                <strong className="spec-value text-purple-400">
                  {combat.guardianLevel} / {combat.guardianMaxLevel}
                </strong>
              </div>
              <div className="terminal-spec-card">
                <span className="spec-label">Здоровье</span>
                <strong className="spec-value text-emerald-400">
                  {Math.ceil(combat.guardianHealth)} / {combat.guardianMaxHealth}
                </strong>
              </div>
              <div className="terminal-spec-card">
                <span className="spec-label">Враги на поле</span>
                <strong className="spec-value text-red-400">{combat.aliveEnemies} шт.</strong>
              </div>
            </>
          )}
        </div>

        {/* Guardian Active Stats Mini Summary */}
        <div className="guardian-mini-sheet">
          <h3 className="mini-sheet-title">Характеристики стража</h3>
          <div className="mini-stats-list">
            <div className="mini-stat-item">
              <span>Урон</span>
              <b>
                {formatNumber(guardianStats.minimumDamage)}–
                {formatNumber(guardianStats.maximumDamage)}
              </b>
            </div>
            <div className="mini-stat-item">
              <span>Скорость атаки</span>
              <b>{formatNumber(guardianStats.attacksPerSecond)}/с</b>
            </div>
            <div className="mini-stat-item">
              <span>Шанс крита</span>
              <b>{formatNumber(guardianStats.criticalChance * 100)}%</b>
            </div>
            <div className="mini-stat-item">
              <span>Реген HP</span>
              <b>{formatNumber(guardianStats.healthRegenPerSecond)}/с</b>
            </div>
          </div>
        </div>
      </aside>

      {/* SETTINGS DIALOG */}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* STATS PROGRESSION DIALOG */}
      {statsOpen && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setStatsOpen(false)}>
          <section
            className="dialog modern-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guardian-stats-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-header-row">
              <div className="dialog-title-group">
                <p className="eyebrow">ПРОКАЧКА СТРАЖА</p>
                <h2 id="guardian-stats-title" className="flex items-center gap-2">
                  Характеристики
                  {progression.unspentStatPoints > 0 && (
                    <span className="stat-points-badge">
                      +{progression.unspentStatPoints} очков
                    </span>
                  )}
                </h2>
              </div>
              <button
                className="dialog-close-btn"
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setStatsOpen(false);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="guardian-stats-grid">
              <GuardianStat
                icon={<Heart size={16} className="text-emerald-400" />}
                label="Здоровье"
                stepLabel="+10 HP"
                value={formatNumber(guardianStats.maxHealth)}
                upgradeKey="maxHealth"
                canUpgrade={canSpendOn('maxHealth')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                icon={<Activity size={16} className="text-teal-400" />}
                label="Восстановление"
                stepLabel="+0.1/с (макс 5)"
                value={`${formatNumber(guardianStats.healthRegenPerSecond)}/с`}
                upgradeKey="healthRegenPerSecond"
                canUpgrade={canSpendOn('healthRegenPerSecond')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                icon={<Swords size={16} className="text-cyan-400" />}
                label="Урон"
                stepLabel="+2 к урону"
                value={`${formatNumber(guardianStats.minimumDamage)}–${formatNumber(guardianStats.maximumDamage)}`}
                upgradeKey="damage"
                canUpgrade={canSpendOn('damage')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                icon={<Zap size={16} className="text-amber-400" />}
                label="Скорость атаки"
                stepLabel="+0.075/с (макс 3)"
                value={`${formatNumber(guardianStats.attacksPerSecond)}/с`}
                upgradeKey="attacksPerSecond"
                canUpgrade={canSpendOn('attacksPerSecond')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                icon={<Crosshair size={16} className="text-purple-400" />}
                label="Шанс крит. удара"
                stepLabel="+3% (макс 50%)"
                value={`${formatNumber(guardianStats.criticalChance * 100)}%`}
                upgradeKey="criticalChance"
                canUpgrade={canSpendOn('criticalChance')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                icon={<Flame size={16} className="text-red-400" />}
                label="Крит. множитель"
                stepLabel="+0.15× (макс 3×)"
                value={`×${formatNumber(guardianStats.criticalMultiplier)}`}
                upgradeKey="criticalMultiplier"
                canUpgrade={canSpendOn('criticalMultiplier')}
                onUpgrade={spendStatPoint}
              />
            </div>

            <button
              className="button primary w-full mt-4"
              type="button"
              onClick={() => {
                soundFX.playClick();
                setStatsOpen(false);
              }}
            >
              Закрыть
            </button>
          </section>
        </div>
      )}

      {/* INVENTORY DIALOG */}
      {inventoryOpen && (
        <InventoryDialog
          equipment={progression.equipment}
          gold={progression.gold}
          onEquip={(itemId) => void equip(itemId)}
          onSell={(itemId) => void sellInventoryItem(itemId)}
          onAddAffix={(itemId) => void addInventoryAffix(itemId)}
          onRerollAffix={(itemId, family) => void rerollInventoryAffix(itemId, family)}
          onClose={() => {
            soundFX.playClick();
            setInventoryOpen(false);
          }}
        />
      )}

      {/* REWARD DIALOG */}
      {rewards && (
        <RewardDialog
          rewards={rewards}
          equipment={progression.equipment}
          onEquip={(itemId) => void equip(itemId)}
          onClose={() => {
            soundFX.playClick();
            setRewards(null);
            session.exit();
          }}
        />
      )}

      {/* LEAVE CONFIRM DIALOG */}
      {leaveConfirmOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setLeaveConfirmOpen(false)}
        >
          <section
            className="dialog modern-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="leave-warning-icon">
              <AlertTriangle size={32} className="text-amber-400" />
            </div>
            <p className="eyebrow">ПОДТВЕРЖДЕНИЕ</p>
            <h2 id="leave-title">{strings.leaveTitle}</h2>
            <p className="leave-desc">{strings.leaveHint}</p>
            <div className="dialog-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setLeaveConfirmOpen(false);
                }}
              >
                {strings.stay}
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => {
                  soundFX.playClick();
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

type EquipmentDialogProps = {
  equipment: GameProgression['equipment'];
  onEquip: (itemId: string) => void;
  onClose: () => void;
};

type InventoryDialogProps = EquipmentDialogProps & {
  gold: number;
  onSell: (itemId: string) => void;
  onAddAffix: (itemId: string) => void;
  onRerollAffix: (itemId: string, family: string) => void;
};

function InventoryDialog({
  equipment,
  gold,
  onEquip,
  onSell,
  onAddAffix,
  onRerollAffix,
  onClose,
}: InventoryDialogProps) {
  const [activeTab, setActiveTab] = useState<'backpack' | 'equipment'>('backpack');
  const [activeFilter, setActiveFilter] = useState<EquipmentSlot | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = equipment.items.find((item) => item.id === selectedId);
  const visibleItems = equipment.items.filter(
    (item) => activeFilter === 'all' || item.slot === activeFilter,
  );

  const showItemsForSlot = (slot: EquipmentSlot) => {
    soundFX.playClick();
    setActiveFilter(slot);
    setActiveTab('backpack');
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog modern-dialog inventory-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Инвентарь"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header-row">
          <div className="dialog-title-group">
            <p className="eyebrow">АРСЕНАЛ</p>
            <h2 className="flex items-center gap-2">
              <Package size={20} className="text-purple-400" />
              Инвентарь
            </h2>
          </div>
          <button className="dialog-close-btn" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="gold-balance" aria-label={`Золото: ${gold}`}>
          <Coins size={17} />
          <strong>{gold}</strong>
          <span>золота</span>
        </div>

        <div className="inventory-tabs" role="tablist" aria-label="Раздел инвентаря">
          <button
            className={activeTab === 'backpack' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeTab === 'backpack'}
            onClick={() => setActiveTab('backpack')}
          >
            <Layers size={15} /> Рюкзак <span>{equipment.items.length}</span>
          </button>
          <button
            className={activeTab === 'equipment' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeTab === 'equipment'}
            onClick={() => setActiveTab('equipment')}
          >
            <Shield size={15} /> Экипировка
          </button>
        </div>

        {activeTab === 'backpack' ? (
          <div className="inventory-backpack-panel" role="tabpanel">
            <div className="inventory-filters" aria-label="Фильтр предметов">
              <button
                className={activeFilter === 'all' ? 'active' : ''}
                type="button"
                onClick={() => setActiveFilter('all')}
              >
                Все
              </button>
              {EQUIPMENT_SLOTS.map((slot) => {
                return (
                  <button
                    key={slot}
                    className={activeFilter === slot ? 'active' : ''}
                    type="button"
                    aria-label={`Фильтр: ${SLOT_LABELS[slot]}`}
                    onClick={() => setActiveFilter(slot)}
                  >
                    <EquipmentIcon slot={slot} />
                    <span>{SLOT_LABELS[slot]}</span>
                  </button>
                );
              })}
            </div>
            <div className="inventory-items-grid" role="list" aria-label="Предметы в рюкзаке">
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  equipped={getEquippedItem(equipment, item.slot)?.id === item.id}
                  onClick={() => {
                    soundFX.playClick();
                    setSelectedId(item.id);
                  }}
                />
              ))}
              {visibleItems.length === 0 && (
                <div className="empty-backpack-hint">
                  <Package size={28} className="text-slate-600 mb-1" />
                  <span>Здесь пока нет предметов</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="equipment-paperdoll" role="tabpanel" aria-label="Надетая экипировка">
            <div className="paperdoll-core">
              <Shield size={58} />
              <span>СТРАЖ</span>
            </div>
            {EQUIPMENT_SLOTS.map((slot) => {
              const item = getEquippedItem(equipment, slot);
              return (
                <button
                  key={slot}
                  className={`paperdoll-slot paperdoll-${slot} ${item ? `filled rarity-${item.rarity}` : 'empty'}`}
                  type="button"
                  aria-label={`${SLOT_LABELS[slot]}: ${item?.name ?? 'пусто'}`}
                  onClick={() => showItemsForSlot(slot)}
                >
                  <EquipmentIcon slot={slot} />
                  <span>{SLOT_LABELS[slot]}</span>
                  <strong>{item?.name ?? 'Пусто'}</strong>
                </button>
              );
            })}
            <p>Нажмите на слот, чтобы выбрать подходящий предмет</p>
          </div>
        )}

        {selected && activeTab === 'backpack' && (
          <div className="item-inspector-backdrop" onClick={() => setSelectedId(null)}>
            <div className="item-inspector-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="item-inspector-handle" />
              <button
                className="dialog-close-btn item-inspector-close"
                type="button"
                aria-label="Закрыть описание предмета"
                onClick={() => setSelectedId(null)}
              >
                <X size={18} />
              </button>
              <ItemDetails
                item={selected}
                equipped={getEquippedItem(equipment, selected.slot)?.id === selected.id}
                gold={gold}
                onEquip={(itemId) => {
                  onEquip(itemId);
                  setSelectedId(null);
                }}
                onSell={(itemId) => {
                  onSell(itemId);
                  setSelectedId(null);
                }}
                onAddAffix={onAddAffix}
                onRerollAffix={onRerollAffix}
              />
            </div>
          </div>
        )}

        <small className="icon-attribution">
          Иконки:{' '}
          <a href="https://game-icons.net/" target="_blank" rel="noreferrer">
            Game-icons.net
          </a>{' '}
          · CC BY 3.0
        </small>
      </section>
    </div>
  );
}

function RewardDialog({
  rewards,
  equipment,
  onEquip,
  onClose,
}: EquipmentDialogProps & { rewards: readonly EquipmentItem[] }) {
  const [selectedId, setSelectedId] = useState(rewards[0]?.id ?? null);
  const selected = rewards.find((item) => item.id === selectedId);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog modern-dialog reward-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Награда за победу"
      >
        <div className="reward-header-banner">
          <Award size={32} className="text-amber-400 mb-1" />
          <p className="eyebrow text-amber-300">ПОБЕДА НА АРЕНЕ</p>
          <h2 className="reward-heading">Трофеи битвы</h2>
        </div>

        <div className="reward-items-grid">
          {rewards.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              equipped={getEquippedItem(equipment, item.slot)?.id === item.id}
              onClick={() => {
                soundFX.playClick();
                setSelectedId(item.id);
              }}
            />
          ))}
        </div>

        {selected && (
          <ItemDetails
            item={selected}
            equipped={getEquippedItem(equipment, selected.slot)?.id === selected.id}
            onEquip={onEquip}
          />
        )}

        <button
          className="button primary victory-claim-btn w-full mt-4"
          type="button"
          onClick={onClose}
        >
          В главное меню
        </button>
      </section>
    </div>
  );
}

type ItemCardProps = {
  key?: string;
  item: EquipmentItem;
  selected: boolean;
  equipped: boolean;
  onClick: () => void;
};

function ItemCard({ item, selected, equipped, onClick }: ItemCardProps) {
  return (
    <button
      className={`item-card modern-item-card rarity-${item.rarity} ${selected ? 'selected' : ''}`}
      type="button"
      onClick={onClick}
    >
      <div className="item-card-icon-wrap">
        <EquipmentIcon slot={item.slot} />
      </div>
      <div className="item-card-copy">
        <div className="item-card-meta">
          <span>{SLOT_LABELS[item.slot]}</span>
          <span className="item-level-tag">Ур.{item.level}</span>
        </div>
        <strong className="item-card-title">{item.name}</strong>
        <small className="item-primary-stat">{item.primaryValue}</small>
      </div>
      {equipped && (
        <span className="equipped-chip">
          <CheckCircle2 size={11} className="mr-0.5" /> Надето
        </span>
      )}
    </button>
  );
}

function ItemDetails({
  item,
  equipped,
  gold,
  onEquip,
  onSell,
  onAddAffix,
  onRerollAffix,
}: {
  item: EquipmentItem;
  equipped: boolean;
  gold?: number;
  onEquip: (itemId: string) => void;
  onSell?: (itemId: string) => void;
  onAddAffix?: (itemId: string) => void;
  onRerollAffix?: (itemId: string, family: string) => void;
}) {
  return (
    <article className={`item-details modern-item-details rarity-${item.rarity}`}>
      <div className="item-details-heading">
        <div className="item-details-icon">
          <EquipmentIcon slot={item.slot} />
        </div>
        <div className="item-details-titles">
          <span className="rarity-type-badge">
            {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]} · Ур. {item.level}
          </span>
          <strong className="item-full-name">{item.name}</strong>
        </div>
      </div>

      <div className="primary-stat-banner">
        <span className="primary-stat-label">{item.primaryLabel}</span>
        <strong className="primary-stat-val">{item.primaryValue}</strong>
      </div>

      {item.affixes.length > 0 && (
        <div className="item-affixes">
          <h4 className="affixes-header">Магические свойства</h4>
          <ul className="affixes-list">
            {orderAffixes(item.affixes).map((affix) => (
              <li key={affix.family} className="affix-item">
                <span className="affix-kind-tier">
                  {affix.kind === 'prefix' ? 'Префикс' : 'Суффикс'} · T{affix.tier}
                </span>
                <div className="affix-text-row">
                  <strong className="affix-name">{affix.label}</strong>
                  <b className="affix-value">{affix.valueLabel}</b>
                </div>
                {onRerollAffix && gold !== undefined && (
                  <button
                    className="craft-affix-button"
                    type="button"
                    disabled={gold < getRerollAffixCost(item)}
                    onClick={() => onRerollAffix(item.id, affix.family)}
                  >
                    <Hammer size={12} />
                    Заменить · {getRerollAffixCost(item)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.affixes.length === 0 && <p className="no-affixes">Обычный предмет без аффиксов</p>}

      {onAddAffix && gold !== undefined && getAddAffixCost(item) !== null && (
        <button
          className="button secondary w-full mt-3"
          type="button"
          disabled={gold < (getAddAffixCost(item) ?? 0)}
          onClick={() => onAddAffix(item.id)}
        >
          <Hammer size={15} /> Добавить аффикс · {getAddAffixCost(item)}
        </button>
      )}

      <button
        className={`button ${equipped ? 'ghost' : 'secondary'} w-full mt-3`}
        type="button"
        disabled={equipped}
        onClick={() => onEquip(item.id)}
      >
        {equipped ? 'Уже надето на стража' : 'Надеть предмет'}
      </button>

      {onSell && (
        <button
          className="button danger w-full mt-2"
          type="button"
          disabled={equipped}
          onClick={() => onSell(item.id)}
        >
          <Trash2 size={15} />{' '}
          {equipped ? 'Сначала снимите предмет' : `Продать · ${getItemSalePrice(item)}`}
        </button>
      )}
    </article>
  );
}

type ArenaSelectorProps = {
  selectedArena: number;
  maxUnlockedArena: number;
  onChange: (arenaLevel: number) => void;
};

function ArenaSelector({ selectedArena, maxUnlockedArena, onChange }: ArenaSelectorProps) {
  const balance = getArenaBalance(selectedArena);
  const pointerStartX = useRef<number | null>(null);
  const previousArena = selectedArena > 1 ? selectedArena - 1 : null;
  const nextArena = selectedArena < MAX_ARENA_LEVEL ? selectedArena + 1 : null;
  const isNextArenaLocked = nextArena !== null && nextArena > maxUnlockedArena;

  const moveSelection = (direction: -1 | 1) => {
    const nextSelection = selectedArena + direction;
    if (nextSelection >= 1 && nextSelection <= maxUnlockedArena) onChange(nextSelection);
  };

  return (
    <section
      className="arena-selector modern-arena-selector"
      aria-label="Выбор уровня арены"
      onWheel={(event) => {
        if (Math.abs(event.deltaY) < 4) return;
        moveSelection(event.deltaY > 0 ? 1 : -1);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          moveSelection(-1);
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveSelection(1);
        }
      }}
      onPointerDown={(event) => {
        pointerStartX.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (pointerStartX.current === null) return;
        const distance = event.clientX - pointerStartX.current;
        pointerStartX.current = null;
        if (Math.abs(distance) >= 25) moveSelection(distance < 0 ? 1 : -1);
      }}
    >
      <div className="arena-card-compact">
        <button
          className="arena-nav-arrow-btn"
          type="button"
          disabled={previousArena === null}
          aria-label="Предыдущая арена"
          onClick={() => previousArena !== null && onChange(previousArena)}
        >
          <ChevronLeft size={20} />
        </button>

        <div className="arena-card-center">
          <div className="arena-card-header-row">
            <div className="arena-badge-pill">
              <Compass size={12} className="text-cyan-400 mr-1" />
              <span>АРЕНА {selectedArena}</span>
            </div>
            <span className="arena-danger-rating">
              {'★'.repeat(Math.min(5, Math.ceil(selectedArena / 20)))}
            </span>
          </div>

          <div className="arena-threat-metrics">
            <div className="threat-item">
              <Crosshair size={12} className="text-red-400 mr-1" />
              <span>Враги ур. {balance.enemyLevel}</span>
            </div>
            <span className="threat-dot">·</span>
            <div className="threat-item">
              <Layers size={12} className="text-amber-400 mr-1" />
              <span>{balance.enemyCount} в волне</span>
            </div>
          </div>
        </div>

        <button
          className={`arena-nav-arrow-btn ${isNextArenaLocked ? 'is-locked' : ''}`}
          type="button"
          disabled={nextArena === null || isNextArenaLocked}
          aria-label={isNextArenaLocked ? 'Арена заблокирована' : 'Следующая арена'}
          onClick={() => nextArena !== null && !isNextArenaLocked && onChange(nextArena)}
        >
          {isNextArenaLocked ? (
            <Lock size={15} className="text-slate-500" />
          ) : (
            <ChevronRight size={20} />
          )}
        </button>
      </div>
    </section>
  );
}

type GuardianStatProps = {
  icon: ReactNode;
  label: string;
  stepLabel: string;
  value: string | number;
  upgradeKey: GuardianStatUpgradeKey;
  canUpgrade: boolean;
  onUpgrade: (stat: GuardianStatUpgradeKey) => void | Promise<void>;
};

function GuardianStat({
  icon,
  label,
  stepLabel,
  value,
  upgradeKey,
  canUpgrade,
  onUpgrade,
}: GuardianStatProps) {
  return (
    <div className={`guardian-stat-card ${canUpgrade ? 'upgradeable' : ''}`}>
      <div className="stat-icon-badge">{icon}</div>
      <div className="guardian-stat-copy">
        <span className="guardian-stat-label">{label}</span>
        <strong className="guardian-stat-value">{value}</strong>
        <small className="stat-step-hint">{stepLabel}</small>
      </div>
      <button
        className={`stat-upgrade-button ${canUpgrade ? 'pulse' : ''}`}
        type="button"
        disabled={!canUpgrade}
        aria-label={`Увеличить характеристику «${label}»`}
        onClick={() => void onUpgrade(upgradeKey)}
      >
        <Plus size={18} />
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
