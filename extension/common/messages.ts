export type SummarySource = 'selection' | 'rectangle' | 'page';

export interface RectPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SummaryRequestPayload {
  requestId: string;
  text: string;
  url: string;
  title: string;
  source: SummarySource;
  rect?: RectPayload;
  triggeredAt: number;
}

export interface SummaryRecord {
  id: string;
  requestId: string;
  source: SummarySource;
  text: string;
  summary: string;
  createdAt: number;
  url: string;
  title: string;
  status: 'pending' | 'completed' | 'error';
  error?: string;
  mode: 'on-device' | 'cloud';
}

export type DrawingTool = 'highlighter' | 'eraser' | 'rectangle';

export interface DrawingStroke {
  id: string;
  color: string;
  width: number;
  opacity: number;
  points: Array<{ x: number; y: number }>;
  tool: DrawingTool;
}

export interface DrawingRecord {
  id: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  strokes: DrawingStroke[];
  imageDataUrl?: string;
}

export interface ScribblySettings {
  mode: 'on-device' | 'cloud';
  autoOpenSidePanel: boolean;
  enableWriter: boolean;
  cloudApiKey?: string;
}

export type DownloadState =
  | { status: 'unavailable'; reason?: string }
  | { status: 'downloadable'; reason?: string }
  | { status: 'downloading'; completed: number; total?: number }
  | { status: 'available' };

export interface CapabilitySnapshot {
  summarizer: DownloadState;
  prompt: DownloadState;
  writer: DownloadState;
  rewriter: DownloadState;
}

export type ScribblyRequestMessage =
  | { type: 'scribbly:bootstrap' }
  | { type: 'scribbly:get-availability' }
  | { type: 'scribbly:update-settings'; settings: Partial<ScribblySettings> }
  | { type: 'scribbly:request-summary'; payload: SummaryRequestPayload }
  | { type: 'scribbly:save-drawing'; drawing: DrawingRecord }
  | { type: 'scribbly:toggle-overlay'; visible?: boolean; tabId?: number }
  | { type: 'scribbly:fetch-drawings'; url: string }
  | { type: 'scribbly:set-tool'; tool: DrawingTool; tabId?: number }
  | {
      type: 'scribbly:overlay-command';
      command: 'undo' | 'redo' | 'clear' | 'summarize-selection';
      tabId?: number;
    };

export type ScribblyResponseMessage =
  | {
      type: 'scribbly:bootstrap:response';
      payload: {
        settings: ScribblySettings;
        summaries: SummaryRecord[];
        capabilities: CapabilitySnapshot;
      };
    }
  | { type: 'scribbly:availability'; capabilities: CapabilitySnapshot }
  | { type: 'scribbly:summary-progress'; requestId: string; status: SummaryRecord['status']; error?: string }
  | { type: 'scribbly:summary-ready'; summary: SummaryRecord }
  | { type: 'scribbly:drawing-saved'; drawing: DrawingRecord }
  | { type: 'scribbly:overlay-toggle'; visible: boolean }
  | { type: 'scribbly:drawings'; url: string; drawings: DrawingRecord[] }
  | { type: 'scribbly:settings'; settings: ScribblySettings };

export type ScribblyMessage = ScribblyRequestMessage | ScribblyResponseMessage;
