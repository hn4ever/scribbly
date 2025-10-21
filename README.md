# Scribbly

Scribbly is a Manifest V3 extension that lets you draw on top of any webpage, capture highlights, and generate AI-powered summaries directly in a collapsible side panel. On-device AI is the default path; a cloud fallback (Gemini / Firebase AI) is available only when you explicitly opt in.

## Highlights

- Overlay with pen, highlighter, eraser, rectangle tools, undo/redo, and resilient DOM anchoring
- Rectangle draws and text highlights trigger the Summarizer API with download state tracking
- Side panel (React + Vite + Tailwind) shows summaries, combined exports, and capability status
- IndexedDB via `idb` stores drawings and summaries; `chrome.storage.local` stores settings
- Background service worker routes all AI requests, monitors downloads, and handles cloud fallback
- Popup for quick toggles, plus a demo page to test tooling outside of real sites

## Chrome requirements

The on-device APIs only ship in Chrome Canary today.

1. Install Chrome Canary 126 or newer.
2. Enable `chrome://flags/#optimization-guide-on-device-model`.
3. Restart the browser so the Summarizer and Prompt APIs can download their models.
4. (Optional) Enable `chrome://flags/#prompt-api-for-devtools` to experiment with the Prompt API locally.
5. (Writer/Rewriter) Register your own origin trial at <https://developer.chrome.com/origintrials/> and replace the manifest token placeholders. Enable `chrome://flags/#writer-api` when testing in Chrome 137–142.

### Origin trial manifest tokens

```json
"origin_trials": [
  {
    "feature": "WriterAPI",
    "expiry": "2024-12-31",
    "tokens": ["REPLACE_WITH_WRITER_API_TOKEN"]
  },
  {
    "feature": "RewriterAPI",
    "expiry": "2024-12-31",
    "tokens": ["REPLACE_WITH_REWRITER_API_TOKEN"]
  }
]
```

Create a `.env.local` (or `.env`) based on `.env.example` and add your tokens there:

```bash
cp .env.example .env.local
```

Fill in `SCRIBBLY_WRITER_ORIGIN_TRIAL_TOKEN` and `SCRIBBLY_REWRITER_ORIGIN_TRIAL_TOKEN`. Set `SCRIBBLY_ENABLE_ORIGIN_TRIALS=true` when you build for Chrome Canary 137+; leave it `false` (default) to skip injecting the optional manifest field on browsers that reject it. The build script reads these values and injects them into `dist/manifest.json`, keeping sensitive values outside the repo.

## Architecture (ASCII)

```
╭──────────────────────────────╮
│  Content Script              │
│  - Canvas overlay (pen, etc) │
│  - Rectangle → DOM Range     │
│  - Messaging bridge          │
╰──────────────┬───────────────╯
               │
               ▼
╭──────────────────────────────╮
│  Background Service Worker   │
│  - Summarizer / Prompt API   │
│  - Cloud fallback (Gemini)   │
│  - Download + availability   │
│  - IndexedDB persistence     │
╰──────┬───────────┬───────────╯
       │           │
       │           │
╭──────▼──────╮ ╭──▼──────────╮
│ Side Panel  │ │ Action Popup│
│ React +     │ │ Quick toggles│
│ Tailwind UI │ │ & settings   │
╰─────────────╯ ╰──────────────╯
```

## Built-in AI API snippets

### Summarizer API (feature detection, download monitor, run)

```ts
if ('Summarizer' in self) {
  const availability = await Summarizer.availability();
  if (availability.availability !== 'unavailable') {
    const summarizer = await Summarizer.create({
      monitor(event, info) {
        if (event === 'downloadprogress') {
          console.log(`Summarizer download: ${info.completed}/${info.total ?? '?'}`);
        }
      }
    });
    const result = await summarizer.summarize({ text: selection });
    const summary = typeof result === 'string' ? result : result.summary;
    console.log(summary);
  }
}
```

### Prompt API (session after user gesture, prompt call)

```ts
if ('LanguageModel' in self) {
  const availability = await LanguageModel.availability();
  if (availability.availability !== 'unavailable') {
    const session = await LanguageModel.create({
      monitor(event, info) {
        if (event === 'downloadprogress') {
          console.info('Prompt model downloading', info);
        }
      }
    });
    const reply = await session.prompt([
      { role: 'system', content: 'You are a friendly summarizer.' },
      { role: 'user', content: selection }
    ]);
    const output = typeof reply === 'string' ? reply : reply.output;
    console.log(output);
  }
}
```

### Writer API (origin-trial protected)

```ts
if ('Writer' in self) {
  const availability = await Writer.availability();
  if (availability.availability !== 'unavailable') {
    const writer = await Writer.create({
      monitor(event, info) {
        if (event === 'downloadprogress') {
          console.log('Writer download progress', info);
        }
      }
    });
    const draft = await writer.write({ prompt: 'Draft a design note about Scribbly.' });
    const output = typeof draft === 'string' ? draft : draft.output;
    console.log(output);
  }
}
```

> Tip: Watch `chrome://on-device-internals` to inspect download state. Scribbly exposes the same statuses (`unavailable → downloadable → downloading → available`) in the side panel.

## Project structure

- `extension/background/service-worker.ts` — message bus, availability checks, on-device vs. cloud routing
- `extension/content/canvas-overlay.ts` — drawing overlay, rectangle text extraction, messaging
- `extension/sidepanel/` — React + Tailwind UI with collapse/expand, summaries, exports, settings
- `extension/ai/` — wrappers around `Summarizer`, `LanguageModel`, `Writer`, `Rewriter`
- `extension/storage/db.ts` — IndexedDB (`idb`) for drawings and summaries, `chrome.storage.local` helper for settings
- `extension/popup/` — quick toggles for overlay and default mode
- `demo/page/index.html` — standalone page to validate overlay tools
- `tests/` — Vitest unit coverage and Playwright e2e smoke test

## Development

```bash
npm install
npm run dev
```

- `npm run dev` launches Vite for the side panel UI. Load the extension from `extension/` during development and use `npm run build` for a production bundle in `dist/`.
- `npm run build` runs TypeScript compilation, Vite bundling, and copies manifest/static assets.
- `npm run icons` regenerates the MV3 icon set from `extension/assets/scribbly-logo.png` if you update the brand artwork.
- `npm run test:unit` uses Vitest with `happy-dom`.
- `npm run test:e2e` runs Playwright against the demo page.
- `npm run lint` / `npm run typecheck` enforce code quality. CI runs lint → typecheck → build → tests.

### Loading the extension

1. Run `npm run build`.
2. Visit `chrome://extensions`, enable *Developer mode*.
3. Click *Load unpacked* and choose the `dist/` directory.
4. Try the overlay on the included `demo/page/index.html` or any webpage.

### Cloud fallback (opt-in)

- Open the popup, switch to **Cloud (opt-in)**, and paste a Gemini or Firebase Genkit API key.
- The background worker routes summaries through `https://generativelanguage.googleapis.com/...` only in this mode.
- Toggle back to **On-device** to disable network calls entirely.

### Privacy notes

- Drawings & summaries stay in IndexedDB (`scribbly` database) per origin.
- Settings live in `chrome.storage.local` and never leave the device.
- On-device AI is the default. Cloud mode is clearly labeled in the UI and each summary stores the mode used.

## Quickstart

1. `npm install`
2. `npm run build`
3. Load `dist/` at `chrome://extensions`
4. Enable required Canary flags (`optimization-guide-on-device-model`, writer-origin flags if needed)
5. Highlight some text, draw a rectangle, and open the Scribbly side panel to view summaries

## Client-side AI justification

Scribbly defaults to Chrome’s on-device models so page content never leaves your machine during summarization. Model downloads are transparent, progress is surfaced (`monitor('downloadprogress')`), and storage never escapes IndexedDB / `chrome.storage.local`. Cloud mode exists only for users who explicitly supply their own API key, keeping privacy-first behavior the baseline.
