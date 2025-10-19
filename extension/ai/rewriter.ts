import type { DownloadState } from '@common/messages';

type RewriterAvailability =
  | { availability: 'readily'; reason?: string }
  | { availability: 'after-download'; reason?: string }
  | { availability: 'unavailable'; reason?: string };

type RewriterMonitorEvent =
  | ['downloadprogress', { completed: number; total?: number }]
  | ['statechange', { state: string }];

interface RewriterSession {
  rewrite(input: { prompt: string; text: string }): Promise<{ output: string } | string>;
  rewriteStreaming?(
    input: { prompt: string; text: string }
  ): AsyncIterable<{ output?: string; done?: boolean } | string>;
  dispose?: () => void;
}

interface RewriterFactory {
  availability(): Promise<RewriterAvailability>;
  create(options?: { monitor?: (...event: RewriterMonitorEvent) => void }): Promise<RewriterSession>;
}

const rewriterGlobal: RewriterFactory | undefined = (globalThis as unknown as {
  Rewriter?: RewriterFactory;
}).Rewriter;

let rewriterSession: RewriterSession | null = null;
let rewriterState: DownloadState = { status: 'unavailable' };

export function isRewriterSupported() {
  return Boolean(rewriterGlobal);
}

export async function getRewriterAvailability(): Promise<DownloadState> {
  if (!rewriterGlobal) {
    rewriterState = { status: 'unavailable', reason: 'Rewriter API requires origin trial token' };
    return rewriterState;
  }

  try {
    const availability = await rewriterGlobal.availability();
    switch (availability.availability) {
      case 'readily':
        rewriterState = { status: 'available' };
        break;
      case 'after-download':
        rewriterState = { status: 'downloadable', reason: availability.reason };
        break;
      default:
        rewriterState = { status: 'unavailable', reason: availability.reason };
    }
  } catch (error) {
    rewriterState = {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error)
    };
  }
  return rewriterState;
}

async function ensureRewriter(onDownload?: (state: DownloadState) => void) {
  if (rewriterSession) return rewriterSession;
  if (!rewriterGlobal) return null;

  const availability = await getRewriterAvailability();
  if (availability.status === 'unavailable') return null;

  const monitor =
    availability.status !== 'available'
      ? (...event: RewriterMonitorEvent) => {
          const [type, payload] = event;
          if (type === 'downloadprogress') {
            rewriterState = {
              status: 'downloading',
              completed: payload.completed,
              total: payload.total
            };
            onDownload?.(rewriterState);
          }
        }
      : undefined;

  rewriterSession = await rewriterGlobal.create({ monitor });
  rewriterState = { status: 'available' };
  onDownload?.(rewriterState);
  return rewriterSession;
}

export async function rewriteWithOnDeviceModel(
  prompt: string,
  text: string,
  onDownload?: (state: DownloadState) => void,
  streaming = false
) {
  const session = await ensureRewriter(onDownload);
  if (!session) {
    throw new Error('Rewriter API session unavailable');
  }

  if (streaming && typeof session.rewriteStreaming === 'function') {
    let buffer = '';
    for await (const chunk of session.rewriteStreaming({ prompt, text })) {
      if (typeof chunk === 'string') {
        buffer += chunk;
      } else if ('output' in chunk) {
        buffer += chunk.output ?? '';
      }
    }
    return buffer.trim();
  }

  const response = await session.rewrite({ prompt, text });
  if (typeof response === 'string') return response.trim();
  return response.output?.trim() ?? '';
}

export function resetRewriterSession() {
  if (rewriterSession?.dispose) {
    try {
      rewriterSession.dispose();
    } catch {
      // ignore
    }
  }
  rewriterSession = null;
  rewriterState = { status: 'unavailable' };
}
