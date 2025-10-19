import { beforeEach, describe, expect, it } from 'vitest';

import type { CapabilitySnapshot, SummaryRecord } from '@common/messages';
import { handleRuntimeMessage, useScribblyStore } from '../../extension/sidepanel/src/state';

const sampleCapabilities: CapabilitySnapshot = {
  summarizer: { status: 'available' },
  prompt: { status: 'downloadable', reason: 'Requires download' },
  writer: { status: 'unavailable', reason: 'Disabled' },
  rewriter: { status: 'unavailable', reason: 'Disabled' }
};

const sampleSummary: SummaryRecord = {
  id: 'summary-1',
  requestId: 'request-1',
  source: 'selection',
  text: 'Original text',
  summary: 'Summarized text',
  createdAt: Date.now(),
  url: 'https://example.com',
  title: 'Example',
  status: 'completed',
  mode: 'on-device'
};

beforeEach(() => {
  useScribblyStore.setState({
    summaries: [],
    activeSummaryId: null,
    capabilities: sampleCapabilities,
    collapsed: false,
    settings: {
      mode: 'on-device',
      autoOpenSidePanel: true,
      enableWriter: false,
      cloudApiKey: undefined
    }
  });
});

describe('Scribbly store', () => {
  it('adds summaries when messages arrive', () => {
    handleRuntimeMessage({ type: 'scribbly:summary-ready', summary: sampleSummary });
    const { summaries, activeSummaryId } = useScribblyStore.getState();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject(sampleSummary);
    expect(activeSummaryId).toBe(sampleSummary.id);
  });

  it('updates capability snapshot', () => {
    const patch: CapabilitySnapshot = {
      summarizer: { status: 'downloading', completed: 10, total: 100 },
      prompt: { status: 'available' },
      writer: { status: 'unavailable', reason: 'Disabled' },
      rewriter: { status: 'unavailable', reason: 'Disabled' }
    };

    handleRuntimeMessage({ type: 'scribbly:availability', capabilities: patch });
    const { capabilities } = useScribblyStore.getState();
    expect(capabilities.summarizer.status).toBe('downloading');
    expect(capabilities.prompt.status).toBe('available');
  });
});
