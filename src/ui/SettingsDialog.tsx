import type { ReactNode } from 'react';
import { Volume2, Music, Vibrate, Sparkles, X } from 'lucide-react';
import type { GameSettings } from '../services/save/SaveRepository';
import { soundFX } from '../services/audio/SoundFX';
import { strings } from './strings';

type Props = {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
};

export function SettingsDialog({ settings, onChange, onClose }: Props) {
  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    const updated = { ...settings, [key]: value };
    onChange(updated);
    if (key === 'effectsVolume' || key === 'musicVolume') {
      soundFX.setVolumes(updated.musicVolume, updated.effectsVolume);
      if (key === 'effectsVolume' && typeof value === 'number' && value > 0) {
        soundFX.playClick();
      }
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog modern-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header-row">
          <div className="dialog-title-group">
            <p className="eyebrow">КОНФИГУРАЦИЯ</p>
            <h2 id="settings-title">{strings.settings}</h2>
          </div>
          <button
            className="dialog-close-btn"
            type="button"
            aria-label="Закрыть настройки"
            onClick={() => {
              soundFX.playClick();
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="dialog-content-body">
          <div className="setting-card">
            <div className="setting-card-header">
              <div className="setting-label-group">
                <Music size={17} className="setting-icon text-cyan-400" />
                <span className="setting-name">{strings.music}</span>
              </div>
              <output className="setting-badge">{Math.round(settings.musicVolume * 100)}%</output>
            </div>
            <input
              aria-label={strings.music}
              type="range"
              min="0"
              max="1"
              step="0.05"
              className="styled-slider"
              value={settings.musicVolume}
              onChange={(event) => set('musicVolume', Number(event.target.value))}
            />
          </div>

          <div className="setting-card">
            <div className="setting-card-header">
              <div className="setting-label-group">
                <Volume2 size={17} className="setting-icon text-cyan-400" />
                <span className="setting-name">{strings.effects}</span>
              </div>
              <output className="setting-badge">{Math.round(settings.effectsVolume * 100)}%</output>
            </div>
            <input
              aria-label={strings.effects}
              type="range"
              min="0"
              max="1"
              step="0.05"
              className="styled-slider"
              value={settings.effectsVolume}
              onChange={(event) => set('effectsVolume', Number(event.target.value))}
            />
          </div>

          <div className="setting-card">
            <Toggle
              icon={<Vibrate size={17} className="setting-icon text-amber-400" />}
              label={strings.vibration}
              hint="Тактильный отклик при попаданиях и повышении уровня"
              checked={settings.vibration}
              onChange={(checked) => {
                soundFX.playClick();
                set('vibration', checked);
              }}
            />
          </div>

          <div className="setting-card">
            <Toggle
              icon={<Sparkles size={17} className="setting-icon text-purple-400" />}
              label={strings.reducedEffects}
              hint="Снижение интенсивности вспышек и тряски экрана"
              checked={settings.reducedEffects}
              onChange={(checked) => {
                soundFX.playClick();
                set('reducedEffects', checked);
              }}
            />
          </div>
        </div>

        <button
          className="button primary w-full mt-2"
          type="button"
          onClick={() => {
            soundFX.playClick();
            onClose();
          }}
        >
          {strings.close}
        </button>
      </section>
    </div>
  );
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-container">
      <div className="toggle-info">
        <div className="toggle-label-row">
          {icon}
          <span className="toggle-title">{label}</span>
        </div>
        {hint && <span className="toggle-hint">{hint}</span>}
      </div>
      <div className={`switch-track ${checked ? 'active' : ''}`}>
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <div className="switch-thumb" />
      </div>
    </label>
  );
}
