# Multi-product search (v0.9.0 plan)

Owner's goal: "make search easier, where the user is able to easily view multiple products at once."

This plan came out of a three-agent review on 2026-10-30. The researcher and backend agents were GPT-6.1 Sol (high) and the frontend agent was Claude Sonnet. Claude (lead) made the final calls. Branch: `feat/multi-search`. A release needs the owner's explicit go-ahead.

## What the user gets

1. They type or paste several products into the normal search box: `lays, maggi, amul butter`. A comma or a newline turns each term into a chip, and the button reads **Compare 3**.
2. One term with no comma works exactly as before. Nothing changes for the common case.
3. The limit is 5 distinct terms. Blanks and duplicates (any letter case) are dropped. Extra terms are refused with a caption, never silently cut.
4. Results show:
   - a **best price per product** summary card first. It has one row per term: the top pick, its size, price and app mark, and a state. Tapping a row jumps to that section.
   - one section per term below it. Each section has a sticky header with the term, state and best price, 2 full `ProductCard`s, and **More matches (n)**, which expands in place up to 8.
5. Section states: **Queued** (Remove), **Searching** (`LiveDot`, "3 of 6 apps"), **Done** ("n products · 2.1 s"), **Empty**, **Failed** (Retry) and **Stopped**. One **Stop** button stops the whole batch. Sections that already finished are kept.
6. Changing the location, account or Instamart address makes the batch **stale**. A banner reads "Location changed · Search again", prices are dimmed, and Add, Save and Compare are disabled. Nothing re-runs by itself.

## Decisions

| Topic | Decision |
|---|---|
| Single vs batch | **Separate `batch` state slice.** The single-search path (`search`, `submitted`, `groups`, `statuses`) is untouched. Starting either kind of search cancels the other. |
| Provenance | `SourceRef = { batchId, queryId }` travels on the compare and save routes and on cart and list actions. A sourced lookup resolves only that exact section, with **no fallback** to another section or `lastCartGroups`. A missing or stale source shows an expired state. Unsourced routes behave as today. Cart and list items persist the section's **query text** (they already have a `query` field), never batch ids. |
| Pacing | Sections run **one at a time**, with the six apps in parallel inside each. There is a cancellable **2 s gap** after a section that did network work; cache hits skip it. Each section attempt gets its own `AbortController`. Every callback is guarded by batch, section, attempt and context generation, because native work can finish after an abort. |
| Done vs failed | **Done** means at least one app answered, even with zero matches (that shows as Empty). **Failed** means no app answered. |
| Retry | Clears that section and runs it again with a new attempt id. |

## Follow-ups (not in v0.9.0)

- A shared query scheduler that also covers `refreshCart` and list refresh (`core/cart.ts` still fans out with `Promise.all`) and connection probes.
- Blinkit: origin-queue wait eats into its search timeout (`core/adapters/blinkit.ts`, `core/session-turn.ts`).
- Per-section Stop and Resume, and keeping batches across restarts.
- Moving the search box onto the shared `SearchHeader` once `feat/food-compare` merges.
- Android multiline paste, if a device test shows newlines turning into spaces. Commas always work.

## Files

| Owner | Files |
|---|---|
| Backend | new `core/search-batch.ts` (`parseTerms`, batch types, reducer helpers, `rankGroups`) and `core/search-batch.test.ts`; `state/store.tsx` (batch slice and actions, source-aware `groupByKey`, `addToCart`, `toggleSaved`, `createList`, context version on location, account and address changes) |
| Frontend | new `ui/TermsInput.tsx` and `ui/BatchResults.tsx`; `app/(tabs)/index.tsx` (one input hunk and one `if (s.batch)` branch); `ui/ProductCard.tsx` (a `source` prop and a fixed memo comparator); `app/product/[key].tsx` and `app/save/[key].tsx` (route params and the expired state) |

## Acceptance (browser preview, `npm run export:web`, sample data)

- `lays, maggi` and a pasted newline list each give two sections. Blanks and duplicates disappear, and a sixth term is refused with a message.
- All products are visible at once in the summary card. Expanding one section leaves the others as they were.
- Compare, Save and Add work from either section, and coming back keeps the results.
- Every price names its app, and the sample-data label stays.
- Stop or Remove means late results never reappear. A location change never mixes locations.
- Checked at 390 px and 360 px wide, in light and dark.
- `npm run lint && npm run typecheck && npm test` pass, the Android CI emulator test passes, and the screenshots are shown to the owner before a PR or release.
