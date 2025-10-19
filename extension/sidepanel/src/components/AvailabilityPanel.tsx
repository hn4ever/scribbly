import type { CapabilitySnapshot, DownloadState } from '@common/messages';

const TITLES: Record<keyof CapabilitySnapshot, string> = {
  summarizer: 'Summarizer',
  prompt: 'Prompt API',
  writer: 'Writer',
  rewriter: 'Rewriter'
};

function statusLabel(state: DownloadState) {
  switch (state.status) {
    case 'available':
      return 'Available';
    case 'downloadable':
      return 'Download';
    case 'downloading':
      if (typeof state.total === 'number' && state.total > 0) {
        const percent = Math.round((state.completed / state.total) * 100);
        return `Downloading ${percent}%`;
      }
      return `Downloading ${state.completed}`;
    default:
      return state.reason ?? 'Unavailable';
  }
}

function statusClass(state: DownloadState) {
  switch (state.status) {
    case 'available':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'downloading':
      return 'bg-sky-500/20 text-sky-300';
    case 'downloadable':
      return 'bg-amber-500/20 text-amber-300';
    default:
      return 'bg-rose-500/10 text-rose-200';
  }
}

interface AvailabilityPanelProps {
  capabilities: CapabilitySnapshot;
}

export function AvailabilityPanel({ capabilities }: AvailabilityPanelProps) {
  return (
    <section className="scribbly-section space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Model Availability
        </h2>
      </header>
      <dl className="grid grid-cols-1 gap-3">
        {(Object.keys(capabilities) as Array<keyof CapabilitySnapshot>).map((key) => {
          const state = capabilities[key];
          return (
            <div key={key} className="flex items-center justify-between rounded-md bg-slate-800/60 p-3">
              <dt className="text-sm font-medium text-slate-200">{TITLES[key]}</dt>
              <dd className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(state)}`}>
                {statusLabel(state)}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="text-xs text-slate-400">
        Downloads happen on-device. Track progress in chrome://on-device-internals if required.
      </p>
    </section>
  );
}
