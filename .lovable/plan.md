

# Create Blended Tone Profile from V2 + V3 + Client Notes

## What We're Doing

Creating a custom tone of voice profile that blends V2's neutral, mature tone with V3's friendly character, adjusted for a 40+ adult audience. The profile will be inserted directly into the database and immediately available in Content Generator settings.

## Client Brief Summary

- **V3 pros**: Friendly, entertaining, has character
- **V3 cons**: Too GenZ, tries too hard with extreme comparisons
- **V2 pros/cons**: Neutral, no strong character either way
- **Target**: V2's maturity + a touch of V3's warmth, aimed at adults 40+
- **Constraint**: No mentions of other apps (Bumble For Friends, etc.)

## Steps

1. **Run AI synthesis script** — Feed both full articles plus the client's notes into the AI gateway, asking it to produce a blended tone profile JSON matching the `tone_profiles` table schema (summary, characteristics, example_phrases). The prompt will instruct the AI to:
   - Take V2 as the baseline tone
   - Add measured warmth and personality from V3
   - Strip any GenZ-leaning language patterns
   - Target 40+ adults: confident, relatable, warm but not trying too hard
   - Avoid forced metaphors and extreme comparisons

2. **Insert into database** — Write the resulting profile directly into the `tone_profiles` table with name like "Meet5 Brand Voice (40+ Audience)" so it appears in the Tone of Voice panel.

3. **Verify** — Confirm the profile is queryable and will show up in the UI.

## Technical Detail

- Uses the `lovable_ai.py` script with `--json` flag to get structured output
- Direct `psql` insert into `tone_profiles` table (or Supabase SDK via a small script)
- No changes to application code — the existing `ToneProfilePanel` will pick it up automatically

