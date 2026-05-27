// Pure URL classification + extraction helpers used by generate-content.
// Extracted verbatim from supabase/functions/generate-content/index.ts so the
// orchestrator stays small. No behaviour changes — same regex, same logic.
//
// Stateless: every function here is referentially transparent given its
// arguments. Caches that depend on per-request lifetime (urlStatusCache,
// firecrawlSourceCache) intentionally stay in the orchestrator.

export type SourceCandidate = {
  title: string;
  url: string;
  origin: "context" | "web" | "existing";
  snippet?: string;
  fileName?: string;
};

// Junk URL patterns: navigation, legal, social, tracking, assets - NOT real citations.
export const junkUrlPatterns = [
  /\/(privacy|cookies?|terms|legal|gdpr|imprint|impressum|disclaimer|accessibility|sitemap|login|signin|signup|register|account|cart|checkout|unsubscribe|preferences|consent)(\/|$|\?|#)/i,
  /\/(share|tweet|facebook|linkedin|whatsapp|pinterest|reddit|email[-_]?friend)(\/|$|\?|#)/i,
  /(twitter\.com\/intent|facebook\.com\/sharer|linkedin\.com\/share|t\.co\/|bit\.ly\/|goo\.gl\/|lnkd\.in\/|fb\.me\/|youtu\.be\/share)/i,
  /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|pdf\?|mp4|mp3|zip|xml|rss)(\?|$)/i,
  /\/(wp-content|wp-includes|assets|static|cdn|fonts|images?|img|media)\//i,
  /(googletagmanager|google-analytics|doubleclick|hotjar|segment\.io|mixpanel|amplitude|facebook\.net|connect\.facebook)/i,
  /^https?:\/\/(www\.)?(twitter|x|facebook|instagram|tiktok|youtube|pinterest|linkedin|reddit)\.com\/?$/i,
];

export const isJunkUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.hostname.length < 4) return true;
    return junkUrlPatterns.some((re) => re.test(url));
  } catch {
    return true;
  }
};

// ─── DOMAIN AUTHORITY CLASSIFIER (applies to BOTH context URLs and web search) ───
// Hoisted so context-file URL extraction can reject low-quality domains the same
// way web-search results are tiered. Previously context URLs bypassed this entirely
// and a commercial blog with a strong slug match could win the citation over real
// authorities.
export const highAuthorityHostPatterns = [
  // Governments & regulators
  /(^|\.)gov(\.[a-z]{2,3})?$/i, /(^|\.)gouv\.fr$/i, /(^|\.)gov\.uk$/i, /(^|\.)gc\.ca$/i, /(^|\.)gov\.au$/i,
  /(^|\.)europa\.eu$/i, /(^|\.)un\.org$/i, /(^|\.)who\.int$/i, /(^|\.)oecd\.org$/i,
  // Health & medical authorities
  /(^|\.)nhs\.uk$/i, /(^|\.)nice\.org\.uk$/i, /(^|\.)mhra\.gov\.uk$/i,
  /(^|\.)cdc\.gov$/i, /(^|\.)fda\.gov$/i, /(^|\.)nih\.gov$/i, /(^|\.)nlm\.nih\.gov$/i, /(^|\.)ncbi\.nlm\.nih\.gov$/i,
  /(^|\.)medlineplus\.gov$/i, /(^|\.)cancer\.gov$/i, /(^|\.)hhs\.gov$/i,
  /(^|\.)ema\.europa\.eu$/i, /(^|\.)ecdc\.europa\.eu$/i,
  /(^|\.)mayoclinic\.org$/i, /(^|\.)clevelandclinic\.org$/i, /(^|\.)hopkinsmedicine\.org$/i,
  /(^|\.)mountsinai\.org$/i, /(^|\.)massgeneral\.org$/i, /(^|\.)kp\.org$/i,
  /(^|\.)bupa\.co\.uk$/i, /(^|\.)bupa\.com$/i, /(^|\.)healthdirect\.gov\.au$/i,
  /(^|\.)healthline\.com$/i, /(^|\.)webmd\.com$/i, /(^|\.)medicalnewstoday\.com$/i,
  /(^|\.)bmj\.com$/i, /(^|\.)thelancet\.com$/i, /(^|\.)nejm\.org$/i, /(^|\.)jamanetwork\.com$/i,
  /(^|\.)cochrane\.org$/i, /(^|\.)cochranelibrary\.com$/i,
  // Dental professional bodies
  /(^|\.)ada\.org$/i, /(^|\.)bda\.org$/i, /(^|\.)rcseng\.ac\.uk$/i, /(^|\.)gdc-uk\.org$/i,
  /(^|\.)fdiworlddental\.org$/i, /(^|\.)bsperio\.org\.uk$/i,
  // Academia / research / journals
  /\.edu$/i, /\.ac\.[a-z]{2,3}$/i,
  /(^|\.)nature\.com$/i, /(^|\.)science\.org$/i, /(^|\.)sciencedirect\.com$/i,
  /(^|\.)springer\.com$/i, /(^|\.)wiley\.com$/i, /(^|\.)tandfonline\.com$/i,
  /(^|\.)sagepub\.com$/i, /(^|\.)oup\.com$/i, /(^|\.)cambridge\.org$/i,
  /(^|\.)plos\.org$/i, /(^|\.)frontiersin\.org$/i, /(^|\.)mdpi\.com$/i,
  /(^|\.)arxiv\.org$/i, /(^|\.)ssrn\.com$/i, /(^|\.)jstor\.org$/i,
  // Reference works
  /(^|\.)wikipedia\.org$/i, /(^|\.)britannica\.com$/i,
  // Standards bodies
  /(^|\.)iso\.org$/i, /(^|\.)iec\.ch$/i, /(^|\.)ieee\.org$/i, /(^|\.)ietf\.org$/i, /(^|\.)w3\.org$/i,
  /(^|\.)bsigroup\.com$/i, /(^|\.)cenelec\.eu$/i, /(^|\.)astm\.org$/i, /(^|\.)nist\.gov$/i,
  // Major news / authoritative reporting
  /(^|\.)reuters\.com$/i, /(^|\.)apnews\.com$/i, /(^|\.)bbc\.co\.uk$/i, /(^|\.)bbc\.com$/i,
  /(^|\.)nytimes\.com$/i, /(^|\.)washingtonpost\.com$/i, /(^|\.)wsj\.com$/i, /(^|\.)ft\.com$/i,
  /(^|\.)economist\.com$/i, /(^|\.)theguardian\.com$/i, /(^|\.)npr\.org$/i,
  // Consumer reports & watchdogs
  /(^|\.)consumerreports\.org$/i, /(^|\.)which\.co\.uk$/i, /(^|\.)citizensadvice\.org\.uk$/i,
];

export const isHighAuthority = (url: string): boolean => {
  try {
    return highAuthorityHostPatterns.some((re) => re.test(new URL(url).hostname));
  } catch {
    return false;
  }
};

export const lowAuthorityHostPatterns = [
  /(^|\.)reddit\.com$/i, /(^|\.)quora\.com$/i, /(^|\.)pinterest\.[a-z.]+$/i,
  /(^|\.)medium\.com$/i, /(^|\.)substack\.com$/i, /(^|\.)tumblr\.com$/i,
  /(^|\.)blogspot\.com$/i, /(^|\.)wordpress\.com$/i, /(^|\.)wixsite\.com$/i,
  /(^|\.)weebly\.com$/i, /(^|\.)squarespace\.com$/i, /(^|\.)yahoo\.com\/answers/i,
  /(^|\.)answers\.com$/i, /(^|\.)ehow\.com$/i, /(^|\.)wikihow\.com$/i,
  /(^|\.)tripadvisor\.[a-z.]+$/i, /(^|\.)yelp\.com$/i,
  /(^|\.)stackexchange\.com$/i, /(^|\.)stackoverflow\.com$/i,
  /(^|\.)facebook\.com$/i, /(^|\.)instagram\.com$/i, /(^|\.)tiktok\.com$/i,
  /(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i,
  /(^|\.)buzzrx\.com$/i, /(^|\.)goodrx\.com\/blog/i, /(^|\.)singlecare\.com$/i,
];

export const isLowAuthority = (url: string): boolean => {
  try {
    return lowAuthorityHostPatterns.some((re) => re.test(new URL(url).hostname));
  } catch {
    return true;
  }
};

export const commercialHostHints = /(tourism|clinic|clinics|dental|dentist|dentists|implants?|veneers?|cosmetic|smile|aesthetic|whitening|orthodont|invisalign|loans?|insurance|reviews?|best|top10|topten|cheap|deals?|coupon|discount|directory|finder|near[-_]?me|seo)/i;

export const looksCommercial = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return commercialHostHints.test(host);
  } catch {
    return true;
  }
};

// A URL is "low quality" if it's on the UGC blocklist OR looks commercial AND isn't on the high-authority allow-list.
export const isLowQualityDomain = (url: string): boolean => {
  if (isHighAuthority(url)) return false;
  if (isLowAuthority(url)) return true;
  if (looksCommercial(url)) return true;
  return false;
};

export const cleanSourceUrl = (rawUrl: string): string =>
  rawUrl.replace(/[)\]\.,;]+$/, "").trim();

export const sourceTitleFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
};

export const extractMarkdownLinks = (
  md: string,
  origin: SourceCandidate["origin"],
): SourceCandidate[] => {
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const links: SourceCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(md)) !== null) {
    if (m.index > 0 && md[m.index - 1] === "!") continue;
    const title = m[1].trim().replace(/[*_`]/g, "") || sourceTitleFromUrl(m[2]);
    const url = cleanSourceUrl(m[2]);
    const snipStart = Math.max(0, m.index - 280);
    const snipEnd = Math.min(md.length, m.index + m[0].length + 280);
    const snippet = md.slice(snipStart, snipEnd).replace(/\s+/g, " ").trim();
    links.push({ title, url, origin, snippet });
  }
  return links;
};
