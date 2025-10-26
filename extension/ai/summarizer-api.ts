/**
 * Summarizes text using Chrome's built-in Summarizer API (Gemini Nano).
 * - Type: key-points
 * - Length: medium
 * - Format: markdown
 */

type ChromeSummarizer = {
  summarize: (text: string, options: { context: string }) => Promise<string>;
};

let summarizerPromise: Promise<ChromeSummarizer> | null = null;

async function getSummarizer(): Promise<ChromeSummarizer> {
  if (!('Summarizer' in self)) {
    throw new Error('Summarizer API not supported in this browser.');
  }

  if (!summarizerPromise) {
    summarizerPromise = (async () => {
      const availability = await (self as any).Summarizer.availability();
      if (availability === 'unavailable') {
        throw new Error('Summarizer model unavailable.');
      }

      return (self as any).Summarizer.create({
        type: 'key-points',
        format: 'markdown',
        length: 'medium',
        monitor(monitor: any) {
          monitor.addEventListener('downloadprogress', (e: any) => {
            console.info(`[scribbly] Summarizer download ${(e.loaded * 100).toFixed(1)}%`);
          });
        },
      });
    })();

    summarizerPromise.catch(() => {
      summarizerPromise = null;
    });
  }

  return summarizerPromise;
}

export async function summarizeText(text: string): Promise<string> {
  const summarizer = await getSummarizer();
  return summarizer.summarize(text, {
    context: 'Summarize this text into key bullet points for readability.',
  });
}
