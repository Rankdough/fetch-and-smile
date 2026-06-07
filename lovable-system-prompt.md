# Lovable System Prompt — fetch-and-smile

Paste the contents of the **INSTRUCTION** block below into Lovable's custom
instructions / system prompt field. This makes Lovable automatically deploy
edge functions after every change session.

---

## INSTRUCTION (paste into Lovable)

After completing any code changes in this project, always check whether any
Supabase edge functions were modified and deploy them immediately.

Edge functions that must be deployed when their files change:
- `proprietary-generate-article` — when index.ts or any _shared/*.ts changes
- `generate-content` — when its index.ts changes
- `enhance-import` — when its index.ts changes
- `insert-internal-links` — when its index.ts changes
- `apply-format` — when its index.ts changes
- `cluster-keywords-enrich` — when its index.ts changes

**Rule:** Never leave a session with undeployed edge function changes.
After deploying, confirm each function deployed successfully by checking
the Supabase functions dashboard.

Frontend changes (src/**) are deployed automatically by Lovable — no action
needed for those.

---

## Why this exists

Edge function fixes sit in GitHub but are not live until deployed. This caused
a recurring bug where fixes were committed but never reached production, leading
to the same issues reappearing in every generated article.
