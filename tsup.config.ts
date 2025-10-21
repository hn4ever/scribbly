import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      'background/service-worker': 'extension/background/service-worker.ts'
    },
    outDir: 'dist',
    bundle: true,
    splitting: false,
    sourcemap: false,
    format: ['esm'],
    target: ['chrome126'],
    platform: 'browser',
    clean: false,
    shims: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')
    },
    alias: {
      '@ai': './extension/ai',
      '@common': './extension/common',
      '@storage': './extension/storage'
    }
  },
  {
    entry: {
      'content/canvas-overlay': 'extension/content/canvas-overlay.ts'
    },
    outDir: 'dist',
    bundle: true,
    splitting: false,
    sourcemap: false,
    format: ['esm'],
    target: ['chrome126'],
    platform: 'browser',
    clean: false,
    shims: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')
    },
    alias: {
      '@ai': './extension/ai',
      '@common': './extension/common',
      '@storage': './extension/storage'
    }
  }
]);
