import type { ScribblySettings, ScribblyResponseMessage } from '@common/messages';

type ScribblyMessage =
  | { type: 'scribbly:bootstrap' }
  | { type: 'scribbly:toggle-overlay'; tabId?: number }
  | { type: 'scribbly:update-settings'; settings: Partial<ScribblySettings> };

interface BootstrapResponse {
  type: 'scribbly:bootstrap:response';
  payload: {
    settings: ScribblySettings;
  };
}

function sendMessage<T>(message: ScribblyMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response as T);
    });
  });
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function init() {
  const toggleOverlayButton = document.getElementById('toggle-overlay');
  const openPanelButton = document.getElementById('open-sidepanel');
  const modeSelect = document.getElementById('mode') as HTMLSelectElement | null;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement | null;

  if (toggleOverlayButton) {
    toggleOverlayButton.addEventListener('click', async () => {
      const tabId = await getActiveTabId();
      if (!tabId) return;
      await sendMessage<void>({ type: 'scribbly:toggle-overlay', tabId });
    });
  }

  if (openPanelButton) {
    openPanelButton.addEventListener('click', async () => {
      const tabId = await getActiveTabId();
      if (!tabId) return;
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId });
      }
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', async (event) => {
      const value = (event.target as HTMLSelectElement).value as ScribblySettings['mode'];
      await sendMessage({ type: 'scribbly:update-settings', settings: { mode: value } });
    });
  }

  if (apiKeyInput) {
    apiKeyInput.addEventListener('blur', async (event) => {
      const value = (event.target as HTMLInputElement).value.trim();
      await sendMessage({
        type: 'scribbly:update-settings',
        settings: { cloudApiKey: value || undefined }
      });
    });
  }

  try {
    const bootstrap = await sendMessage<ScribblyResponseMessage>({ type: 'scribbly:bootstrap' });
    if (bootstrap?.type === 'scribbly:bootstrap:response') {
      const { settings } = bootstrap.payload;
      if (modeSelect) modeSelect.value = settings.mode;
      if (apiKeyInput) apiKeyInput.value = settings.cloudApiKey ?? '';
    }
  } catch (error) {
    console.error('[scribbly popup] failed to hydrate', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void init();
});
