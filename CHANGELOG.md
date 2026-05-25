# Changelog

## 2026-05-25 - Fix stale warnings references after revert cleanup

- **What:** Removed remaining `warnings` conditionals and the last `integrityWarnings` dependency left after source-guard cleanup.
- **Why:** The cleanup removed the warning state but left references that caused TypeScript compile errors.
- **Verified broken:** Temporary TypeScript compile failure from stale `warnings` references in `src/pages/Index.tsx`; fixed before delivery.
- **Files:** `src/pages/Index.tsx`, `src/components/ContentVerification.tsx`, `CHANGELOG.md`.
- **Verify:** `rg` confirms stale guard/warning strings are gone; `bunx vitest run src/test/example.test.ts` passes.

## 2026-05-25 - Remove stale source-guard revert leftovers

- **What:** Removed leftover source-integrity warning plumbing and source repair fallback behaviour from generation, section regeneration, and the editor wrapper. Kept the existing internal-link preservation logic unchanged.
- **Why:** The project revert did not clear all runtime/source-guard changes, and persisted editor state can make reverted code look unchanged in the preview.
- **Verified broken:** Nothing verified broken.
- **Files:** `src/pages/Index.tsx`, `src/components/ContentVerification.tsx`, `supabase/functions/generate-content/index.ts`, `supabase/functions/regenerate-section/index.ts`, `CHANGELOG.md`.
- **Verify:** Search for removed guard strings and run the focused test suite.
