import { useMemo } from 'react';

import type { SummaryRecord } from '@common/messages';

interface CombinedSummaryProps {
  summaries: SummaryRecord[];
}

export function CombinedSummary({ summaries }: CombinedSummaryProps) {
  const combined = useMemo(() => {
    if (summaries.length === 0) return '';
    return summaries
      .filter((summary) => summary.status === 'completed')
      .map((summary) => `• ${summary.summary}`)
      .join('\n');
  }, [summaries]);

  const handleCopy = async () => {
    if (!combined) return;
    await navigator.clipboard.writeText(combined);
  };

  const handleDownload = () => {
    if (!combined) return;
    const blob = new Blob([combined], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `scribbly-summary-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="scribbly-section space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Combined Highlights
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!combined}
            className="rounded-md bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-40"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!combined}
            className="rounded-md bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-40"
          >
            Download
          </button>
        </div>
      </header>
      {combined ? (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-slate-200">
          {combined}
        </pre>
      ) : (
        <p className="text-sm text-slate-400">
          Summaries will appear here once they finish generating. Export options become available
          when summaries are ready.
        </p>
      )}
    </section>
  );
}
