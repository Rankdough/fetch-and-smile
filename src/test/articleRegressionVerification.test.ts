import { describe, expect, it } from "vitest";
import { markdownToStyledHtml } from "@/utils/markdownToStyledHtml";

function extractMarkdownTables(markdown: string): string[][] {
  const lines = markdown.split("\n");
  const tables: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.includes("|")) {
      current.push(line.trim());
      continue;
    }

    if (current.length) {
      tables.push(current);
      current = [];
    }
  }

  if (current.length) tables.push(current);
  return tables;
}

function countDataRows(tableLines: string[]): number {
  if (tableLines.length < 2) return 0;
  return Math.max(0, tableLines.length - 2);
}

describe("article regression verification", () => {
  it("renders visible body-section Sources links while keeping final References clickable", () => {
    const markdown = `# Dental Implants on the NHS: Can I Get Them?

Direct answer opening paragraph.

## TL;DR

Dental implants are only funded on the NHS in narrow clinical circumstances.

**Sources:**
- [NHS dental services explained](https://www.nhs.uk/nhs-services/dentists/what-dental-services-are-available-on-the-nhs/)

## Quick Tips

> Move fast if hospital dentistry is involved.

> Ask for the written funding reason.

> Get a private quote for comparison.

**Sources:**
- [NICE guidance overview](https://www.nice.org.uk/)

## What makes someone eligible?

Eligibility is usually limited to major trauma, cancer surgery, or congenital absence.

- Funding follows strict clinical need.
- Local commissioning rules still matter.
- Private care is common when criteria are not met.

**Sources:**
- [NHS England commissioning](https://www.england.nhs.uk/)

## References:

- [NHS dental services explained](https://www.nhs.uk/nhs-services/dentists/what-dental-services-are-available-on-the-nhs/)
- [NHS England commissioning](https://www.england.nhs.uk/)
`;

    const html = markdownToStyledHtml(markdown);

    expect(html).toContain("Sources:");
    expect(html).toContain("References:");
    expect(html).toContain('href="https://www.nhs.uk/nhs-services/dentists/what-dental-services-are-available-on-the-nhs/"');
    expect(html).toContain('href="https://www.england.nhs.uk/"');
  });

  it("removes bold formatting from rendered article content", () => {
    const markdown = `# Dental Implants on the NHS

## TL;DR

**Dental implants** are not routinely available.

## Quick Tips

> **Always ask** for the written criteria.

## References:

- [NHS](https://www.nhs.uk/)
`;

    const html = markdownToStyledHtml(markdown);

    expect(html).not.toContain("<strong");
    expect(html).not.toContain("<b>");
    expect(html).toContain("Dental implants are not routinely available.");
    expect(html).toContain("Always ask for the written criteria.");
  });

  it("fails single-row table regressions by requiring at least two data rows for any kept markdown table", () => {
    const markdown = `# Dental Implants on the NHS

## What affects NHS approval?

Eligibility depends on clinical need.

| Factor | Typical NHS stance | Why it matters |
| --- | --- | --- |
| Major trauma | Often considered | Restores essential function |
| Congenital absence | Sometimes considered | Long-term developmental impact |

## References:

- [NHS](https://www.nhs.uk/)
`;

    const tables = extractMarkdownTables(markdown);

    expect(tables).toHaveLength(1);
    expect(countDataRows(tables[0])).toBeGreaterThanOrEqual(2);
  });

  it("detects the live generator rule that requires inline Sources for body sections", async () => {
    const moduleText = await import("fs/promises").then((fs) =>
      fs.readFile("supabase/functions/generate-content/index.ts", "utf8"),
    );

    expect(moduleText).toMatch(/Every eligible body H2 must end with a visible "\*\*Sources:\*\*" block/i);
    expect(moduleText).toMatch(/Add a "\*\*Sources:\*\*" line at the END of EACH body H2 section/i);
  });
});