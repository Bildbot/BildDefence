import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_ARENA_LEVEL, getArenaBalance } from '../content/arenaBalance';
import { FIRST_COMBAT } from '../content/firstCombat';
import type { CombatSnapshot } from '../game/combat/CombatSimulation';
import {
  EQUIPMENT_SLOTS,
  RARITY_LABELS,
  SLOT_LABELS,
  applyEquipmentToGuardian,
  generateVictoryLoot,
  getEquippedItem,
  orderAffixes,
  type EquipmentItem,
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
      setProgression({ ...withLoot, maxUnlockedArena: settled.maxUnlockedArena });
      setRewards(generatedRewards);
    } finally {
      setSettlingRun(false);
    }
  };

  const equip = async (itemId: string) => {
    const nextProgression = await saves.equipItem(itemId);
    setProgression(nextProgression);
    if (settings.vibration) void platform.haptic();
  };

  const spendStatPoint = async (stat: GuardianStatUpgradeKey) => {
    if (
      spendingStat !== null ||
      progression.unspentStatPoints === 0 ||
      !canUpgradeGuardianStat(equippedGuardian, progression.guardianStatUpgrades, stat)
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
    canUpgradeGuardianStat(equippedGuardian, progression.guardianStatUpgrades, stat);

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
                onClick={() => setInventoryOpen(true)}
              >
                Инвентарь
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
        {state.phase === 'finished' && rewards === null && (
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
              {state.result === 'victory' ? (
                <button
                  className="button primary"
                  type="button"
                  disabled={settlingRun}
                  onClick={() => void claimVictory()}
                >
                  Получить награду
                </button>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  disabled={settlingRun}
                  onClick={() => void settleFinishedRun('restart')}
                >
                  {strings.restart}
                </button>
              )}
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
                label="Восстановление"
                value={`${formatNumber(guardianStats.healthRegenPerSecond)}/с`}
                upgradeKey="healthRegenPerSecond"
                canUpgrade={canSpendOn('healthRegenPerSecond')}
                onUpgrade={spendStatPoint}
              />
              <GuardianStat
                label="Урон"
                value={`${formatNumber(guardianStats.minimumDamage)}–${formatNumber(guardianStats.maximumDamage)}`}
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
      {inventoryOpen && (
        <InventoryDialog
          equipment={progression.equipment}
          onEquip={(itemId) => void equip(itemId)}
          onClose={() => setInventoryOpen(false)}
        />
      )}
      {rewards && (
        <RewardDialog
          rewards={rewards}
          equipment={progression.equipment}
          onEquip={(itemId) => void equip(itemId)}
          onClose={() => {
            setRewards(null);
            session.exit();
          }}
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

type EquipmentDialogProps = {
  equipment: GameProgression['equipment'];
  onEquip: (itemId: string) => void;
  onClose: () => void;
};

function InventoryDialog({ equipment, onEquip, onClose }: EquipmentDialogProps) {
  const [selectedId, setSelectedId] = useState(equipment.items[0]?.id ?? null);
  const selected = equipment.items.find((item) => item.id === selectedId);
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog inventory-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Инвентарь"
      >
        <div className="inventory-title">
          <EquipmentIcon slot="backpack" />
          <div>
            <p className="eyebrow">ЭКИПИРОВКА</p>
            <h2>Инвентарь</h2>
          </div>
        </div>
        <h3 className="inventory-section-title">Надето</h3>
        <div className="equipment-slots">
          {EQUIPMENT_SLOTS.map((slot) => {
            const item = getEquippedItem(equipment, slot);
            return (
              <button
                key={slot}
                className={item ? 'filled' : 'empty'}
                type="button"
                aria-label={`${SLOT_LABELS[slot]}: ${item?.name ?? 'пусто'}`}
                onClick={() => item && setSelectedId(item.id)}
              >
                <EquipmentIcon slot={slot} />
                <span className="slot-copy">
                  <span>{SLOT_LABELS[slot]}</span>
                  <strong>{item?.name ?? 'Пусто'}</strong>
                </span>
              </button>
            );
          })}
        </div>
        <div className="inventory-section-heading">
          <h3 className="inventory-section-title">В рюкзаке</h3>
          <span>{equipment.items.length}</span>
        </div>
        <div className="inventory-items" role="list" aria-label="Предметы в рюкзаке">
          {equipment.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              equipped={getEquippedItem(equipment, item.slot)?.id === item.id}
              onClick={() => setSelectedId(item.id)}
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
        <button className="button primary" type="button" onClick={onClose}>
          Закрыть
        </button>
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
        className="dialog reward-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Награда за победу"
      >
        <p className="eyebrow">ПОБЕДА</p>
        <h2>Награда за арену</h2>
        <div className="reward-items">
          {rewards.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              equipped={getEquippedItem(equipment, item.slot)?.id === item.id}
              onClick={() => setSelectedId(item.id)}
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
        <button className="button primary" type="button" onClick={onClose}>
          В главное меню
        </button>
      </section>
    </div>
  );
}

function ItemCard({
  item,
  selected,
  equipped,
  onClick,
}: {
  item: EquipmentItem;
  selected: boolean;
  equipped: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`item-card rarity-${item.rarity}${selected ? ' selected' : ''}`}
      type="button"
      onClick={onClick}
    >
      <EquipmentIcon slot={item.slot} />
      <span className="item-card-copy">
        <span>
          {SLOT_LABELS[item.slot]} · ур. {item.level}
        </span>
        <strong>{item.name}</strong>
        <small>{item.primaryValue}</small>
      </span>
      {equipped && <em>Надето</em>}
    </button>
  );
}

function ItemDetails({
  item,
  equipped,
  onEquip,
}: {
  item: EquipmentItem;
  equipped: boolean;
  onEquip: (itemId: string) => void;
}) {
  return (
    <article className={`item-details rarity-${item.rarity}`}>
      <div className="item-details-heading">
        <EquipmentIcon slot={item.slot} />
        <div>
          <span>
            {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]}
          </span>
          <strong>{item.name}</strong>
        </div>
      </div>
      <dl>
        <div>
          <dt>{item.primaryLabel}</dt>
          <dd>{item.primaryValue}</dd>
        </div>
      </dl>
      {item.affixes.length > 0 && (
        <div className="item-affixes">
          <h4>Аффиксы</h4>
          <ul>
            {orderAffixes(item.affixes).map((affix) => (
              <li key={affix.family}>
                <span>
                  {affix.kind === 'prefix' ? 'Префикс' : 'Суффикс'} · T{affix.tier}
                </span>
                <div>
                  <strong>{affix.label}</strong>
                  <b>{affix.valueLabel}</b>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.affixes.length === 0 && <p className="no-affixes">Без аффиксов</p>}
      <button
        className="button secondary"
        type="button"
        disabled={equipped}
        onClick={() => onEquip(item.id)}
      >
        {equipped ? 'Надето' : 'Надеть'}
      </button>
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
        <div className="arena-option arena-option-adjacent" role="option" aria-selected="false">
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
