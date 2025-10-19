import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: {
    alias: {
      '@sidepanel': resolve(__dirname, 'extension/sidepanel/src'),
      '@ai': resolve(__dirname, 'extension/ai'),
      '@storage': resolve(__dirname, 'extension/storage')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'extension/sidepanel/index.html'),
        popup: resolve(__dirname, 'extension/popup/index.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  publicDir: resolve(__dirname, 'extension/public'),
  server: {
    port: 5173,
    open: '/sidepanel/index.html'
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/unit/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html']
    }
  }
});
