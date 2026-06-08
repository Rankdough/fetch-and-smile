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

// Keywords that indicate a product/care topic rather than a sport topic
const PRODUCT_CARE_KEYWORDS = [
  "shrink", "shrinking", "wash", "washing", "dry", "drying", "care",
  "fabric", "material", "jersey care", "cleaning", "laundry", "heat",
  "transfer", "vinyl", "printing", "sublimation", "embroidery", "sizing",
  "fit", "customis", "customiz", "design", "colour", "color", "stitch",
];

const DENTAL_KEYWORDS = ["dental", "implant", "teeth", "tooth", "orthodont", "veneer", "crown"];

type TopicCategory = "sport" | "product-care" | "dental" | "general";

function categoriseTopic(sportLabel: string): TopicCategory {
  const s = sportLabel.toLowerCase();
  if (DENTAL_KEYWORDS.some((k) => s.includes(k))) return "dental";
  if (PRODUCT_CARE_KEYWORDS.some((k) => s.includes(k))) return "product-care";
  // Check if it matches a known sport key
  const sportKeys = Object.keys(SPORT_GOVERNING_BODIES).filter((k) => k !== "default");
  if (sportKeys.some((k) => s.includes(k))) return "sport";
  return "general";
}

function buildBioCopy(authorName: string, sportLabel: string, category: TopicCategory): string {
  const cap = sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1);
  switch (category) {
    case "product-care":
      return `${authorName} has covered ${cap} content with a focus on fabric technology, garment care, print and customisation methods, and manufacturer guidelines. His work draws on industry testing standards and verified product data.`;
    case "dental":
      return `${authorName} has covered ${cap} content with a focus on clinical guidelines, treatment procedures, cost factors, and patient outcomes. His work references peer-reviewed publications and official dental association guidance.`;
    case "sport":
      return `${authorName} has covered ${cap} content with a focus on rules, equipment, athlete development, and competition structure at recreational, youth, collegiate, and elite levels. His work draws on official governing body publications and verified competition data.`;
    default:
      return `${authorName} has covered ${cap} content with a focus on accuracy, sourcing from authoritative publications and verified data to ensure every claim meets editorial standards.`;
  }
}

function buildEditorialPolicy(sportLabel: string, category: TopicCategory): string {
  switch (category) {
    case "product-care":
      return `All factual claims, care instructions, and technical specifications are cross-referenced against manufacturer guidelines and industry testing standards before publication. Product data is sourced from verified supplier and standards documentation, not secondary aggregators.`;
    case "dental":
      return `All factual claims, treatment details, and cost data are cross-referenced against official dental association publications and peer-reviewed clinical guidelines before publication. Statistics are sourced from verified clinical databases, not secondary aggregators.`;
    case "sport":
      return `All factual claims, rules, distances, and records are cross-referenced against official ${sportLabel} governing body publications before publication. Statistics are sourced from official results databases, not secondary aggregators.`;
    default:
      return `All factual claims are cross-referenced against authoritative sources before publication. Data is sourced from verified primary references, not secondary aggregators.`;
  }
}

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
    "AATCC", "American Association of Textile Chemists",
    "HTV", "Heat Transfer Vinyl",
  ];

  for (const file of contextFiles) {
    const text = file.content.slice(0, 8000);

    // Match known organisations by name
    for (const org of KNOWN_ORGS) {
      if (text.includes(org)) sources.add(org);
    }

    // Extract acronyms in parentheses — e.g. "National Football League (NFL)"
    const acronymRe = /([A-Z][A-Za-z &.\-'"]{4,60})\s+\(([A-Z]{2,8})\)/g;
    let m: RegExpExecArray | null;
    while ((m = acronymRe.exec(text)) !== null) {
      const fullName = m[1].trim();
      const acronym = m[2];
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
  // Derive a clean sport label
  const rawSport = sport?.trim() || "";
  const sportLabel = rawSport
    ? rawSport
        .replace(/[?!.]/g, "")
        .replace(/^(girls|boys|womens?|mens?|youth|college|collegiate)\s+/gi, "")
        .replace(/:.+$/, "")
        .toLowerCase()
        .trim() || rawSport.toLowerCase().trim()
    : "sport";
  const authorName = author?.trim() || "Nic Reese";
  const reviewDate = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const category = categoriseTopic(sportLabel);

  const extractedSources =
    contextFiles?.length > 0 ? extractSourcesFromContextFiles(contextFiles) : [];
  const governingBodies = getSportGoverningBodies(sportLabel);
  const sources = extractedSources.length > 0 ? extractedSources : governingBodies;
  const sourceHeading =
    extractedSources.length > 0
      ? "**Sources used in this article**"
      : "**Fact-checked against**";
  const sourcesList = sources.map((s) => `- ✓ ${s}`).join("\n");

  const bioCopy = buildBioCopy(authorName, sportLabel, category);
  const editorialPolicy = buildEditorialPolicy(sportLabel, category);

  const expertTitle =
    category === "product-care"
      ? `${sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1)} Specialist`
      : category === "dental"
      ? `${sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1)} Content Specialist`
      : `${sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1)} Expert`;

  return [
    `![${authorName}](${NIC_PHOTO_URL})`,
    "",
    `**${authorName}** · ${expertTitle}`,
    "",
    bioCopy,
    "",
    sourceHeading,
    sourcesList,
    "",
    "**Editorial policy**",
    editorialPolicy,
    "",
    `*Last reviewed: ${reviewDate}*`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// extractSourcesFromArticle
// Pulls labelled sources from the ## References section of a generated article.
// Returns up to 5 entries. Prefers full "Name (ACRONYM)" labels from the text,
// falls back to bare domains.
// ─────────────────────────────────────────────────────────────────────────────
export function extractSourcesFromArticle(articleMarkdown: string): string[] {
  const sources: string[] = [];
  const seen = new Set<string>();

  // Find ## References block
  const refMatch = articleMarkdown.match(/^##\s+References?[\s\S]*$/im);
  if (!refMatch) return [];
  const refBlock = refMatch[0];

  // Pull full-text labels like "American Association of Textile Chemists and Colorists (AATCC)"
  const acronymRe = /([A-Z][A-Za-z &.\-']{4,60})\s+\(([A-Z]{2,8})\)/g;
  let m: RegExpExecArray | null;
  while ((m = acronymRe.exec(refBlock)) !== null) {
    const label = `${m[1].trim()} (${m[2]})`;
    if (!seen.has(label)) { seen.add(label); sources.push(label); }
  }

  // Pull plain-text org/source names from bullet lines (no URL)
  const bulletTextRe = /^[-*+]\s+(?!https?:\/\/)([A-Z][A-Za-z0-9 &.,\-'()]{3,80})$/gm;
  while ((m = bulletTextRe.exec(refBlock)) !== null) {
    const label = m[1].trim();
    if (!seen.has(label) && label.split(/\s+/).length >= 2) {
      seen.add(label); sources.push(label);
    }
  }

  // Pull domains from URLs as fallback
  const SKIP_DOMAINS = new Set([
    "google.com", "youtube.com", "facebook.com", "twitter.com",
    "amazon.com", "shopify.com", "instagram.com", "linkedin.com",
  ]);
  // Capture the FULL hostname (all labels), not just the first two —
  // "pmc.ncbi.nlm.nih.gov" must not be truncated to "pmc.ncbi".
  const urlRe = /https?:\/\/(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})/gi;
  while ((m = urlRe.exec(refBlock)) !== null) {
    const domain = m[1].toLowerCase();
    if (!SKIP_DOMAINS.has(domain) && !seen.has(domain)) {
      seen.add(domain); sources.push(domain);
    }
  }

  return sources.slice(0, 5);
}
