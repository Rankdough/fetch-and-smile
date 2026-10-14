# Rankdough Ticket Creator

Chrome extension (MV3). Creates a ticket in a Rankdough project from the current page.
Captures title, URL and selected text (or page excerpt), then guesses every field (priority, effort, team, tag, type, section, finding, why it matters, steps, evidence) and loads them in the audit-dashboard ticket layout. AI guess comes from the `suggest` action of the edge function, with rule-based fallback. Set `LOVABLE_API_KEY` for AI guesses.

## Setup
1. Set Supabase secrets on the fetch-and-smile project: `EXTENSION_SHARED_SECRET`, `TICKETS_API_URL`, `TICKETS_API_TOKEN`.
2. Deploy: `supabase functions deploy create-ticket`.
3. `chrome://extensions` > Developer mode > Load unpacked > this folder.
4. Open Options. Paste the function URL and the shared secret.

The function calls the projects board MCP endpoint (easy-collab-spot, `.../functions/v1/mcp`). `TICKETS_API_URL` is that URL. `TICKETS_API_TOKEN` is a token made in the board under the Claude access dialog.
