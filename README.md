# @justfortytwo/salience

The **salience extraction** engine for [fortytwo](https://github.com/justfortytwo).
Given a conversational turn, it distils a small set of **atomic, self-contained
candidate memories**, each with a **salience score**, so the write-side
(`@justfortytwo/memory`'s enrichment loop) can dedupe, supersede, and persist only
what is worth keeping.

This is the piece a **memory server must not embed**: storing and recalling is
memory's job; deciding *what is worth remembering* is a model-driven judgement, and
that judgement lives here.

## Install

```bash
npm install @justfortytwo/salience
```

**ESM-only**, requires **Node.js >= 18**. It has **zero runtime dependencies** —
pure TypeScript — so it drops into any host without dragging a provider SDK along.

## Works standalone

salience does **not** depend on `@justfortytwo/memory`. It is a
provider-agnostic library: you hand it an `LlmClient` and it returns scored
`Candidate[]`, end of story. memory is an **optional downstream sink** — memory
depends on salience (it lists it in `peerDependencies`), never the other way
round — so you can use salience à la carte without ever installing memory.

## Provider-agnostic by contract

salience defines the model seam (`LlmClient`) and ships the reference
`SalienceExtractor`; it **never hardcodes a provider**. There is no Ollama / OpenAI
/ Anthropic SDK import in this package and no credentials. The host injects a
concrete `LlmClient`, exactly mirroring how memory injects an `Embedder` rather than
owning a model client.

```ts
import {
  createSalienceExtractor,
  type LlmClient,
  type Candidate,
} from '@justfortytwo/salience';

// The host owns the model wiring; salience only needs text-in / text-out.
const llm: LlmClient = {
  async complete({ system, prompt }) {
    // call your model of choice here
    return '...';
  },
};

const extractor = createSalienceExtractor(llm);
const candidates: Candidate[] = await extractor.extractSalient({
  text: 'the deploy script lives at scripts/deploy.sh; we ship on Fridays',
  source: 'owner',
  observed: 'stated',
});
```

## Shape

- `Turn` — a conversational turn (free-form text + optional provenance).
- `Candidate` — a distilled, scored memory. Its shape is aligned with memory's
  `EnrichmentCandidate`, so candidates flow straight into memory's `enrich()` with
  no remapping.
- `LlmClient` — the injected, minimal completion seam.
- `SalienceExtractor` — the extraction contract; `extractSalient(turn, opts)`
  returns scored `Candidate[]`.
- `ModelSalienceExtractor` / `createSalienceExtractor(llm)` — the reference
  implementation: it frames the task, runs the injected client, then parses,
  scores, filters, and stamps provenance on the candidates (see *Output
  convention*).
- `SALIENCE_SYSTEM_PROMPT` — the exported system framing the reference extractor
  passes as `system`. It is a plain `const` you can read or override: build your
  own `LlmClient` (or a custom `SalienceExtractor`) around it when you want to
  tune the extraction policy without forking the package.

## Output convention

`extractSalient` expects the injected client's `complete()` to return a **JSON
array** of candidate objects:

```json
[{ "content": "the owner ships on Fridays", "salience": 0.9, "observed": "stated" }]
```

Each object needs `content` (non-empty) and `salience` (0–1); `source`,
`observed`, `date`, `tags`, and `meta` are optional. Parsing is **lenient and
fail-soft**: the array is extracted even from prose- or fence-wrapped output,
malformed items are skipped, `salience` is clamped to `[0,1]`, and unparseable
output yields `[]` (never a throw — one bad turn must not crash an enrichment
loop). Candidates inherit the turn's `source`/`observed`/`date` where the model
leaves them blank (`opts.defaultObserved` is the final fallback for `observed`).

`ExtractOptions` post-filters the result: `minSalience` drops low-confidence
candidates and `maxCandidates` caps the (salience-sorted) output.

## How it fits

```
turn ──> @justfortytwo/salience (extract + score) ──> Candidate[]
                                                            │
                                                            ▼
                              @justfortytwo/memory.enrich (dedupe / supersede / write)
```

memory references salience from `src/enrichment.ts` (the salience step) and lists
it in `peerDependencies`. salience is a **pure npm engine** — it is not a Claude
Code plugin and is not listed in the marketplace catalog.

## Development

```bash
npm run build   # tsc
npm test        # vitest run
```

## License

MIT (c) 2026 Enrico Deleo

---

Created and maintained by [**Enrico Deleo**](https://enricodeleo.com).
