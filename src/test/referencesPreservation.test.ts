import { describe, expect, it } from "vitest";
import { restoreTrailingReferencesSection, splitTrailingReferencesSection } from "../../supabase/functions/_shared/referencesSection";

describe("references preservation around post-processing", () => {
  it("splits a trailing References section cleanly from the article body", () => {
    const article = `# Title

## What is it?

Answer paragraph.

## References
- [NHS](https://www.nhs.uk/)
- [NICE](https://www.nice.org.uk/)`;

    const { body, references } = splitTrailingReferencesSection(article);

    expect(body).toContain("## What is it?");
    expect(body).not.toContain("## References");
    expect(references).toMatch(/^## References/m);
    expect(references).toContain("[NHS](https://www.nhs.uk/)");
  });

  it("restores the original References section after body-only rewriting", () => {
    const originalReferences = `## References
- [NHS](https://www.nhs.uk/)
- [NICE](https://www.nice.org.uk/)`;

    const rewrittenBody = `# Title

## What is it?

Updated answer with an internal link to [eligibility guidance](/eligibility).`;

    const restored = restoreTrailingReferencesSection(rewrittenBody, originalReferences);

    expect(restored).toContain("[eligibility guidance](/eligibility)");
    expect(restored).toContain("## References");
    expect(restored).toContain("[NHS](https://www.nhs.uk/)");
    expect(restored).toContain("[NICE](https://www.nice.org.uk/)");
  });

  it("replaces any AI-regenerated References block with the original one", () => {
    const originalReferences = `## References
- [PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11856067/)`;
    const aiOutput = `# Title

## Final Thoughts

Closing paragraph.

## References
- [Wrong](https://wrong.example.com/)`;

    const restored = restoreTrailingReferencesSection(aiOutput, originalReferences);

    expect(restored).toContain("[PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11856067/)");
    expect(restored).not.toContain("wrong.example.com");
  });
});