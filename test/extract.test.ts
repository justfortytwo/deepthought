import { describe, it, expect } from 'vitest';
import { createSalienceExtractor, type LlmClient, type Turn } from '../src/index.js';

/** A fake model: returns a canned completion, ignores the prompt. */
function fakeLlm(reply: string): LlmClient {
  return { complete: async () => reply };
}
const json = (v: unknown) => JSON.stringify(v);

const turn: Turn = { text: 'I moved to Lisbon last week.', source: 'owner', observed: 'stated', date: '2026-06-01' };

describe('extractSalient — parse + score + filter', () => {
  it('parses a JSON array and stamps the turn provenance onto candidates', async () => {
    const llm = fakeLlm(json([{ content: 'The owner lives in Lisbon', salience: 0.9 }]));
    const out = await createSalienceExtractor(llm).extractSalient(turn);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      content: 'The owner lives in Lisbon', salience: 0.9, source: 'owner', observed: 'stated', date: '2026-06-01',
    });
  });

  it('lets a candidate override provenance, and falls back to defaultObserved when unclassified', async () => {
    const bare: Turn = { text: 'whatever' };
    const llm = fakeLlm(json([
      { content: 'A', salience: 0.7, source: 'web', observed: 'imported' },
      { content: 'B', salience: 0.7 },
    ]));
    const out = await createSalienceExtractor(llm).extractSalient(bare, { defaultObserved: 'inferred' });
    expect(out.find((c) => c.content === 'A')).toMatchObject({ source: 'web', observed: 'imported' });
    expect(out.find((c) => c.content === 'B')).toMatchObject({ observed: 'inferred' });
  });

  it('clamps salience to [0,1] and skips items with no content or non-numeric salience', async () => {
    const llm = fakeLlm(json([
      { content: 'high', salience: 1.5 },
      { content: 'low', salience: -0.2 },
      { content: '', salience: 0.9 },          // no content -> skip
      { content: 'bad', salience: 'x' },        // non-numeric -> skip
      { salience: 0.9 },                        // missing content -> skip
    ]));
    const out = await createSalienceExtractor(llm).extractSalient(turn);
    expect(out.map((c) => c.content).sort()).toEqual(['high', 'low']);
    expect(out.find((c) => c.content === 'high')!.salience).toBe(1);
    expect(out.find((c) => c.content === 'low')!.salience).toBe(0);
  });

  it('drops candidates below minSalience', async () => {
    const llm = fakeLlm(json([{ content: 'keep', salience: 0.8 }, { content: 'drop', salience: 0.3 }]));
    const out = await createSalienceExtractor(llm).extractSalient(turn, { minSalience: 0.5 });
    expect(out.map((c) => c.content)).toEqual(['keep']);
  });

  it('sorts by salience descending and caps to maxCandidates', async () => {
    const llm = fakeLlm(json([
      { content: 'mid', salience: 0.5 }, { content: 'top', salience: 0.95 }, { content: 'bot', salience: 0.1 },
    ]));
    const out = await createSalienceExtractor(llm).extractSalient(turn, { maxCandidates: 2 });
    expect(out.map((c) => c.content)).toEqual(['top', 'mid']);
  });

  it('tolerates a fenced / prose-wrapped JSON array', async () => {
    const llm = fakeLlm('Here are the memories:\n```json\n[{"content":"X","salience":0.8}]\n```\nDone.');
    const out = await createSalienceExtractor(llm).extractSalient(turn);
    expect(out.map((c) => c.content)).toEqual(['X']);
  });

  it('returns [] when the model output has no parseable JSON array (no throw)', async () => {
    const llm = fakeLlm('I could not find anything worth remembering.');
    const out = await createSalienceExtractor(llm).extractSalient(turn);
    expect(out).toEqual([]);
  });

  it('passes through tags', async () => {
    const llm = fakeLlm(json([{ content: 'tagged', salience: 0.9, tags: ['loc', 'owner'] }]));
    const out = await createSalienceExtractor(llm).extractSalient(turn);
    expect(out[0].tags).toEqual(['loc', 'owner']);
  });
});
