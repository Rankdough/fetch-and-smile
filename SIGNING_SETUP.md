# Document signing: setup

Routes: `/sign` (list), `/sign/new` (upload and place boxes), `/sign/:id` (detail), `/sign/s/:token` (recipient, no login).

## One-off setup

1. Apply the migration `supabase/migrations/20261018160000_document_signing.sql`. It creates `sign_documents`, `sign_fields`, `sign_tokens`, the private `sign-docs` bucket and owner-only policies.
2. Deploy the edge functions `sign-send` and `sign-public`.
3. Set these Supabase function secrets:

| Secret | Value |
| --- | --- |
| `RESEND_API_KEY` | Resend API key |
| `SIGN_FROM_EMAIL` | Verified sender, e.g. `Rankdough <sign@rankdough.com>` |
| `APP_URL` | Public base URL of this app, no trailing slash |
| `OWNER_EMAIL` | Optional. Defaults to `info@rankdough.com` |

4. Supabase Auth, URL configuration: add `<APP_URL>/sign` to the redirect URLs.
5. Open `/sign`, request the login link once, then switch off public sign-ups in Supabase Auth. Other accounts are blocked by row-level security and by both edge functions either way.

If you change the owner address, change it in three places: `is_sign_owner()` in the migration, `OWNER_EMAIL` (secret), and `OWNER_EMAIL` in `src/lib/sign/db.ts`.

## How it works

- The owner places boxes as fractions of each page. The owner signature is stored with the field.
- `sign-send` stores only the SHA-256 hash of a 256-bit token and emails the link. Links last 14 days and work once. A reminder replaces the old link.
- `sign-public` claims the token atomically, checks the original file hash, draws signatures and dates into the PDF with pdf-lib, appends a certificate page (IP, browser, timestamps, original hash), stores the result and emails the signed copy to both parties.
- Rotated pages and crop boxes are handled. `src/test/signPdf.test.ts` checks placement at 0, 90, 180 and 270 degrees.
