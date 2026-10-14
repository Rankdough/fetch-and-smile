# Rankdough Ticket Creator

Chrome extension (MV3). Creates a ticket in a Rankdough project from the current page.
Captures title, URL and selected text (or page excerpt), then guesses every field (priority, effort, team, tag, type, section, finding, why it matters, steps, evidence) and loads them in the audit-dashboard ticket layout. AI guess comes from the `suggest` action of the edge function, with rule-based fallback. Set `LOVABLE_API_KEY` for AI guesses.

## Setup
1. Set Supabase secrets: `EXTENSION_SHARED_SECRET`, `TICKETS_API_URL`, `TICKETS_API_TOKEN`.
2. Deploy: `supabase functions deploy create-ticket`.
3. `chrome://extensions` > Developer mode > Load unpacked > this folder.
4. Open Options. Paste the function URL and the shared secret.

The function expects `GET {TICKETS_API_URL}/projects` and `POST {TICKETS_API_URL}/tasks`. Adjust `supabase/functions/create-ticket/index.ts` if the ticket API differs.
