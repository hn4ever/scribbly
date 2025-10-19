import { vi } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var chrome: typeof import('chrome');
}

const storageState: Record<string, unknown> = {};

globalThis.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    getURL: (path: string) => path
  },
  storage: {
    local: {
      get: vi.fn((keys: string | string[] | object, callback: (items: Record<string, unknown>) => void) => {
        const keyArray = Array.isArray(keys)
          ? keys
          : typeof keys === 'string'
            ? [keys]
            : Object.keys(keys);
        const result: Record<string, unknown> = {};
        keyArray.forEach((key) => {
          result[key] = storageState[key];
        });
        callback(result);
      }),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(storageState, items);
        callback?.();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => {
          delete storageState[key];
        });
        callback?.();
      })
    }
  }
} as unknown as typeof chrome;
