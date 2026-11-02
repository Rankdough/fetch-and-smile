# Run the existing keyword app from this repository

Run from the repository root with Python 3 (no extra packages):

```sh
python scripts/run-keyword-research.py research-inputs/best-student-halls.json /tmp/bsh-keyword-run
```

The runner calls the deployed `scan-website-keywords` and `generate-keyword-universe` functions using the same endpoint URLs, publishable key, request fields and manual-seed normalisation as `src/pages/KeywordResearch.tsx`. It does not ask the Lovable builder to generate or edit code. Firecrawl and AI service usage still applies.

Supply `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` through the environment or the existing root `.env`. Never commit secrets or a service-role key.

The output directory contains scan responses, the complete generation request, raw generation response and `semantic-map.csv` in the app's Cluster/Type/Item format. No research rows are inserted or updated in the app database. A completed scan checkpoint is reused when repeating a generation in the same output directory; use a new directory for a fresh scan.

The Best Student Halls input reproduces the observed form: the same topic, audience, UK/Ireland/Australia scope, three scan sites and 81 manual seeds. It intentionally includes brands and non-UK markets for comparison with the supplied export. Generated keywords have no measured search volumes.

Repeating the workflow does not guarantee identical output: live scans change, concurrent scans can return in a different order, and model generation varies. The first repository validation run sorted scanned terms; subsequent runs preserve their first-seen order. Compare both counts and phrases, not just totals. Refinement is a separate step and is not run by this script because the supplied reference export was from the initial generation.
