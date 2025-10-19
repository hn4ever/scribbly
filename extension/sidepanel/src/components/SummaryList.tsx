import type { SummaryRecord } from '@common/messages';

function statusColor(status: SummaryRecord['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'error':
      return 'bg-rose-500/20 text-rose-200';
    default:
      return 'bg-sky-500/20 text-sky-300';
  }
}

function modeLabel(mode: SummaryRecord['mode']) {
  return mode === 'cloud' ? 'Cloud (opt-in)' : 'On-device';
}

interface SummaryListProps {
  summaries: SummaryRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function SummaryList({ summaries, activeId, onSelect }: SummaryListProps) {
  if (summaries.length === 0) {
    return (
      <div className="scribbly-section">
        <p className="text-sm text-slate-400">
          Draw a rectangle or highlight text on the page to generate your first summary.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {summaries.map((summary) => (
        <li key={summary.id}>
          <button
            type="button"
            onClick={() => onSelect(summary.id)}
            className={`w-full rounded-lg border p-3 text-left transition ${
              activeId === summary.id
                ? 'border-slate-500 bg-slate-800/80'
                : 'border-transparent bg-slate-900/60 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                {new Date(summary.createdAt).toLocaleTimeString()}
              </span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusColor(summary.status)}`}>
                {summary.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-200">{summary.summary || summary.text}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span className="truncate">{summary.title}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-medium">{modeLabel(summary.mode)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
