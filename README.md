# @justfortytwo/deepthought

The **salience extraction** engine for [fortytwo](https://github.com/justfortytwo).
Given a conversational turn, it distils a small set of **atomic, self-contained
candidate memories**, each with a **salience score**, so the write-side
(`@justfortytwo/guide`'s enrichment loop) can dedupe, supersede, and persist only
what is worth keeping.

This is the piece a **memory server must not embed**: storing and recalling is
guide's job; deciding *what is worth remembering* is a model-driven judgement, and
that judgement lives here.

## Provider-agnostic by contract

deepthought defines the model seam (`LlmClient`) and ships a **stub**
`SalienceExtractor`; it **never hardcodes a provider**. There is no Ollama / OpenAI
/ Anthropic SDK import in this package and no credentials. The host injects a
concrete `LlmClient`, exactly mirroring how guide injects an `Embedder` rather than
owning a model client.

```ts
import {
  createSalienceExtractor,
  type LlmClient,
  type Candidate,
} from '@justfortytwo/deepthought';

// The host owns the model wiring; deepthought only needs text-in / text-out.
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
- `Candidate` — a distilled, scored memory. Its shape is aligned with guide's
  `EnrichmentCandidate`, so candidates flow straight into guide's `enrich()` with
  no remapping.
- `LlmClient` — the injected, minimal completion seam.
- `SalienceExtractor` — the extraction contract; `extractSalient(turn, opts)`
  returns scored `Candidate[]`.
- `ModelSalienceExtractor` / `createSalienceExtractor(llm)` — the reference
  implementation. The wiring is real; the model-output parsing is a `// TODO(impl):`
  stub so a host can fix a structured-output convention with its own client.

## How it fits

```
turn ──> @justfortytwo/deepthought (extract + score) ──> Candidate[]
                                                            │
                                                            ▼
                              @justfortytwo/guide.enrich (dedupe / supersede / write)
```

guide references deepthought from `src/enrichment.ts` (the salience step) and lists
it in `peerDependencies`. deepthought is a **pure npm engine** — it is not a Claude
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
