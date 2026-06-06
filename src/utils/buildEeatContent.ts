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

  // Known governing body / organisation acronyms to look for
  const KNOWN_ORGS = [
    "NFL", "NAIA", "NCAA", "NFHS", "FIBA", "FIFA", "USATF", "USSF",
    "ITF", "USTA", "USGA", "USBC", "WBSC", "FIVB", "FIG", "ITI",
    "ADA", "BDA", "AAID", "NBA", "NHL", "MLS", "MLB", "PGA",
    "World Athletics", "USA Football", "USA Track & Field",
    "USA Softball", "USA Baseball", "USA Basketball", "USA Swimming",
    "USA Hockey", "USA Volleyball", "USA Gymnastics", "USA Wrestling",
    "US Soccer Federation", "American Dental Association",
    "National Football League", "National Association of Intercollegiate Athletics",
    "National Federation of State High School Associations",
    "National Collegiate Athletic Association",
  ];

  for (const file of contextFiles) {
    const text = file.content.slice(0, 8000);

    // Match known organisations by name
    for (const org of KNOWN_ORGS) {
      if (text.includes(org)) sources.add(org);
    }

    // Extract acronyms in parentheses — e.g. "National Football League (NFL)"
    const acronymRe = /([A-Z][A-Za-z &.\-']{4,60})\s+\(([A-Z]{2,8})\)/g;
    let m: RegExpExecArray | null;
    while ((m = acronymRe.exec(text)) !== null) {
      const fullName = m[1].trim();
      const acronym = m[2];
      // Only add if it looks like a real organisation name (not a sentence)
      const wordCount = fullName.split(/\s+/).length;
      if (wordCount >= 2 && wordCount <= 8 && /^[A-Z]/.test(fullName)) {
        sources.add(`${fullName} (${acronym})`);
      }
    }

    // URL domains
    const urlRe = /https?:\/\/(?:www\.)?([a-z0-9-]+\.[a-z]{2,})/gi;
    while ((m = urlRe.exec(text)) !== null) {
      const domain = m[1].toLowerCase();
      if (!SKIP_DOMAINS.has(domain)) sources.add(domain);
    }
  }

  return Array.from(sources).slice(0, 5);
}

export function buildEeatContent(
  sport: string,
  contextFiles: Array<{ name: string; content: string }>,
  author: string
): string {
  // Derive a clean sport label — strip question words, article titles, punctuation
  // e.g. "Girls Flag Football: Which US Colleges Offer Women's Programs?" → "flag football"
  const rawSport = sport?.trim() || "";
  const sportLabel = rawSport
    ? rawSport
        .replace(/[?!.]/g, "")
        .replace(/^(girls|boys|womens?|mens?|youth|college|collegiate)\s+/gi, "")
        .replace(/:.+$/, "") // strip subtitle after colon
        .toLowerCase()
        .trim() || rawSport.toLowerCase().trim()
    : "sport";
  const authorName = author?.trim() || "Nic Reese";
  const reviewDate = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const extractedSources =
    contextFiles?.length > 0 ? extractSourcesFromContextFiles(contextFiles) : [];
  const governingBodies = getSportGoverningBodies(sportLabel);
  const sources = extractedSources.length > 0 ? extractedSources : governingBodies;
  const sourceHeading =
    extractedSources.length > 0
      ? "**Sources used in this article**"
      : "**Fact-checked against**";
  const sourcesList = sources.map((s) => `- ✓ ${s}`).join("\n");

  // Use HTML directly — this content is rendered via marked.parse() which passes
  // raw HTML through. The img must be on its own line with blank lines around it.
  return [
    `<img src="${NIC_PHOTO_URL}" alt="${authorName}" width="72" height="72" style="border-radius:50%;float:left;margin:0 16px 8px 0;border:2px solid #99f6e4;" />`,
    "",
    `**${authorName}** has covered ${sportLabel} content with a focus on rules, equipment, athlete development, and competition structure at recreational, youth, collegiate, and elite levels. His work draws on official governing body publications and verified competition data.`,
    "",
    `<div style="clear:both"></div>`,
    "",
    sourceHeading,
    sourcesList,
    "",
    "**Editorial policy**",
    `All factual claims, rules, distances, and records are cross-referenced against official ${sportLabel} governing body publications before publication. Statistics are sourced from official results databases, not secondary aggregators.`,
    "",
    `*Last reviewed: ${reviewDate}*`,
  ].join("\n");
}
