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
import {
  getPromptAvailability,
  isPromptSupported,
  promptModel,
  resetPromptSession
} from '@ai/prompt';
import {
  getRewriterAvailability,
  isRewriterSupported,
  resetRewriterSession,
  rewriteWithOnDeviceModel
} from '@ai/rewriter';
import {
  getSummarizerAvailability,
  isSummarizerSupported,
  resetSummarizer,
  summarizeText
} from '@ai/summarizer';
import {
  getWriterAvailability,
  isWriterSupported,
  resetWriterSession,
  writeWithOnDeviceModel
} from '@ai/writer';
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

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
  void bootstrapState();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrapState();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-overlay') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  const current = overlayState.get(tab.id) ?? true;
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
        await chrome.tabs.sendMessage(tabId, {
          type: 'scribbly:overlay-toggle',
          visible: next
        });
      }
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
  if (settingsCache.mode === 'cloud') {
    if (!settingsCache.cloudApiKey) {
      throw new Error('Cloud mode enabled without an API key. Update settings in the popup.');
    }
    return runGeminiFallback(text, settingsCache.cloudApiKey);
  }

  const summary = await summarizeText(text, {
    onDownload: (state) => void updateCapability('summarizer', state)
  });
  return summary;
}

async function runGeminiFallback(text: string, apiKey: string) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Summarize the following web selection in concise bullets:\n\n${text}`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Cloud summarization failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const output = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!output) {
    throw new Error('Cloud summarization returned no content');
  }
  return output;
}

async function refreshCapabilities(): Promise<CapabilitySnapshot> {
  const summarizer = await getSummarizerAvailability();
  const prompt = isPromptSupported() ? await getPromptAvailability() : disabledState('Prompt API');
  const writer = settingsCache.enableWriter
    ? await getWriterAvailability()
    : disabledState('Writer disabled');
  const rewriter = settingsCache.enableWriter
    ? await getRewriterAvailability()
    : disabledState('Rewriter disabled');

  capabilitiesCache = {
    summarizer,
    prompt,
    writer,
    rewriter
  };
  await saveCapabilitySnapshot(capabilitiesCache);
  broadcast({ type: 'scribbly:availability', capabilities: capabilitiesCache });
  return capabilitiesCache;
}

function disabledState(reason: string): DownloadState {
  return { status: 'unavailable', reason };
}

function updateCapability(key: keyof CapabilitySnapshot, state: DownloadState) {
  if (!capabilitiesCache) return;
  capabilitiesCache = { ...capabilitiesCache, [key]: state };
  void saveCapabilitySnapshot(capabilitiesCache);
  broadcast({ type: 'scribbly:availability', capabilities: capabilitiesCache });
}

function broadcast(message: ScribblyResponseMessage) {
  chrome.runtime.sendMessage(message, () => {
    const error = chrome.runtime.lastError;
    if (error) {
      console.warn('[scribbly] broadcast failed', error.message);
    }
  });
}

// Expose optional helpers to the popup if needed.
export async function getPromptCompletion(prompt: string) {
  const result = await promptModel(
    [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ],
    (state) => updateCapability('prompt', state)
  );
  return result;
}

export async function writerDraft(prompt: string) {
  if (!settingsCache.enableWriter) {
    throw new Error('Writer API is disabled in settings.');
  }
  return writeWithOnDeviceModel(prompt, (state) => updateCapability('writer', state));
}

export async function rewriterDraft(prompt: string, text: string) {
  if (!settingsCache.enableWriter) {
    throw new Error('Rewriter API is disabled in settings.');
  }
  return rewriteWithOnDeviceModel(prompt, text, (state) => updateCapability('rewriter', state));
}
