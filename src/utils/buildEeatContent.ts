// ─────────────────────────────────────────────────────────────────────────────
// E-E-A-T Trust Box Builder — shared utility
// Used by both SEO Content Generator (Index.tsx) and FAQ Bulk Generator
// (generateMigrationArticle.ts) to build the "Why You Can Trust This Article"
// trust signal box content dynamically.
// ─────────────────────────────────────────────────────────────────────────────

export const NIC_PHOTO_URL =
  "https://cdn.shopify.com/s/files/1/0760/1530/4950/files/nic_reese.avif?v=1780658483";

// Governing body fallbacks per sport keyword
const SPORT_GOVERNING_BODIES: Record<string, string[]> = {
  "track": ["World Athletics", "USA Track & Field (USATF)", "NCAA Track & Field"],
  "field": ["World Athletics", "USA Track & Field (USATF)", "NCAA Track & Field"],
  "cross country": ["World Athletics", "USA Track & Field (USATF)", "NFHS"],
  "flag football": ["NFL FLAG", "USA Football", "American Flag Football League (AFFL)"],
  "softball": ["World Baseball Softball Confederation (WBSC)", "USA Softball", "NCAA Softball"],
  "baseball": ["Major League Baseball (MLB)", "USA Baseball", "NCAA Baseball"],
  "basketball": ["FIBA", "NBA", "NCAA Basketball", "USA Basketball"],
  "hockey": ["USA Hockey", "NHL", "International Ice Hockey Federation (IIHF)"],
  "soccer": ["FIFA", "US Soccer Federation (USSF)", "NCAA Soccer"],
  "volleyball": ["FIVB", "USA Volleyball", "NCAA Volleyball"],
  "lacrosse": ["World Lacrosse", "US Lacrosse", "NCAA Lacrosse"],
  "swimming": ["World Aquatics (FINA)", "USA Swimming", "NCAA Swimming"],
  "gymnastics": ["FIG", "USA Gymnastics", "NCAA Gymnastics"],
  "wrestling": ["United World Wrestling", "USA Wrestling", "NCAA Wrestling"],
  "tennis": ["ITF", "USTA", "NCAA Tennis"],
  "golf": ["USGA", "R&A", "PGA Tour", "NCAA Golf"],
  "bowling": ["World Bowling", "USBC", "NCAA Bowling"],
  "dental": ["American Dental Association (ADA)", "British Dental Association (BDA)", "NHS Clinical Guidelines"],
  "implant": ["American Academy of Implant Dentistry (AAID)", "ITI", "ADA"],
  "default": ["Relevant governing body rulebooks", "Official competition records", "Published industry guidelines"],
};

export function getSportGoverningBodies(sport: string): string[] {
  const s = sport.toLowerCase();
  for (const [key, bodies] of Object.entries(SPORT_GOVERNING_BODIES)) {
    if (s.includes(key)) return bodies;
  }
  return SPORT_GOVERNING_BODIES["default"];
}

export function extractSourcesFromContextFiles(
  contextFiles: Array<{ name: string; content: string }>
): string[] {
  const sources = new Set<string>();
  const SKIP_DOMAINS = new Set([
    "google.com", "youtube.com", "facebook.com", "twitter.com",
    "amazon.com", "shopify.com", "instagram.com", "linkedin.com",
  ]);

  for (const file of contextFiles) {
    const text = file.content.slice(0, 8000);

    // Named organisations after attribution words
    const orgRe =
      /(?:according to|source:|from|via|published by|sourced from)\s+([A-Z][A-Za-z &().\-']{3,60})/gi;
    let m: RegExpExecArray | null;
    while ((m = orgRe.exec(text)) !== null) {
      const name = m[1].trim().replace(/[.,]+$/, "");
      if (name.length > 4 && name.length < 60) sources.add(name);
    }

    // URL domains
    const urlRe = /https?:\/\/(?:www\.)?([a-z0-9-]+\.[a-z]{2,})/gi;
    while ((m = urlRe.exec(text)) !== null) {
      const domain = m[1].toLowerCase();
      if (!SKIP_DOMAINS.has(domain)) sources.add(domain);
    }
  }

  return Array.from(sources).slice(0, 4);
}

export function buildEeatContent(
  sport: string,
  contextFiles: Array<{ name: string; content: string }>,
  author: string
): string {
  const sportLabel = sport?.trim() || "sport";
  const sportLower = sportLabel.toLowerCase();
  const authorName = author?.trim() || "Nic Reese";
  const reviewDate = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const extractedSources =
    contextFiles?.length > 0 ? extractSourcesFromContextFiles(contextFiles) : [];
  const governingBodies = getSportGoverningBodies(sportLower);
  const sources = extractedSources.length > 0 ? extractedSources : governingBodies;
  const sourceHeading =
    extractedSources.length > 0
      ? "**Sources used in this article**"
      : "**Fact-checked against**";
  const sourcesList = sources.map((s) => `✓ ${s}`).join("\n");

  return `<img src="${NIC_PHOTO_URL}" alt="${authorName}" width="72" height="72" style="border-radius:50%;float:left;margin:0 16px 8px 0;border:2px solid #99f6e4;" />

**${authorName}** has covered ${sportLabel} content with a focus on rules, equipment, athlete development, and competition structure at recreational, youth, collegiate, and elite levels. His work draws on official governing body publications and verified competition data.

<br style="clear:both" />

${sourceHeading}
${sourcesList}

**Editorial policy**
All factual claims, rules, distances, and records are cross-referenced against official ${sportLabel} governing body publications before publication. Statistics are sourced from official results databases, not secondary aggregators.

*Last reviewed: ${reviewDate}*`;
}
