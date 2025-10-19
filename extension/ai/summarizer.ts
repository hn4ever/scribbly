import type { DownloadState } from '@common/messages';

type SummarizerAvailability =
  | { availability: 'readily'; reason?: string }
  | { availability: 'after-download'; reason?: string }
  | { availability: 'unavailable'; reason?: string };

type SummarizerMonitorEvent =
  | ['downloadprogress', { completed: number; total?: number }]
  | ['statechange', { state: string }];

type SummarizerSession = {
  summarize(input: { text: string }): Promise<{ summary: string } | string>;
  summarizeStreaming?(
    input: { text: string }
  ): AsyncIterable<{ summary?: string; done?: boolean } | string>;
  dispose?: () => void;
};

type SummarizerFactory = {
  availability(): Promise<SummarizerAvailability>;
  create(options?: { monitor?: (...args: SummarizerMonitorEvent) => void }): Promise<SummarizerSession>;
};

const globalSummarizer: SummarizerFactory | undefined = (globalThis as unknown as {
  Summarizer?: SummarizerFactory;
}).Summarizer;

let cachedSession: SummarizerSession | null = null;
let cachedState: DownloadState = { status: 'unavailable' };

export function isSummarizerSupported() {
  return Boolean(globalSummarizer);
}

export async function getSummarizerAvailability(): Promise<DownloadState> {
  if (!globalSummarizer) {
    cachedState = { status: 'unavailable', reason: 'Summarizer API not detected' };
    return cachedState;
  }

  try {
    const availability = await globalSummarizer.availability();
    if (!availability) {
      cachedState = { status: 'unavailable', reason: 'No availability payload' };
      return cachedState;
    }
    switch (availability.availability) {
      case 'readily':
        cachedState = { status: 'available' };
        break;
      case 'after-download':
        cachedState = { status: 'downloadable', reason: availability.reason };
        break;
      default:
        cachedState = { status: 'unavailable', reason: availability.reason };
    }
  } catch (error) {
    cachedState = {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  return cachedState;
}

interface SummarizeOptions {
  onDownload?: (state: DownloadState) => void;
  streaming?: boolean;
}

async function ensureSession(options?: SummarizeOptions): Promise<SummarizerSession | null> {
  if (cachedSession) return cachedSession;

  if (!globalSummarizer) {
    cachedState = { status: 'unavailable', reason: 'Summarizer API not detected' };
    return null;
  }

  const availability = await getSummarizerAvailability();
  if (availability.status === 'unavailable') {
    return null;
  }

  const monitor =
    options?.onDownload && availability.status !== 'available'
      ? (...args: SummarizerMonitorEvent) => {
          const [event, data] = args;
          if (event === 'downloadprogress') {
            cachedState = {
              status: 'downloading',
              completed: data.completed,
              total: data.total
            };
            options.onDownload?.(cachedState);
          }
        }
      : undefined;

  cachedSession = await globalSummarizer.create({ monitor });
  cachedState = { status: 'available' };
  options?.onDownload?.(cachedState);
  return cachedSession;
}

export async function summarizeText(text: string, options?: SummarizeOptions) {
  const session = await ensureSession(options);
  if (!session) {
    throw new Error('Summarizer session is not available');
  }

  if (options?.streaming && typeof session.summarizeStreaming === 'function') {
    let result = '';
    for await (const chunk of session.summarizeStreaming({ text })) {
      if (!chunk) continue;
      if (typeof chunk === 'string') {
        result += chunk;
      } else if ('summary' in chunk) {
        result += chunk.summary ?? '';
      }
    }
    return result.trim();
  }

  const summary = await session.summarize({ text });
  if (typeof summary === 'string') return summary.trim();
  return summary.summary?.trim() ?? '';
}

export function resetSummarizer() {
  if (cachedSession?.dispose) {
    try {
      cachedSession.dispose();
    } catch {
      // ignore dispose errors
    }
  }
  cachedSession = null;
  cachedState = { status: 'unavailable' };
}
