import { openDB, type DBSchema } from 'idb';

import type {
  CapabilitySnapshot,
  DrawingRecord,
  ScribblySettings,
  SummaryRecord
} from '@common/messages';

const DB_NAME = 'scribbly';
const DB_VERSION = 1;

type CapabilitiesRow = CapabilitySnapshot & { id: string };

interface ScribblyDB extends DBSchema {
  drawings: {
    key: string;
    value: DrawingRecord;
    indexes: { 'by-url': string };
  };
  summaries: {
    key: string;
    value: SummaryRecord;
    indexes: { 'by-url': string; 'by-createdAt': number };
  };
  capabilities: {
    key: string;
    value: CapabilitiesRow;
  };
}

const SETTINGS_KEY = 'preferences';
const CAPABILITIES_KEY = 'latest';

export const DEFAULT_SETTINGS: ScribblySettings = {
  mode: 'on-device',
  autoOpenSidePanel: true,
  enableWriter: false,
  cloudApiKey: undefined
};

let dbPromise: ReturnType<typeof openDB<ScribblyDB>> | null = null;

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ScribblyDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion === 0) {
          const drawings = database.createObjectStore('drawings', { keyPath: 'id' });
          drawings.createIndex('by-url', 'url');

          const summaries = database.createObjectStore('summaries', { keyPath: 'id' });
          summaries.createIndex('by-url', 'url');
          summaries.createIndex('by-createdAt', 'createdAt');

          const capabilities = database.createObjectStore('capabilities', { keyPath: 'id' });
          capabilities.put({ id: CAPABILITIES_KEY, ...createEmptyCapabilities() });
        }
      }
    });
  }
  return dbPromise;
}

function createEmptyCapabilities(): CapabilitySnapshot {
  return {
    summarizer: { status: 'unavailable' },
    prompt: { status: 'unavailable' },
    writer: { status: 'unavailable' },
    rewriter: { status: 'unavailable' }
  };
}

export async function saveDrawing(drawing: DrawingRecord) {
  const db = await getDB();
  await db.put('drawings', drawing);
}

export async function getDrawingsByUrl(url: string) {
  const db = await getDB();
  return db.getAllFromIndex('drawings', 'by-url', IDBKeyRange.only(url));
}

export async function saveSummary(summary: SummaryRecord) {
  const db = await getDB();
  await db.put('summaries', summary);
}

export async function updateSummaryStatus(id: string, status: SummaryRecord['status'], error?: string) {
  const db = await getDB();
  const record = await db.get('summaries', id);
  if (!record) return;
  const updated: SummaryRecord = { ...record, status, error };
  await db.put('summaries', updated);
}

export async function listSummaries(limit = 50) {
  const db = await getDB();
  const tx = db.transaction('summaries');
  const index = tx.store.index('by-createdAt');
  const summaries: SummaryRecord[] = [];
  let cursor = await index.openCursor(null, 'prev');
  while (cursor && summaries.length < limit) {
    summaries.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return summaries;
}

export async function getSettings() {
  const stored = await new Promise<ScribblySettings | undefined>((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (value) => {
      resolve(value[SETTINGS_KEY] as ScribblySettings | undefined);
    });
  });
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(settings: Partial<ScribblySettings>) {
  const merged = { ...(await getSettings()), ...settings };
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: merged }, () => resolve());
  });
  return merged;
}

export async function getCapabilitySnapshot() {
  const db = await getDB();
  const record = await db.get('capabilities', CAPABILITIES_KEY);
  if (!record) return createEmptyCapabilities();
  const { id: _id, ...snapshot } = record;
  return snapshot;
}

export async function saveCapabilitySnapshot(snapshot: CapabilitySnapshot) {
  const db = await getDB();
  const row: CapabilitiesRow = { id: CAPABILITIES_KEY, ...snapshot };
  await db.put('capabilities', row);
}
