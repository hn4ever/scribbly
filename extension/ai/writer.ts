import type { DownloadState } from '@common/messages';

type WriterAvailability =
  | { availability: 'readily'; reason?: string }
  | { availability: 'after-download'; reason?: string }
  | { availability: 'unavailable'; reason?: string };

type WriterMonitorEvent =
  | ['downloadprogress', { completed: number; total?: number }]
  | ['statechange', { state: string }];

interface WriterSession {
  write(input: { prompt: string }): Promise<{ output: string } | string>;
  writeStreaming?(
    input: { prompt: string }
  ): AsyncIterable<{ output?: string; done?: boolean } | string>;
  dispose?: () => void;
}

interface WriterFactory {
  availability(): Promise<WriterAvailability>;
  create(options?: { monitor?: (...event: WriterMonitorEvent) => void }): Promise<WriterSession>;
}

const writerGlobal: WriterFactory | undefined = (globalThis as unknown as {
  Writer?: WriterFactory;
}).Writer;

let writerSession: WriterSession | null = null;
let writerState: DownloadState = { status: 'unavailable' };

export function isWriterSupported() {
  return Boolean(writerGlobal);
}

export async function getWriterAvailability(): Promise<DownloadState> {
  if (!writerGlobal) {
    writerState = { status: 'unavailable', reason: 'Writer API requires origin trial token' };
    return writerState;
  }

  try {
    const availability = await writerGlobal.availability();
    switch (availability.availability) {
      case 'readily':
        writerState = { status: 'available' };
        break;
      case 'after-download':
        writerState = { status: 'downloadable', reason: availability.reason };
        break;
      default:
        writerState = { status: 'unavailable', reason: availability.reason };
    }
  } catch (error) {
    writerState = {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error)
    };
  }
  return writerState;
}

async function ensureWriter(onDownload?: (state: DownloadState) => void) {
  if (writerSession) return writerSession;
  if (!writerGlobal) return null;

  const availability = await getWriterAvailability();
  if (availability.status === 'unavailable') return null;

  const monitor =
    availability.status !== 'available'
      ? (...event: WriterMonitorEvent) => {
          const [type, payload] = event;
          if (type === 'downloadprogress') {
            writerState = {
              status: 'downloading',
              completed: payload.completed,
              total: payload.total
            };
            onDownload?.(writerState);
          }
        }
      : undefined;

  writerSession = await writerGlobal.create({ monitor });
  writerState = { status: 'available' };
  onDownload?.(writerState);
  return writerSession;
}

export async function writeWithOnDeviceModel(
  prompt: string,
  onDownload?: (state: DownloadState) => void,
  streaming = false
) {
  const session = await ensureWriter(onDownload);
  if (!session) {
    throw new Error('Writer API session unavailable');
  }

  if (streaming && typeof session.writeStreaming === 'function') {
    let buffer = '';
    for await (const chunk of session.writeStreaming({ prompt })) {
      if (typeof chunk === 'string') {
        buffer += chunk;
      } else if ('output' in chunk) {
        buffer += chunk.output ?? '';
      }
    }
    return buffer.trim();
  }

  const response = await session.write({ prompt });
  if (typeof response === 'string') return response.trim();
  return response.output?.trim() ?? '';
}

export function resetWriterSession() {
  if (writerSession?.dispose) {
    try {
      writerSession.dispose();
    } catch {
      // ignore
    }
  }
  writerSession = null;
  writerState = { status: 'unavailable' };
}
