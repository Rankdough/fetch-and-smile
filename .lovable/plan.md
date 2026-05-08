## Goal

When a generated article contains a URL that fails verification, replace it with the domain root (e.g. `https://website.com/broken-article` → `https://website.com/`) instead of unwrapping the link. This keeps attribution to the source while avoiding broken-link clicks.

## Current behaviour (`src/pages/ShopifyFaqBulk.tsx`, `runQaCheck`, lines ~423–490)

After generation, broken hrefs are detected via `verify-links`. The code then:
1. Builds candidate domain roots for each broken URL.
2. Re-verifies each domain root via `verify-links`.
3. **Only if the domain root is reachable** → replaces the href with the domain root.
4. **Otherwise** → unwraps the `<a>` tag, removing the link entirely and counting it as "still broken".

## Change

Simplify the repair flow so the domain root is always used as the fallback:

1. For every broken URL, compute its domain root (`protocol + hostname + /`).
2. If the domain root can be parsed, replace the `href` with the domain root unconditionally — skip the second `verify-links` round-trip on the domain.
3. Only unwrap the anchor when the URL cannot be parsed at all (malformed / not a URL).
4. Keep a single repair pass; update the row's `Body HTML` and the QA report:
   - If a URL was repaired to its domain → log it as "repaired to domain root", not as broken.
   - If a URL was unwrapped because it was unparseable → still report as broken/removed.
5. Leave the rest of `runQaCheck` (status calculation, toasts, issue list) intact, just adjusting the message wording so the user sees how many URLs were defaulted to domain.

## Files to edit

- `src/pages/ShopifyFaqBulk.tsx` — `runQaCheck` only. No edge-function or prompt changes; this is a pure post-processing / presentation-layer fix.

## Out of scope

- No changes to `generate-faq-article` / `generate-content` system prompts.
- No changes to internal-link allowlisting or the upstream URL-hallucination prevention; this plan is purely the safety net you asked for.
