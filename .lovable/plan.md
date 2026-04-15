

# Information Gain Enhancement for Unique Angles

## What Changes

Update the `generate-unique-angles` edge function prompt to a two-step process:
1. First identify 3 "Information Gain Gaps" — knowledge the internet generally lacks on this topic
2. Then generate 3 unique angles that specifically target those gaps

Update the `UniqueAnglesPanel` UI to display the new `informationGainGap` field on each angle.

## Files to Edit

### 1. `supabase/functions/generate-unique-angles/index.ts`
- Update the system prompt to instruct the AI to first analyze what knowledge is commonly missing/over-published on the topic, then generate angles targeting those specific gaps
- Add `informationGainGap` field to the response JSON schema
- Update the response format to include a top-level `gaps` array (the 3 identified information gaps) alongside the `angles` array

### 2. `src/components/UniqueAnglesPanel.tsx`
- Update the `UniqueAngle` interface to include `informationGainGap: string`
- Display the information gain gap as a new field in the expanded angle details (alongside "Why it works" and "Example hook")
- Optionally show the top-level gaps summary above the angles list

## No Database Changes Required
The angles are generated on-the-fly and passed via state — no schema changes needed.

## No Other Files Affected
Gap analysis, content generation, tone profiles, and all other flows remain untouched.

