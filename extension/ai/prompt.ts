import type { DownloadState } from '@common/messages';

type PromptAvailability =
  | { availability: 'readily'; reason?: string }
  | { availability: 'after-download'; reason?: string }
  | { availability: 'unavailable'; reason?: string };

type PromptMonitorEvent =
  | ['downloadprogress', { completed: number; total?: number }]
  | ['statechange', { state: string }];

interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PromptSession {
  prompt(messages: PromptMessage[]): Promise<string | { output: string }>;
  dispose?: () => void;
}

interface LanguageModelFactory {
  availability(): Promise<PromptAvailability>;
  create(options?: { monitor?: (...event: PromptMonitorEvent) => void }): Promise<PromptSession>;
}

const languageModel: LanguageModelFactory | undefined = (globalThis as unknown as {
  LanguageModel?: LanguageModelFactory;
}).LanguageModel;

let sessionCache: PromptSession | null = null;
let promptState: DownloadState = { status: 'unavailable' };

export function isPromptSupported() {
  return Boolean(languageModel);
}

export async function getPromptAvailability(): Promise<DownloadState> {
  if (!languageModel) {
    promptState = { status: 'unavailable', reason: 'LanguageModel API not detected' };
    return promptState;
  }

  try {
    const availability = await languageModel.availability();
    switch (availability.availability) {
      case 'readily':
        promptState = { status: 'available' };
        break;
      case 'after-download':
        promptState = { status: 'downloadable', reason: availability.reason };
        break;
      default:
        promptState = { status: 'unavailable', reason: availability.reason };
        break;
    }
  } catch (error) {
    promptState = {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  return promptState;
}

async function ensureSession(onDownload?: (state: DownloadState) => void) {
  if (sessionCache) return sessionCache;
  if (!languageModel) return null;

  const availability = await getPromptAvailability();
  if (availability.status === 'unavailable') return null;

  const monitor =
    availability.status !== 'available'
      ? (...event: PromptMonitorEvent) => {
          const [type, data] = event;
          if (type === 'downloadprogress') {
            promptState = {
              status: 'downloading',
              completed: data.completed,
              total: data.total
            };
            onDownload?.(promptState);
          }
        }
      : undefined;

  sessionCache = await languageModel.create({ monitor });
  promptState = { status: 'available' };
  onDownload?.(promptState);
  return sessionCache;
}

export async function promptModel(
  messages: PromptMessage[],
  onDownload?: (state: DownloadState) => void
) {
  const session = await ensureSession(onDownload);
  if (!session) {
    throw new Error('Prompt API session unavailable');
  }

  const response = await session.prompt(messages);
  if (typeof response === 'string') return response;
  return response.output ?? '';
}

export function resetPromptSession() {
  if (sessionCache?.dispose) {
    try {
      sessionCache.dispose();
    } catch {
      // ignore
    }
  }
  sessionCache = null;
  promptState = { status: 'unavailable' };
}
