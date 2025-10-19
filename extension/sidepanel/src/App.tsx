import { useEffect, useMemo } from 'react';

import { AvailabilityPanel } from './components/AvailabilityPanel';
import { CombinedSummary } from './components/CombinedSummary';
import { SettingsPanel } from './components/SettingsPanel';
import { SummaryList } from './components/SummaryList';
import { SummaryViewer } from './components/SummaryViewer';
import { handleRuntimeMessage, useScribblyStore } from './state';

export default function App() {
  const collapsed = useScribblyStore((state) => state.collapsed);
  const toggleCollapsed = useScribblyStore((state) => state.toggleCollapsed);
  const hydrate = useScribblyStore((state) => state.hydrate);
  const summaries = useScribblyStore((state) => state.summaries);
  const activeSummaryId = useScribblyStore((state) => state.activeSummaryId);
  const setActiveSummary = useScribblyStore((state) => state.setActiveSummary);
  const capabilities = useScribblyStore((state) => state.capabilities);
  const settings = useScribblyStore((state) => state.settings);
  const saveSettings = useScribblyStore((state) => state.saveSettings);

  const activeSummary = useMemo(
    () => summaries.find((summary) => summary.id === activeSummaryId) ?? null,
    [summaries, activeSummaryId]
  );

  useEffect(() => {
    void hydrate();
    const listener = (message: unknown) => {
      const typed = message as { type?: string };
      if (!typed?.type) return;
      handleRuntimeMessage(typed as never);
    };
    chrome.runtime.onMessage.addListener(listener);
    chrome.runtime.sendMessage({ type: 'scribbly:get-availability' });
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [hydrate]);

  return (
    <div
      className={`h-full transition-all duration-300 ${
        collapsed ? 'w-[56px]' : 'w-[380px]'
      } overflow-y-auto bg-slate-950/95`}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between bg-slate-950/95 px-4 py-3 shadow">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-md bg-slate-900 p-2 text-slate-200 hover:bg-slate-800"
            aria-label="Toggle panel"
          >
            {collapsed ? '⏩' : '⏪'}
          </button>
          {!collapsed && (
            <div>
              <h1 className="text-lg font-semibold text-slate-50">Scribbly</h1>
              <p className="text-xs text-slate-400">Draw, capture, summarize — locally first.</p>
            </div>
          )}
        </div>
      </header>
      {!collapsed && (
        <main className="space-y-4 px-4 pb-6 pt-4">
          <AvailabilityPanel capabilities={capabilities} />
          <SummaryViewer summary={activeSummary} />
          <CombinedSummary summaries={summaries} />
          <section className="scribbly-section space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Recent Summaries
              </h2>
              <a
                href="chrome://on-device-internals"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-sky-400 hover:underline"
              >
                On-device diagnostics
              </a>
            </header>
            <SummaryList
              summaries={summaries}
              activeId={activeSummaryId}
              onSelect={(id) => setActiveSummary(id)}
            />
          </section>
          <SettingsPanel settings={settings} onChange={saveSettings} />
        </main>
      )}
    </div>
  );
}
