import type { GameSettings } from '../services/save/SaveRepository';
import { strings } from './strings';

type Props = {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
};

export function SettingsDialog({ settings, onChange, onClose }: Props) {
  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <p className="eyebrow">СИСТЕМА</p>
        <h2 id="settings-title">{strings.settings}</h2>
        <label className="range-row">
          <span>{strings.music}</span>
          <output>{Math.round(settings.musicVolume * 100)}%</output>
          <input
            aria-label={strings.music}
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.musicVolume}
            onChange={(event) => set('musicVolume', Number(event.target.value))}
          />
        </label>
        <label className="range-row">
          <span>{strings.effects}</span>
          <output>{Math.round(settings.effectsVolume * 100)}%</output>
          <input
            aria-label={strings.effects}
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.effectsVolume}
            onChange={(event) => set('effectsVolume', Number(event.target.value))}
          />
        </label>
        <Toggle
          label={strings.vibration}
          checked={settings.vibration}
          onChange={(checked) => set('vibration', checked)}
        />
        <Toggle
          label={strings.reducedEffects}
          checked={settings.reducedEffects}
          onChange={(checked) => set('reducedEffects', checked)}
        />
        <button className="button primary" type="button" onClick={onClose}>
          {strings.close}
        </button>
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
