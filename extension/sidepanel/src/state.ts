import { create } from 'zustand';

import type {
  CapabilitySnapshot,
  DownloadState,
  ScribblyResponseMessage,
  ScribblySettings,
  SummaryRecord
} from '@common/messages';

type SendMessageResponse<T> = Promise<T | undefined>;

function sendMessage<T = unknown>(message: unknown): SendMessageResponse<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response as T | undefined);
    });
  });
}

const EMPTY_CAPABILITIES: CapabilitySnapshot = {
  summarizer: { status: 'unavailable', reason: 'Not yet initialized' },
  prompt: { status: 'unavailable', reason: 'Not yet initialized' },
  writer: { status: 'unavailable', reason: 'Toggle in settings' },
  rewriter: { status: 'unavailable', reason: 'Toggle in settings' }
};

export interface ScribblyStoreState {
  collapsed: boolean;
  summaries: SummaryRecord[];
  activeSummaryId: string | null;
  capabilities: CapabilitySnapshot;
  settings: ScribblySettings;
  statusMessage?: string;
  hydrate: () => Promise<void>;
  toggleCollapsed: () => void;
  setActiveSummary: (id: string | null) => void;
  updateCapabilities: (capabilities: CapabilitySnapshot) => void;
  appendSummary: (summary: SummaryRecord) => void;
  updateSummaryStatus: (requestId: string, status: SummaryRecord['status'], error?: string) => void;
  saveSettings: (settings: Partial<ScribblySettings>) => Promise<void>;
  setSettings: (settings: ScribblySettings) => void;
}

export const useScribblyStore = create<ScribblyStoreState>((set, get) => ({
  collapsed: false,
  summaries: [],
  activeSummaryId: null,
  capabilities: EMPTY_CAPABILITIES,
  settings: {
    mode: 'on-device',
    autoOpenSidePanel: true,
    enableWriter: false,
    cloudApiKey: undefined
  },
  statusMessage: undefined,
  async hydrate() {
    const response = await sendMessage<ScribblyResponseMessage>({
      type: 'scribbly:bootstrap'
    });
    if (!response || response.type !== 'scribbly:bootstrap:response') return;
    set({
      summaries: response.payload.summaries,
      capabilities: response.payload.capabilities,
      settings: response.payload.settings
    });
  },
  toggleCollapsed() {
    set((state) => ({ collapsed: !state.collapsed }));
  },
  setActiveSummary(id) {
    set({ activeSummaryId: id });
  },
  updateCapabilities(capabilities) {
    set({ capabilities });
  },
  appendSummary(summary) {
    set((state) => ({
      summaries: [summary, ...state.summaries],
      activeSummaryId: summary.id,
      statusMessage: summary.status === 'completed' ? 'Summary ready' : state.statusMessage
    }));
  },
  updateSummaryStatus(requestId, status, error) {
    set((state) => ({
      summaries: state.summaries.map((summary) =>
        summary.requestId === requestId
          ? { ...summary, status, error: error ?? summary.error }
          : summary
      ),
      statusMessage:
        status === 'error'
          ? error ?? 'Failed to generate summary'
          : status === 'pending'
            ? 'Summarizing...'
            : 'Summary updated'
    }));
  },
  async saveSettings(partial) {
    const response = await sendMessage<ScribblyResponseMessage>({
      type: 'scribbly:update-settings',
      settings: partial
    });
    if (response?.type === 'scribbly:settings') {
      set({ settings: response.settings });
    }
  },
  setSettings(settings) {
    set({ settings });
  }
}));

export function handleRuntimeMessage(message: ScribblyResponseMessage) {
  const actions = useScribblyStore.getState();
  switch (message.type) {
    case 'scribbly:availability':
      actions.updateCapabilities(message.capabilities);
      break;
    case 'scribbly:summary-ready':
      actions.appendSummary(message.summary);
      break;
    case 'scribbly:summary-progress':
      actions.updateSummaryStatus(message.requestId, message.status, message.error);
      break;
    case 'scribbly:settings':
      actions.setSettings(message.settings);
      break;
    default:
      break;
  }
}
