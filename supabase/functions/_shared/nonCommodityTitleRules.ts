// Shared non-commodity title rules. Used by:
//   - cluster-keywords / cluster-keywords-enrich  (blog idea title generation)
//   - proprietary-generate-article                 (H1 rewrite before generation)
//
// Goal: kill commodity, list-style, marketing-umbrella titles like
//   "Screwless Dental Implants: What Are They?"
//   "Invisalign Underbite: How Does It Work?"
// in favour of titles that surface the real technical split, the actual
// decision, or the failure mode the article will resolve.

export const NON_COMMODITY_TITLE_RULES = `
NON-COMMODITY TITLE RULES (apply to every title you generate):

PURPOSE: titles must NOT read like every other SEO blog post on the topic.
They must signal a real distinction, a decision, a trade-off, or a failure
mode — not a definition.

FORMAT (pick the strongest one for the topic, in this order of preference):
  1. Distinction title — names the real technical split the umbrella term
     hides. Examples:
       "Cement-retained vs Screw-retained Implants: Which Fails Quieter?"
       "Dental vs Skeletal Underbite: When Aligners Work and When They Don't"
  2. Decision title — frames the article around the actual choice a reader
     is making. Examples:
       "When Invisalign Cannot Fix an Underbite (and What To Ask Instead)"
       "Choosing an Implant System: Four Questions Most Patients Never Ask"
  3. Failure-mode title — names the specific way the topic goes wrong.
     Examples:
       "Why Cement-Retained Crowns Are Misdiagnosed as Peri-Implantitis"
       "The Hidden Reason Invisalign Underbite Cases Relapse After Year One"
  4. Contrarian title — pushes back on the marketing consensus. Examples:
       "Screwless Dental Implants Don't Exist: What Clinicians Actually Mean"
       "Most Adult Underbite Cases Need More Than Aligners — Here's Why"

KEYWORD HANDLING:
- The primary target keyword (or its closest natural variant) must appear
  in the title for SEO, but it does NOT have to be the first words.
- Treat the keyword as a topic to anchor, not a phrase to lead with.
- Paraphrasing a clunky search query into natural language is allowed and
  encouraged ("how can Invisalign fix an underbite" → "Invisalign for
  Underbite Correction").

LENGTH: 6-14 words. No subtitle, no colon-then-tagline filler.

HARD BANS (never use these in titles):
- "Ultimate Guide", "Complete Guide", "Beginner's Guide", "Comprehensive",
  "Everything You Need to Know", "Deep Dive", "Mastering", "Unpacking",
  "Unlocking", "Navigate", "Essential", "Your", "Handbook", "Checklist",
  "Beyond the Basics", "A Look At", "All About", "The Truth About"
  (unless followed by a specific contrarian claim).
- Pure definition framing: "What Are X?", "What Is X?", "X: What They Are",
  "X Explained", "Understanding X". A definition is the WEAKEST framing —
  reframe as a distinction, decision, failure mode, or contrarian.
- Marketing umbrella terms left unchallenged ("screwless", "painless",
  "natural", "minimally invasive", "advanced", "smart", "premium",
  "clinical-grade", "next-generation") — if such a term is in the keyword,
  the title must either name the underlying real category OR explicitly
  challenge the umbrella ("X doesn't exist — here's what clinicians mean").
- Sales language, hype, exclamation marks, emoji, ALL CAPS words.
- AI-sounding filler: "in 2026", "and beyond", "the future of", "redefining".

GOOD vs BAD EXAMPLES:
  BAD:  "Screwless Dental Implants: What Are They?"
  GOOD: "Screwless Dental Implants Don't Exist: What Clinicians Actually Mean"
  GOOD: "Cement vs Friction-Fit vs Screw-Retained: Which Implant Fails Quieter?"

  BAD:  "Can Invisalign Fix Underbite: How Does It Work for Adults?"
  GOOD: "Invisalign for Adult Underbite: When It Works and When It Won't"
  GOOD: "Why Most Adult Underbite Cases Need More Than Invisalign"

  BAD:  "Track Pants: What Are They Made Of?"
  GOOD: "Track Pants Fabric: Why Polyester Outlasts Cotton on the Track"
`.trim();

// Lightweight detector for commodity-style titles. Used when we want to
// decide whether to rewrite an inbound title.
export function isCommodityStyleTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return false;
  // Definition framings
  if (/:\s*what\s+(are|is|they)\b/.test(t)) return true;
  if (/^what\s+(are|is)\b/.test(t)) return true;
  if (/\b(explained|understanding|all about|a look at)\b/.test(t)) return true;
  // Generic guide framings
  if (/\b(ultimate|complete|beginner'?s?|comprehensive|essential)\s+guide\b/.test(t)) return true;
  if (/\b(everything you need to know|deep dive|mastering|unpacking|unlocking)\b/.test(t)) return true;
  // Search-query format ("how does X work", "can X fix Y") left as-is
  if (/^(how|can|does|do|is|are|will|should)\b/.test(t) && t.endsWith("?")) return true;
  // Marketing umbrella terms left unchallenged
  const umbrellas =
    /\b(screwless|painless|natural|minimally invasive|advanced|smart|premium|clinical-grade|next[- ]generation|holistic|revolutionary)\b/;
  if (umbrellas.test(t) && !/\b(don'?t exist|isn'?t real|is mostly marketing|what clinicians actually mean)\b/.test(t)) {
    return true;
  }
  return false;
}
