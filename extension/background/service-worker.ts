import {
  getCapabilitySnapshot,
  getDrawingsByUrl,
  getSettings,
  listSummaries,
  saveCapabilitySnapshot,
  saveDrawing,
  saveSummary,
  updateSettings,
  updateSummaryStatus,
  DEFAULT_SETTINGS
} from '@storage/db';
import type {
  CapabilitySnapshot,
  DownloadState,
  ScribblyRequestMessage,
  ScribblyResponseMessage,
  ScribblySettings,
  SummaryRecord,
  SummaryRequestPayload
} from '@common/messages';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const overlayState = new Map<number, boolean>();
let settingsCache: ScribblySettings = DEFAULT_SETTINGS;
let capabilitiesCache: CapabilitySnapshot | null = null;

void bootstrapState();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-overlay') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  const current = overlayState.get(tab.id) ?? false;
  const next = !current;
  overlayState.set(tab.id, next);
  await chrome.tabs.sendMessage(tab.id, { type: 'scribbly:overlay-toggle', visible: next });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.warn('[scribbly] failed to open side panel', error);
    }
  }
  const current = overlayState.get(tab.id) ?? false;
  const next = !current;
  overlayState.set(tab.id, next);
  await chrome.tabs.sendMessage(tab.id, { type: 'scribbly:overlay-toggle', visible: next });
});

chrome.runtime.onMessage.addListener((message: ScribblyRequestMessage, sender, sendResponse) => {
  void handleMessage(message, sender).then((response) => {
    if (response) {
      sendResponse(response);
    }
  });
  return true;
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function bootstrapState() {
  settingsCache = await getSettings();
  capabilitiesCache = await getCapabilitySnapshot();
  await refreshCapabilities();
}

async function handleMessage(
  message: ScribblyRequestMessage,
  sender: chrome.runtime.MessageSender
): Promise<ScribblyResponseMessage | void> {
  switch (message.type) {
    case 'scribbly:bootstrap': {
      const [summaries, capabilities] = await Promise.all([
        listSummaries(),
        capabilitiesCache ?? getCapabilitySnapshot()
      ]);
      return {
        type: 'scribbly:bootstrap:response',
        payload: {
          settings: settingsCache,
          summaries,
          capabilities
        }
      };
    }
    case 'scribbly:get-availability': {
      const snapshot = await refreshCapabilities();
      return { type: 'scribbly:availability', capabilities: snapshot };
    }
    case 'scribbly:update-settings': {
      settingsCache = await updateSettings(message.settings);
      if ('mode' in message.settings) {
        resetSummarizer();
        resetPromptSession();
        resetWriterSession();
        resetRewriterSession();
        await refreshCapabilities();
      }
      if ('cloudApiKey' in message.settings && sender.tab?.id) {
        await chrome.tabs.sendMessage(sender.tab.id, {
          type: 'scribbly:settings',
          settings: settingsCache
        });
      }
      return { type: 'scribbly:settings', settings: settingsCache };
    }
    case 'scribbly:request-summary': {
      await handleSummaryRequest(message.payload);
      return;
    }
    case 'scribbly:save-drawing': {
      await saveDrawing(message.drawing);
      return {
        type: 'scribbly:drawing-saved',
        drawing: message.drawing
      };
    }
    case 'scribbly:toggle-overlay': {
      {
        const tabId = message.tabId ?? sender.tab?.id;
        if (!tabId) return;
        const current = overlayState.get(tabId) ?? false;
        const next = typeof message.visible === 'boolean' ? message.visible : !current;
        overlayState.set(tabId, next);
        await sendToTab(tabId, {
          type: 'scribbly:overlay-toggle',
          visible: next
        });
      }
      return;
    }
    case 'scribbly:set-tool': {
      const tabId = message.tabId ?? sender.tab?.id;
      if (!tabId) return;
      overlayState.set(tabId, true);
      await sendToTab(tabId, {
        type: 'scribbly:overlay-toggle',
        visible: true
      });
      await sendToTab(tabId, {
        type: 'scribbly:set-tool',
        tool: message.tool
      });
      return;
    }
    case 'scribbly:overlay-command': {
      const tabId = message.tabId ?? sender.tab?.id;
      if (!tabId) return;
      await sendToTab(tabId, {
        type: 'scribbly:overlay-command',
        command: message.command
      });
      return;
    }
    case 'scribbly:fetch-drawings': {
      const drawings = await getDrawingsByUrl(message.url);
      return { type: 'scribbly:drawings', url: message.url, drawings };
    }
    default:
      return;
  }
}

async function handleSummaryRequest(payload: SummaryRequestPayload) {
  const summaryId = crypto.randomUUID();
  const base: SummaryRecord = {
    id: summaryId,
    requestId: payload.requestId,
    source: payload.source,
    text: payload.text,
    summary: '',
    createdAt: Date.now(),
    url: payload.url,
    title: payload.title,
    status: 'pending',
    mode: settingsCache.mode
  };
  await saveSummary(base);
  broadcast({ type: 'scribbly:summary-progress', requestId: payload.requestId, status: 'pending' });

  try {
    const summaryText = await summarizeWithPreference(payload.text);
    const completed: SummaryRecord = { ...base, summary: summaryText, status: 'completed' };
    await saveSummary(completed);
    broadcast({ type: 'scribbly:summary-ready', summary: completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateSummaryStatus(summaryId, 'error', message);
    broadcast({
      type: 'scribbly:summary-progress',
      requestId: payload.requestId,
      status: 'error',
      error: message
    });
  }
}

async function summarizeWithPreference(text: string) {
  return text.trim();
}

async function refreshCapabilities(): Promise<CapabilitySnapshot> {
  capabilitiesCache = {
    summarizer: disabledState('Summarizer not configured'),
    prompt: disabledState('Prompt API not configured'),
    writer: disabledState('Writer API not configured'),
    rewriter: disabledState('Rewriter API not configured')
  };
  await saveCapabilitySnapshot(capabilitiesCache);
  broadcast({ type: 'scribbly:availability', capabilities: capabilitiesCache });
  return capabilitiesCache;
}

function disabledState(reason: string): DownloadState {
  return { status: 'unavailable', reason };
}

function broadcast(message: ScribblyResponseMessage) {
  chrome.runtime.sendMessage(message, () => {
    const error = chrome.runtime.lastError;
    if (error) {
      console.warn('[scribbly] broadcast failed', error.message);
    }
  });
}

async function sendToTab(tabId: number, message: unknown) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    console.warn('[scribbly] failed to send message to tab', tabId, err);
  }
}
