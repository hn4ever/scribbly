import { useState, type ChangeEvent } from 'react';

import type { ScribblySettings } from '@common/messages';

interface SettingsPanelProps {
  settings: ScribblySettings;
  onChange: (settings: Partial<ScribblySettings>) => void;
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState(settings.cloudApiKey ?? '');

  const handleModeChange = (mode: ScribblySettings['mode']) => {
    onChange({ mode });
  };

  const handleWriterChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ enableWriter: event.target.checked });
  };

  const handleApiKeyBlur = () => {
    if (apiKey === settings.cloudApiKey) return;
    onChange({ cloudApiKey: apiKey.trim() || undefined });
  };

  return (
    <section className="scribbly-section space-y-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Settings
        </h2>
        <p className="text-xs text-slate-400">
          Scribbly uses on-device AI by default. Cloud fallback only activates when you opt in.
        </p>
      </header>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase text-slate-400">Mode</span>
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              settings.mode === 'on-device'
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                : 'border-slate-600 bg-slate-900 text-slate-200'
            }`}
            onClick={() => handleModeChange('on-device')}
          >
            On-device
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              settings.mode === 'cloud'
                ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                : 'border-slate-600 bg-slate-900 text-slate-200'
            }`}
            onClick={() => handleModeChange('cloud')}
          >
            Cloud (opt-in)
          </button>
        </div>
      </div>

      {settings.mode === 'cloud' && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-slate-400" htmlFor="scribbly-api-key">
            Gemini / Firebase AI API Key
          </label>
          <input
            id="scribbly-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onBlur={handleApiKeyBlur}
            placeholder="Paste API key"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
          />
          <p className="text-[11px] text-slate-500">
            API keys are stored locally using chrome.storage.local. Remove the key to revert to
            on-device summarization only.
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={settings.enableWriter}
          onChange={handleWriterChange}
          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-400 focus:ring-sky-500"
        />
        Enable Writer &amp; Rewriter APIs (Chrome origin trial required)
      </label>
      <p className="text-[11px] text-slate-500">
        Add your origin trial token to the manifest before enabling these features. Requires Chrome
        Canary 137+ with the writer experiment flag.
      </p>
    </section>
  );
}
