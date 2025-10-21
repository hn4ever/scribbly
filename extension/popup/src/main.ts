import type { DrawingTool, ScribblyResponseMessage, ScribblySettings } from '@common/messages';

type ScribblyMessage =
  | { type: 'scribbly:bootstrap' }
  | { type: 'scribbly:toggle-overlay'; tabId?: number; visible?: boolean }
  | { type: 'scribbly:update-settings'; settings: Partial<ScribblySettings> }
  | { type: 'scribbly:set-tool'; tool: DrawingTool; tabId?: number };

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
  const openPanelButton = document.getElementById('open-sidepanel');
  const modeSelect = document.getElementById('mode') as HTMLSelectElement | null;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement | null;
  const toolButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-tool]')
  );
  const toggleOverlayButton = document.getElementById('toggle-overlay') as HTMLButtonElement | null;

  let overlayVisible = false;

  if (toggleOverlayButton) {
    toggleOverlayButton.addEventListener('click', async () => {
      const tabId = await getActiveTabId();
      if (!tabId) return;
      overlayVisible = !overlayVisible;
      try {
        await Promise.all([
          sendMessage<void>({ type: 'scribbly:toggle-overlay', tabId, visible: overlayVisible }),
          sendMessageToTab(tabId, { type: 'scribbly:overlay-toggle', visible: overlayVisible })
        ]);
        toggleOverlayButton.textContent = overlayVisible ? 'Hide Highlights' : 'Show Highlights';
      } catch (error) {
        console.error('[scribbly popup] failed to toggle overlay', error);
      }
    });
  }

  for (const button of toolButtons) {
    button.addEventListener('click', async () => {
      const tool = button.dataset.tool as DrawingTool;
      const tabId = await ensureOverlayVisible();
      if (!tabId) return;
      try {
        await Promise.all([
          sendMessage<void>({ type: 'scribbly:set-tool', tool, tabId }),
          sendMessageToTab(tabId, { type: 'scribbly:set-tool', tool })
        ]);
        setActiveToolButton(toolButtons, tool);
        overlayVisible = true;
        if (toggleOverlayButton) {
          toggleOverlayButton.textContent = 'Hide Highlights';
        }
      } catch (error) {
        console.error('[scribbly popup] failed to set tool', error);
      }
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
    const bootstrap = await sendMessage<ScribblyResponseMessage | BootstrapResponse>({
      type: 'scribbly:bootstrap'
    });
    if (bootstrap && 'type' in bootstrap && bootstrap.type === 'scribbly:bootstrap:response') {
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

async function ensureOverlayVisible() {
  const tabId = await getActiveTabId();
  if (!tabId) return null;
  try {
    await Promise.all([
      sendMessage<void>({ type: 'scribbly:toggle-overlay', tabId, visible: true }),
      sendMessageToTab(tabId, { type: 'scribbly:overlay-toggle', visible: true })
    ]);
  } catch (error) {
    console.error('[scribbly popup] failed to ensure overlay', error);
  }
  return tabId;
}

async function sendMessageToTab<T>(tabId: number, message: unknown): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(response as T | undefined);
    });
  });
}

function setActiveToolButton(buttons: HTMLButtonElement[], tool: DrawingTool) {
  for (const button of buttons) {
    button.classList.toggle('active-tool', button.dataset.tool === tool);
  }
}
