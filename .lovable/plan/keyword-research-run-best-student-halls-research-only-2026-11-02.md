# Keyword research run: Best Student Halls (research only)

Plan mode can't call the live functions, so nothing has run yet. When you approve this plan, I'll run the steps below and report the real responses. I checked all three functions: none of them write to the database, so this run won't overwrite any saved research.

## Steps (existing deployed functions, no code or config changes)
1. **scan-website-keywords** with `{ url: "https://www.beststudenthalls.com/" }`. I'll record the scan counts, the terms it pulls from the site and any errors.
2. **generate-keyword-universe** with:
   - topic: "Private student accommodation in the UK"
   - country: "United Kingdom"
   - language: "English (UK)"
   - audience: your audience text, word for word
   - websiteTerms: the terms step 1 actually returned, unedited
3. **refine-keyword-universe** in `suggest_modifiers` mode, using the topic, definition and clusters from step 2.
4. **refine-keyword-universe** in `expand` mode, using the suggested dimensions that fit your scope: room types, budget, booking conditions, international, postgraduate/mature, accessibility, arrival/moving, location/commute. I'll leave out brand searches and lifestyle topics. I'll list which dimensions I chose and why.

## What you'll get back in chat
- Scan counts and the list of terms pulled from the site
- Every seed keyword and question, grouped by cluster, first from the generated set and then from the expanded set
- The modifier suggestions, with the ones I used marked
- Any errors, quoted exactly as returned
- No search volumes: these are generated candidates only. No secrets shown.

If a step fails, I'll stop and report it. I won't fill in made-up results.
