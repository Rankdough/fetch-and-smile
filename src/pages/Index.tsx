import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Sparkles, FileText, Link, Search, X, Upload, Plus, Tag, Download, ExternalLink, BookOpen, Eye, Edit2, Mic2, RotateCcw, Target, Maximize2, Minimize2, ImagePlus, Wand2, Image, ChevronDown, Trash2, Settings, FileUp, Save, FolderOpen, ArrowRightLeft, Brain } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { GenerationChecklist } from "@/components/GenerationChecklist";
import { ContentVerification } from "@/components/ContentVerification";
import { CTABanner, generateCTAHtml } from "@/components/CTABanner";
import { TrustSignalBox, buildTrustSignalHtml } from "@/components/TrustSignalBox";
import { ColorPaletteSelector, ColorPalette, COLOR_PALETTES } from "@/components/ColorPaletteSelector";
import { KnowledgeBasePanel } from "@/components/KnowledgeBasePanel";
import { VoiceEditAgent } from "@/components/VoiceEditAgent";
import { ToneProfilePanel } from "@/components/ToneProfilePanel";
import { UniqueAnglesPanel } from "@/components/UniqueAnglesPanel";
import { GapAnalysisSelector } from "@/components/GapAnalysisSelector";
import { QualityScoringPanel } from "@/components/QualityScoringPanel";
import { Switch } from "@/components/ui/switch";
import { ArticleNavigationPanel, extractNavigationFromContent, generateNavigationHtml } from "@/components/ArticleNavigationPanel";
import { FAQAccordion, extractFAQFromContent, removeFAQSection, generateFAQHtml } from "@/components/FAQAccordion";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useCreditTracking } from "@/hooks/useCreditTracking";
import { SectionIndicator } from "@/components/SectionIndicator";
import { ArticleImagesPanel, ArticleImage } from "@/components/ArticleImagesPanel";
import { HtmlImportDialog } from "@/components/HtmlImportDialog";
import { UrlImportDialog } from "@/components/UrlImportDialog";
import { PasteAndFormatDialog } from "@/components/PasteAndFormatDialog";
import { ConvertToArticleView } from "@/components/ConvertToArticleView";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CreditUsageDisplay } from "@/components/CreditUsageDisplay";
import { GenerationProgress, PipelineStage } from "@/components/GenerationProgress";
import { ValuePromiseVerification } from "@/components/ValuePromiseVerification";
import { ApplyFormatProgress, FormatStep, DEFAULT_FORMAT_STEPS } from "@/components/ApplyFormatProgress";
import ContextHubPanel from "@/components/ContextHubPanel";
import { EvidenceSuggestionsPanel } from "@/components/EvidenceSuggestionsPanel";

const SAMPLE_CONTENT = `# Composite Bonding vs Veneers: Which Smile Transformation is Right for You?

We've all been there - looking in the mirror and focusing on that one chipped tooth, a persistent stain, or a small gap that makes us self-conscious when we laugh.

## TL;DR

- **Composite bonding** is a minimally invasive, largely reversible cosmetic dental treatment best suited to small chips, gaps, and minor shape issues. It is cheaper upfront, but requires more maintenance over time.
- **Veneers** are a permanent cosmetic solution designed for full smile makeovers, severe discolouration, and significant shape or symmetry issues. They are more expensive but last longer.

## Quick Tips

> **Tip 1:** Ask to see before-and-after photos of your dentist's previous work.

> **Tip 2:** Coffee drinkers should lean towards veneers for better stain resistance.

> **Tip 3:** Request a digital smile preview before any permanent enamel removal.

## What is Composite Bonding?

Composite bonding and veneers are often grouped together as cosmetic dentistry, but clinically, they serve different purposes. Composite bonding is an additive procedure that builds onto the natural tooth with resin, preserving enamel and keeping future options open.

The resin is hardened using a specialized ultraviolet light and then polished to match the natural sheen of your enamel. It is an artistic process that is usually completed in a single visit without the need for anesthesia.

### The Benefits of Bonding
- **Minimally Invasive:** No natural tooth structure needs to be removed
- **Speed:** Completed in a single visit (~30-60 minutes per tooth)
- **Reversible:** The process can largely be undone or adjusted
- **Affordability:** Typical UK cost is £200-£450 per tooth

**Sources:** [What Is Dental Bonding? - Cleveland Clinic](https://my.clevelandclinic.org/health/treatments/10922-dental-bonding) | [Composite bonding - Bupa Dental Care](https://www.bupa.co.uk/dental/dental-care/treatments/composite-bonding)

---

## What are Porcelain Veneers?

Veneers involve permanently altering the tooth surface to create a new external layer. Unlike bonding, veneers are fabricated in a dental laboratory based on a mold of your mouth.

To ensure the veneers don't look bulky, a small amount of enamel (usually less than a millimeter) is typically removed from the front of the tooth. This makes the procedure permanent.

### The Benefits of Veneers
- **Durability:** Can last 10 to 15+ years with proper care
- **Stain Resistance:** Porcelain is non-porous and won't stain from coffee or tea
- **Total Transformation:** Ideal for correcting severe issues like misalignment
- **Natural Esthetics:** Mimics light-reflecting properties of natural teeth

**Sources:** [Dental Veneers: Benefits, Procedure, Costs - Healthline](https://www.healthline.com/health/dental-veneers) | [Long-Term Survival of Porcelain Veneers - NIH](https://pmc.ncbi.nlm.nih.gov/articles/PMC7961608/)

---

## At-a-Glance Comparison Table

| Factor | Composite Bonding | Veneers (Porcelain) |
| :--- | :--- | :--- |
| **Treatment Time** | 1 Appointment (~30-60 mins per tooth) | 2-3 Appointments over 2 weeks |
| **Lifespan** | 5 to 8 years | 10 to 15+ years |
| **Tooth Preparation** | Little to none | Enamel removal required |
| **Stain Resistance** | Low (can stain over time) | High (highly resistant) |
| **Reversibility** | Largely reversible | Permanent |
| **Typical UK Cost** | £200 - £450 per tooth | £600 - £1,100 per tooth |

**Sources:** [Composite bonding vs veneers - Bupa](https://www.bupa.co.uk/newsroom/ourviews/composite-bonding-vs-veneers)

---

## How to Choose?

Use this checklist to pick the right treatment for your situation:

- **Budget under £500 per tooth?** Composite bonding fits comfortably at £200-£450, while veneers start at £600+.
- **Need to preserve natural enamel?** Bonding requires little to no tooth preparation and is largely reversible.
- **Want results lasting 10+ years?** Porcelain veneers offer 10-15+ years of durability vs 5-8 years for bonding.
- **Concerned about staining?** Veneers are highly stain-resistant; bonding can discolour over time with coffee, tea, or red wine.
- **Planning a full smile makeover?** Veneers deliver a more dramatic, uniform transformation across multiple teeth.
- **Prefer a single-appointment fix?** Bonding is completed in one 30-60 minute visit per tooth.

---

## Frequently Asked Questions

**Is composite bonding reversible?**

Composite bonding is largely reversible, though the enamel surface may not return to its original state.

**Do veneers ruin teeth?**

Veneers permanently remove enamel, which is irreversible. However, when done properly by a skilled dentist, they protect and enhance your teeth.

**Which lasts longer?**

Porcelain veneers last significantly longer than composite bonding—typically 10-15+ years compared to 5-8 years.

**Can bonding stain?**

Yes. Composite resin absorbs pigments over time from coffee, tea, red wine, and smoking.

**Can veneers be whitened?**

No. Veneers must be replaced to change colour. It's recommended to whiten natural teeth before getting veneers.

---

## Final Thoughts

The right choice depends on the scale of change you want, how long you want results to last, and whether you are comfortable with permanent enamel alteration. Bonding prioritises flexibility and tooth preservation. Veneers prioritise longevity, colour stability, and comprehensive aesthetic change.

**Ready to take the next step?** Schedule a consultation with a cosmetic dentist today to see what your new smile could look like!

---

## References:

[Composite bonding vs veneers: What's the difference? - Bupa](https://www.bupa.co.uk/newsroom/ourviews/composite-bonding-vs-veneers)

[What Is Dental Bonding? - Cleveland Clinic](https://my.clevelandclinic.org/health/treatments/10922-dental-bonding)

[Long-Term Survival and Complication Rates of Porcelain Laminate Veneers - NIH](https://pmc.ncbi.nlm.nih.gov/articles/PMC7961608/)

[Composite bonding - Bupa Dental Care](https://www.bupa.co.uk/dental/dental-care/treatments/composite-bonding)

[Dental Veneers: Benefits, Procedure, Costs, and Results - Healthline](https://www.healthline.com/health/dental-veneers)
`;
// Helper to auto-clean prohibited characters from content
const cleanContent = (content: string): string => {
  let cleaned = content
    .replace(/—/g, "-")  // Remove em dashes
    .replace(/–/g, "-")  // Remove en dashes
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")  // Remove horizontal lines
    .replace(/^(\s*[-*])\s+[-–—]\s*/gm, "$1 ");  // Remove dashes after bullet points (e.g., "- - text" -> "- text")

  // Fix inline numbered lists rendered as a single paragraph
  // e.g., "1. Foo: text here. 2. Bar: text here." → separate lines
  cleaned = cleaned.replace(/^(\d+\.\s+\*\*[^*]+\*\*[:\s].+?)(?=\s+\d+\.\s+\*\*)/gm, "$1");
  // Split inline numbered items: "1. **X:** ... 2. **Y:** ..." into separate lines
  cleaned = cleaned.replace(/(\S)\s+(\d+)\.\s+(\*\*)/g, "$1\n$2. $3");

  // Fix inline bold-label bullet items merged into one paragraph
  // e.g., "**Income Requirements:** text - **Residency Status:** text" → separate bullets
  cleaned = cleaned.replace(/([.!?])\s+-\s+\*\*/g, "$1\n- **");

  return cleaned;
};


// Helper to extract "In This Article" navigation items from markdown
const extractInThisArticleItems = (content: string): { number: number; title: string; description: string; detailedDescription?: string; slug: string; isHighlighted?: boolean }[] => {
  const items: { number: number; title: string; description: string; detailedDescription?: string; slug: string; isHighlighted?: boolean }[] = [];

  const inThisArticleMatch = content.match(/^##\s*In This Article\s*\n([\s\S]*?)(?=\n##\s(?!In This Article)|$)/im);
  if (!inThisArticleMatch) return items;

  const lines = inThisArticleMatch[1]
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean);

  type ParsedNavItem = { number: number; title: string; description: string };
  const parsedItems: ParsedNavItem[] = [];
  let current: ParsedNavItem | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const cleanedDesc = current.description.trim().replace(/\s+/g, " ");
    parsedItems.push({ ...current, description: cleanedDesc });
    current = null;
  };

  for (const line of lines) {
    let itemMatch = line.match(/^-\s*\*\*(\d+)\.\s*([^*]+?)\*\*\s*(?:[-–—:]\s*(.*))?$/);
    if (!itemMatch) {
      itemMatch = line.match(/^-\s*(\d+)\.\s*([^–—:-]+?)\s*(?:[-–—:]\s*(.*))?$/);
    }

    if (itemMatch) {
      pushCurrent();
      current = {
        number: parseInt(itemMatch[1], 10),
        title: itemMatch[2].trim(),
        description: (itemMatch[3] || "").trim(),
      };
      continue;
    }

    if (current && !/^[-*]+$/.test(line)) {
      current.description = `${current.description} ${line}`.trim();
    }
  }
  pushCurrent();

  const uniqueSortedItems = parsedItems
    .filter((item, index, array) => array.findIndex((candidate) => candidate.number === item.number) === index)
    .sort((a, b) => a.number - b.number);

  for (const item of uniqueSortedItems) {
    const title = item.title;
    const bulletDescription = item.description || `Learn about ${title.toLowerCase()}.`;
    const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

    const h2Pattern = new RegExp(`## ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?\\n\\n([^#\\n][\\s\\S]*?)(?=\\n\\n|\\n##|$)`, "i");
    const sectionMatch = content.match(h2Pattern);

    let fullDescription = bulletDescription;
    if (sectionMatch?.[1]) {
      const sectionFirstPara = sectionMatch[1]
        .replace(/\*\*/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      if (sectionFirstPara.length > bulletDescription.length) {
        fullDescription = sectionFirstPara;
      }
    }

    if (fullDescription.length < 120) {
      fullDescription = `${bulletDescription} ${fullDescription}`.trim();
    }

    const visibleLength = 140;
    const expandedLength = 140;

    const description = fullDescription.length > visibleLength
      ? `${fullDescription.slice(0, visibleLength).trim()}...`
      : fullDescription;

    const detailedDescription = fullDescription.length > visibleLength
      ? `${fullDescription.slice(visibleLength, visibleLength + expandedLength).trim()}${fullDescription.length > visibleLength + expandedLength ? "..." : ""}`
      : `Click to jump directly to this section and learn more about ${title.toLowerCase()}.`;

    items.push({
      number: item.number,
      title,
      description,
      detailedDescription,
      slug,
      isHighlighted: item.number === 1,
    });
  }

  return items;
};

const getBestNavigationItems = (content: string) => {
  const explicitItems = extractInThisArticleItems(content);
  const fallbackItems = extractNavigationFromContent(content);

  if (explicitItems.length >= 2) return explicitItems;
  if (fallbackItems.length > explicitItems.length) return fallbackItems;
  return explicitItems;
};

const normalizeQuickTipsSection = (content: string): string => {
  const quickTipsMatch = content.match(/^##\s*Quick Tips\s*\n([\s\S]*?)(?=\n##\s|$)/im);
  if (!quickTipsMatch) return content;

  const raw = quickTipsMatch[1].replace(/^>\s?/gm, "").trim();
  // Strip surrounding smart/straight quotes and normalize whitespace
  const quickTipsBody = raw
    .replace(/\r/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/^[\s"'\u2018\u2019\u201C\u201D]+/, "")
    .replace(/[\s"'\u2018\u2019\u201C\u201D]+$/, "")
    .trim();

  const cleanTip = (tip: string) => tip
    .replace(/^(?:\*\*)?Tip\s*\d+\s*[:\-]?\*?\*?\s*/i, "")
    .replace(/^[\s\-–—•:;,.]+/, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'\u2018\u2019\u201C\u201D]+/, "")
    .replace(/[\s"'\u2018\u2019\u201C\u201D]+$/, "")
    .trim();

  const buildNormalized = (tips: string[]): string => {
    const normalizedTips = tips.map(cleanTip).filter(Boolean);
    if (normalizedTips.length < 2) return content;

    const section = "## Quick Tips\n\n" + normalizedTips.slice(0, 3).map((tip, i) => "> **Tip " + (i + 1) + ":** " + tip).join("\n\n") + "\n";
    return content.replace(quickTipsMatch[0], section);
  };

  // Strategy 1: Already has separate "> **Tip N:**" blockquotes
  const blockquoteTips = quickTipsBody.match(/\*\*Tip\s*\d+\s*:\*\*\s*[^\n]+/gi);
  if (blockquoteTips && blockquoteTips.length >= 2) {
    const tips = blockquoteTips.map(cleanTip).filter(Boolean);
    if (tips.length >= 2) return buildNormalized(tips);
  }

  // Strategy 2: Merged text with inline "Tip 2:" / "Tip 3:" markers inside one blockquote/paragraph
  const tipMarkerMatches = [...quickTipsBody.matchAll(/(?:\*\*)?Tip\s*\d+\s*[:\-]\*?\*?\s*/gi)];
  if (tipMarkerMatches.length >= 2) {
    const tips: string[] = [];

    const firstMarkerIndex = tipMarkerMatches[0].index ?? 0;
    const leadingTip = cleanTip(quickTipsBody.slice(0, firstMarkerIndex));
    if (leadingTip) tips.push(leadingTip);

    tipMarkerMatches.forEach((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < tipMarkerMatches.length
        ? (tipMarkerMatches[index + 1].index ?? quickTipsBody.length)
        : quickTipsBody.length;

      const extractedTip = cleanTip(quickTipsBody.slice(start, end));
      if (extractedTip) tips.push(extractedTip);
    });

    if (tips.length >= 2) return buildNormalized(tips);
  }

  // Strategy 3: Numbered list
  const numberedTips = quickTipsBody.match(/^\d+\.\s+.+/gm);
  if (numberedTips && numberedTips.length >= 2) {
    const tips = numberedTips.map(t => cleanTip(t.replace(/^\d+\.\s+/, ""))).filter(Boolean);
    return buildNormalized(tips);
  }

  // Strategy 4: Sentence-split fallback
  const sentences = quickTipsBody
    .replace(/(?:\*\*)?Tip\s*\d+\s*[:\-]\*?\*?\s*/gi, "")
    .split(/(?<=[.!?])\s+/)
    .map(cleanTip)
    .filter(s => s.length > 10);
  if (sentences.length >= 3) return buildNormalized(sentences.slice(0, 3));

  return content;
};

// Helper to remove "In This Article" section from markdown for custom rendering
const removeInThisArticleSection = (content: string): string => {
  let cleaned = content;
  
  // Remove "# In This Article" (H1 format from some imports)
  cleaned = cleaned.replace(/^# In This Article\s*\n[\s\S]*?(?=\n## |\n# [^I]|$)/gim, "");
  
  // Remove "## In This Article" (H2 format) - match until the next H2 that's NOT "In This Article"
  cleaned = cleaned.replace(/^## In This Article\s*\n[\s\S]*?(?=\n## (?!In This Article))/gim, "");
  
  // Also catch sections that have numbered lists with "Jump to section" links
  cleaned = cleaned.replace(/^#+\s*In This Article[\s\S]*?(?=\n## [A-Z])/gim, "");
  
  // Remove standalone navigation-style bullet lists with numbered items
  // Pattern: Lines starting with "- **1. Title** - Description" or "- 1. Title - Description"
  cleaned = cleaned.replace(/^- \*\*\d+\.\s*[^*]+\*\*\s*[-–—]\s*[^\n]+$/gm, "");
  cleaned = cleaned.replace(/^- \d+\.\s*[A-Z][^\n]*[-–—][^\n]{30,}$/gm, "");
  
  // Also remove bullet list items that look like navigation (numbered bold titles with long descriptions)
  // This catches items like: "- **2. The World of Porcelain Veneers** - Explore the high-end world..."
  const navItemPattern = /^-\s*\*\*\d+\.\s*[^*]+\*\*\s*[-–—]\s*.+$/gm;
  cleaned = cleaned.replace(navItemPattern, "");
  
  // Remove empty lines left behind (multiple consecutive newlines -> max 2)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  
  // Remove any stray CSS that leaked through
  cleaned = cleaned.replace(/details\[open\][\s\S]*?display:\s*none;\s*\}/g, "");
  cleaned = cleaned.replace(/[a-z-]+(?:\[[^\]]*\])?\s*[a-z-]*\s*\{[^}]*\}/gi, "");
  
  return cleaned;
};

type ActiveTool = "generator" | "converter";

const Index = () => {
  const navigate = useNavigate();
  const [activeTool, setActiveTool] = useState<ActiveTool>("generator");
  const { toast } = useToast();
  const { trackUsage, getVoiceEditCredits, getQualityAnalysisCredits, getQualityAnalysisBreakdown, clearHistory: clearCreditHistory } = useCreditTracking();
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingSectionTitle, setRegeneratingSectionTitle] = useState<string | null>(null);
  const [regeneratingAllSections, setRegeneratingAllSections] = useState(false);

  // Regenerate a single section against the supplied content snapshot.
  // Returns the updated content (or null if the section was not found).
  // Used by both the per-section button and the "Fix all sections" batch runner.
  const regenerateOneSection = async (
    sectionTitle: string,
    sourceContent: string,
  ): Promise<{ updated: string | null }> => {
    const lines = sourceContent.split("\n");
    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i]) && lines[i].replace(/^##\s+/, "").trim() === sectionTitle) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) return { updated: null };
    let endIdx = lines.length;
    for (let j = startIdx + 1; j < lines.length; j++) {
      if (/^##\s+/.test(lines[j])) { endIdx = j; break; }
    }
    const sectionMarkdown = lines.slice(startIdx, endIdx).join("\n").trim();

    let toneProfile = null;
    if (selectedToneProfileId) {
      const { data: profileData } = await supabase
        .from("tone_profiles")
        .select("*")
        .eq("id", selectedToneProfileId)
        .maybeSingle();
      if (profileData) toneProfile = profileData;
    }

    const { data, error } = await supabase.functions.invoke("regenerate-section", {
      body: {
        sectionMarkdown,
        sectionTitle,
        topic: formData.topic,
        toneProfile,
        useFirstPerson,
      },
    });
    if (error) throw error;
    const newSection = (data?.content || "").trim();
    if (!newSection) throw new Error("Empty response");
    const before = lines.slice(0, startIdx).join("\n").replace(/\s+$/, "");
    const after = lines.slice(endIdx).join("\n").replace(/^\s+/, "");
    return { updated: [before, newSection, after].filter(Boolean).join("\n\n") };
  };
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEnhancingImport, setIsEnhancingImport] = useState(false);
  const [isApplyingFormat, setIsApplyingFormat] = useState(false);
  const [showFormatProgress, setShowFormatProgress] = useState(false);
  const [formatSteps, setFormatSteps] = useState<FormatStep[]>(DEFAULT_FORMAT_STEPS);
  const [formatError, setFormatError] = useState<string | null>(null);
  const pendingApplyFormatRef = useRef(false);
  const pendingAutoRerunRef = useRef(localStorage.getItem("seo-generator-autoRerun") === "true");
  const [isRerunning, setIsRerunning] = useState(false);
  
  // Snapshot of settings when an article was loaded - used to diff for smart rerun
  const loadedSettingsSnapshotRef = useRef<{
    topic: string;
    length: string;
    outline: string;
    instructions: string;
    keywords: string[];
    toneProfileId: string | null;
    useKnowledgeBase: boolean;
    valuePromise: string;
    selectedAngles: string[];
    selectedGapInsights: string[];
    selectedAngleGaps: string[];
    gapAnalysis: string;
    formatReference: string;
    contextFiles: { name: string; content: string }[];
    targetLength: string;
  } | null>(null);
  const [generatedContent, setGeneratedContentRaw] = useState(() => {
    const saved = localStorage.getItem("seo-generator-generatedContent");
    return saved ? normalizeQuickTipsSection(cleanContent(saved)) : "";
  });
  
  // Store the original generated content for reset functionality
  const [originalContent, setOriginalContent] = useState(() => {
    const saved = localStorage.getItem("seo-generator-originalContent");
    return saved ? normalizeQuickTipsSection(cleanContent(saved)) : "";
  });
  
  // Track if content has been modified since generation
  const hasContentChanges = generatedContent !== originalContent && originalContent.length > 0;
  
  // Wrapper that auto-cleans content before setting
  const setGeneratedContent = (content: string, isNewGeneration = false) => {
    const cleaned = normalizeQuickTipsSection(cleanContent(content));
    setGeneratedContentRaw(cleaned);
    // If this is a new generation (not an edit), save as original
    if (isNewGeneration) {
      setOriginalContent(cleaned);
      localStorage.setItem("seo-generator-originalContent", cleaned);
    }
  };
  
  // Reset to original content
  const handleResetContent = () => {
    if (originalContent) {
      setGeneratedContent(originalContent);
      toast({
        title: "Content reset",
        description: "Restored to the original generated version.",
      });
    }
  };

  // One-time migration: normalize previously saved content already in localStorage/state
  useEffect(() => {
    const savedGenerated = localStorage.getItem("seo-generator-generatedContent");
    if (savedGenerated) {
      const normalizedGenerated = normalizeQuickTipsSection(cleanContent(savedGenerated));
      if (normalizedGenerated !== savedGenerated) {
        setGeneratedContentRaw(normalizedGenerated);
        localStorage.setItem("seo-generator-generatedContent", normalizedGenerated);
      }
    }

    const savedOriginal = localStorage.getItem("seo-generator-originalContent");
    if (savedOriginal) {
      const normalizedOriginal = normalizeQuickTipsSection(cleanContent(savedOriginal));
      if (normalizedOriginal !== savedOriginal) {
        setOriginalContent(normalizedOriginal);
        localStorage.setItem("seo-generator-originalContent", normalizedOriginal);
      }
    }
  }, []);

  const [isSavingArticle, setIsSavingArticle] = useState(false);
  
  const handleSaveArticle = async () => {
    if (!generatedContent.trim()) return;
    
    setIsSavingArticle(true);
    try {
      // Extract title from content (first H1 or H2, or use topic)
      const titleMatch = generatedContent.match(/^#{1,2}\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].replace(/[*_]/g, "").trim() : formData.topic || "Untitled Article";
      
      const wordCount = generatedContent.split(/\s+/).filter(Boolean).length;
      
      const { error } = await (supabase.from("saved_articles") as any).insert({
        title,
        topic: formData.topic,
        generated_content: generatedContent,
        original_content: originalContent || null,
        value_promise: valuePromise || null,
        gap_analysis: gapAnalysis || null,
        format_reference: formatReference || null,
        outline: formData.outline || null,
        instructions: formData.instructions || null,
        keywords: keywords.length > 0 ? keywords : [],
        target_length: formData.length || "medium",
        competitor_urls: competitorUrls.filter(u => u.trim()),
        selected_angles: selectedAngles,
        selected_gap_insights: selectedGapInsights,
        tone_profile_id: selectedToneProfileId || null,
        use_knowledge_base: useKnowledgeBase,
        context_file_names: contextFiles.map(f => f.name),
        cta_url: ctaUrl || null,
        generated_ctas: generatedCTAs || null,
        color_palette: selectedColorPalette?.id || null,
        article_images: articleImages.length > 0 ? articleImages : null,
        applied_rules: appliedRules || null,
        word_count: wordCount,
      });
      
      if (error) throw error;
      
      toast({
        title: "Article saved!",
        description: `"${title}" saved with all settings.`,
      });
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save article",
        variant: "destructive",
      });
    } finally {
      setIsSavingArticle(false);
    }
  };
  const [appliedRules, setAppliedRules] = useState<{
    gapAnalysisUsed: boolean;
    formatReferenceUsed: boolean;
    contextFilesUsed: boolean;
    contextFileNames: string[];
    keywordsUsed: boolean;
    keywords: string[];
    targetWordCount: number;
    outlineProvided: boolean;
    customInstructionsProvided: boolean;
    knowledgeBaseUsed?: boolean;
    knowledgeRulesCount?: number;
    toneProfileUsed?: boolean;
  } | null>(() => {
    const saved = localStorage.getItem("seo-generator-appliedRules");
    return saved ? JSON.parse(saved) : null;
  });
  const [generatedCTAs, setGeneratedCTAs] = useState<{ middle: { headline: string; description: string; buttonText: string }; end: { headline: string; description: string; buttonText: string } } | null>(() => {
    const saved = localStorage.getItem("seo-generator-generatedCTAs");
    return saved ? JSON.parse(saved) : null;
  });
  const [gapAnalysis, setGapAnalysis] = useState(() => {
    const saved = localStorage.getItem("seo-generator-gapAnalysis");
    return saved || "";
  });
  const [formatReference, setFormatReference] = useState(() => {
    const saved = localStorage.getItem("seo-generator-formatReference");
    return saved || "";
  });
  
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem("seo-generator-formData");
    const defaults = {
      topic: "",
      length: "medium",
      outline: "",
      instructions: "",
      firstHandEvidence: "",
    };
    if (!saved) return defaults;
    try {
      return { ...defaults, ...JSON.parse(saved) };
    } catch {
      return defaults;
    }
  });

  const [competitorUrls, setCompetitorUrls] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-competitorUrls");
    return saved ? JSON.parse(saved) : ["", "", ""];
  });
  const [formatUrl, setFormatUrl] = useState(() => {
    const saved = localStorage.getItem("seo-generator-formatUrl");
    return saved || "";
  });
  const [formatUrlHistory, setFormatUrlHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-formatUrlHistory");
    return saved ? JSON.parse(saved) : [];
  });
  const [contextFiles, setContextFiles] = useState<{ name: string; content: string }[]>(() => {
    const saved = localStorage.getItem("seo-generator-contextFiles");
    return saved ? JSON.parse(saved) : [];
  });
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [keywords, setKeywords] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-keywords");
    const parsed: string[] = saved ? JSON.parse(saved) : [];
    // Strip "(volume)" suffixes like "keyword (50)" that may come from keyword research imports
    return parsed.map((k) => k.replace(/\s*\(\s*[\d,]+\s*\)\s*$/, "").replace(/\s*\(\s*\?\s*\)\s*$/, "").trim()).filter((k) => k.length > 0);
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [ctaUrl, setCtaUrl] = useState(() => {
    const saved = localStorage.getItem("seo-generator-ctaUrl");
    return saved || "";
  });
  const [ctaUrlHistory, setCtaUrlHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-ctaUrlHistory");
    return saved ? JSON.parse(saved) : [];
  });
  const [internalLinkHistory, setInternalLinkHistory] = useState<string[]>([]);
  
  const [selectedColorPalette, setSelectedColorPalette] = useState<ColorPalette | null>(() => {
    const saved = localStorage.getItem("seo-generator-colorPalette");
    if (saved) {
      const id = JSON.parse(saved);
      return COLOR_PALETTES.find(p => p.id === id) || null;
    }
    return COLOR_PALETTES[0]; // Default to purple
  });

  const isDarkSitePalette = selectedColorPalette?.id === "dark-transparent";
  const articlePaletteStyles = selectedColorPalette
    ? ({
        "--brand-primary": selectedColorPalette.primary,
        "--brand-secondary": selectedColorPalette.secondary,
        "--brand-accent": selectedColorPalette.accent,
        "--brand-text": isDarkSitePalette ? "#e5e7eb" : "hsl(var(--foreground))",
        "--brand-panel-bg": isDarkSitePalette ? "rgba(255,255,255,0.06)" : "hsl(var(--tldr-bg))",
        "--brand-panel-text": isDarkSitePalette ? "#ffffff" : "hsl(var(--foreground))",
        "--brand-table-row-odd": isDarkSitePalette ? "rgba(255,255,255,0.04)" : "hsl(var(--table-row-odd))",
        "--brand-table-row-even": isDarkSitePalette ? "rgba(255,255,255,0.08)" : "hsl(var(--table-row-even))",
        "--brand-table-border": isDarkSitePalette ? "rgba(255,255,255,0.2)" : "hsl(var(--border))",
        "--brand-table-header-text": isDarkSitePalette ? "#000000" : "#ffffff",
      } as React.CSSProperties)
    : undefined;
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(() => {
    const saved = localStorage.getItem("seo-generator-useKnowledgeBase");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [skipNavigation, setSkipNavigation] = useState(() => {
    const saved = localStorage.getItem("seo-generator-skipNavigation");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [skipFaqs, setSkipFaqs] = useState(() => {
    const saved = localStorage.getItem("seo-generator-skipFaqs");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [skipQuickTips, setSkipQuickTips] = useState(() => {
    const saved = localStorage.getItem("seo-generator-skipQuickTips");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [skipSources, setSkipSources] = useState(() => {
    const saved = localStorage.getItem("seo-generator-skipSources");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [generateFaqSchema, setGenerateFaqSchema] = useState(() => {
    const saved = localStorage.getItem("seo-generator-generateFaqSchema");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [includeTrustSignal, setIncludeTrustSignal] = useState<boolean>(() => {
    const saved = localStorage.getItem("seo-generator-includeTrustSignal");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [trustSignalTitle, setTrustSignalTitle] = useState<string>(() => {
    return localStorage.getItem("seo-generator-trustSignalTitle") || "Why You Can Trust This Article";
  });
  const [trustSignalContent, setTrustSignalContent] = useState<string>(() => {
    return (
      localStorage.getItem("seo-generator-trustSignalContent") ||
      "This guide is written and reviewed by our in-house editorial team with hands-on experience in the topic. We cite primary sources, government and academic data, and recognised industry references — never AI summaries — and update our articles as new evidence emerges.\n\n- Edited by qualified subject-matter reviewers\n- Sources verified against the latest available data\n- Independent recommendations, not sponsored opinions"
    );
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [useFirstPerson, setUseFirstPerson] = useState<boolean>(() => {
    return localStorage.getItem("seo-generator-useFirstPerson") === "true";
  });
  const [selectedToneProfileId, setSelectedToneProfileId] = useState<string | null>(() => {
    const saved = localStorage.getItem("seo-generator-toneProfileId");
    return saved || null;
  });
  const [valuePromiseClaims, setValuePromiseClaims] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-valuePromiseClaims");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fall through */ }
    }
    // Migrate from old single string format
    const oldSaved = localStorage.getItem("seo-generator-valuePromise");
    if (oldSaved) return [oldSaved, "", "", "", ""];
    return ["", "", "", "", ""];
  });
  // Derived combined string for downstream compatibility
  const valuePromise = valuePromiseClaims.filter(c => c.trim()).join("; ");
  const setValuePromise = (val: string | ((prev: string) => string)) => {
    if (typeof val === "function") {
      // For voice input callback compatibility - append to first non-empty or first claim
      setValuePromiseClaims(prev => {
        const combined = prev.filter(c => c.trim()).join("; ");
        const newVal = val(combined);
        return [newVal, prev[1] || "", prev[2] || "", prev[3] || "", prev[4] || ""];
      });
    } else if (val === "") {
      setValuePromiseClaims(["", "", "", "", ""]);
    } else {
      setValuePromiseClaims(prev => [val, prev[1] || "", prev[2] || "", prev[3] || "", prev[4] || ""]);
    }
  };
  const [selectedAngles, setSelectedAngles] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-selectedAngles");
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedGapInsights, setSelectedGapInsights] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-selectedGapInsights");
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedAngleGaps, setSelectedAngleGaps] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-selectedAngleGaps");
    return saved ? JSON.parse(saved) : [];
  });
  const [articleImages, setArticleImages] = useState<ArticleImage[]>(() => {
    const saved = localStorage.getItem("seo-generator-articleImages");
    return saved ? JSON.parse(saved) : [];
  });
  const [internalLinks, setInternalLinks] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-internalLinks");
    return saved ? JSON.parse(saved) : [""];
  });
  const [isInsertingLinks, setIsInsertingLinks] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dropTargetElement, setDropTargetElement] = useState<HTMLElement | null>(null);
  const [isAllocatingImages, setIsAllocatingImages] = useState(false);
  const [isImagePopoverOpen, setIsImagePopoverOpen] = useState(false);
  const [cursorInsertPosition, setCursorInsertPosition] = useState<number | null>(null);
  
  // Human mode (4-stage pipeline) state
  const [useHumanMode, setUseHumanMode] = useState(() => {
    const saved = localStorage.getItem("seo-generator-useHumanMode");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [currentPipelineStage, setCurrentPipelineStage] = useState(0);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const [pipelineError, setPipelineError] = useState<string | undefined>();
  const [isHumanisingOnly, setIsHumanisingOnly] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

  // Voice input for Value Promise
  const {
    isListening: isListeningValuePromise,
    isSupported: isVoiceSupported,
    toggleListening: toggleValuePromiseListening,
  } = useSpeechToText({
    onResult: useCallback((transcript: string) => {
      setValuePromise((prev) => prev ? `${prev} ${transcript}` : transcript);
    }, []),
    onError: useCallback((error: string) => {
      toast({
        title: "Voice input error",
        description: error === "not-allowed" 
          ? "Microphone access was denied. Please enable it in your browser settings."
          : `Speech recognition error: ${error}`,
        variant: "destructive",
      });
    }, [toast]),
  });

  // Persist form data to localStorage
  useEffect(() => {
    localStorage.setItem("seo-generator-formData", JSON.stringify(formData));
  }, [formData]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-competitorUrls", JSON.stringify(competitorUrls));
  }, [competitorUrls]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-formatUrl", formatUrl);
  }, [formatUrl]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-formatUrlHistory", JSON.stringify(formatUrlHistory));
  }, [formatUrlHistory]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-formatReference", formatReference);
  }, [formatReference]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-gapAnalysis", gapAnalysis);
  }, [gapAnalysis]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-contextFiles", JSON.stringify(contextFiles));
  }, [contextFiles]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-keywords", JSON.stringify(keywords));
  }, [keywords]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-ctaUrl", ctaUrl);
  }, [ctaUrl]);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-ctaUrlHistory", JSON.stringify(ctaUrlHistory));
  }, [ctaUrlHistory]);
  
  // Load internal link history from database on mount
  useEffect(() => {
    const loadHistory = async () => {
      const { data } = await supabase
        .from("internal_link_history")
        .select("url")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data && data.length > 0) {
        setInternalLinkHistory(data.map(d => d.url));
      }
    };
    loadHistory();
  }, []);

  // Sync internal link history changes to database
  const addToInternalLinkHistoryDb = useCallback(async (urls: string[]) => {
    for (const url of urls) {
      await supabase
        .from("internal_link_history")
        .upsert({ url }, { onConflict: "url" });
    }
  }, []);
  
  useEffect(() => {
    localStorage.setItem("seo-generator-useKnowledgeBase", JSON.stringify(useKnowledgeBase));
  }, [useKnowledgeBase]);

  useEffect(() => {
    localStorage.setItem("seo-generator-skipNavigation", JSON.stringify(skipNavigation));
  }, [skipNavigation]);

  useEffect(() => {
    localStorage.setItem("seo-generator-skipFaqs", JSON.stringify(skipFaqs));
  }, [skipFaqs]);

  useEffect(() => {
    localStorage.setItem("seo-generator-skipQuickTips", JSON.stringify(skipQuickTips));
  }, [skipQuickTips]);

  useEffect(() => {
    localStorage.setItem("seo-generator-skipSources", JSON.stringify(skipSources));
  }, [skipSources]);

  useEffect(() => {
    localStorage.setItem("seo-generator-generateFaqSchema", JSON.stringify(generateFaqSchema));
  }, [generateFaqSchema]);

  useEffect(() => {
    localStorage.setItem("seo-generator-includeTrustSignal", JSON.stringify(includeTrustSignal));
  }, [includeTrustSignal]);

  useEffect(() => {
    localStorage.setItem("seo-generator-trustSignalTitle", trustSignalTitle);
  }, [trustSignalTitle]);

  useEffect(() => {
    localStorage.setItem("seo-generator-trustSignalContent", trustSignalContent);
  }, [trustSignalContent]);
  
  useEffect(() => {
    if (selectedToneProfileId) {
      localStorage.setItem("seo-generator-toneProfileId", selectedToneProfileId);
    } else {
      localStorage.removeItem("seo-generator-toneProfileId");
    }
  }, [selectedToneProfileId]);

  useEffect(() => {
    localStorage.setItem("seo-generator-useFirstPerson", String(useFirstPerson));
  }, [useFirstPerson]);

  useEffect(() => {
    localStorage.setItem("seo-generator-valuePromiseClaims", JSON.stringify(valuePromiseClaims));
  }, [valuePromiseClaims]);

  useEffect(() => {
    localStorage.setItem("seo-generator-selectedAngles", JSON.stringify(selectedAngles));
  }, [selectedAngles]);

  useEffect(() => {
    localStorage.setItem("seo-generator-selectedGapInsights", JSON.stringify(selectedGapInsights));
  }, [selectedGapInsights]);

  useEffect(() => {
    localStorage.setItem("seo-generator-selectedAngleGaps", JSON.stringify(selectedAngleGaps));
  }, [selectedAngleGaps]);

  // Persist color palette selection
  useEffect(() => {
    if (selectedColorPalette) {
      localStorage.setItem("seo-generator-colorPalette", JSON.stringify(selectedColorPalette.id));
    } else {
      localStorage.removeItem("seo-generator-colorPalette");
    }
  }, [selectedColorPalette]);

  // Persist article images
  useEffect(() => {
    localStorage.setItem("seo-generator-articleImages", JSON.stringify(articleImages));
  }, [articleImages]);

  // Persist internal links
  useEffect(() => {
    localStorage.setItem("seo-generator-internalLinks", JSON.stringify(internalLinks));
  }, [internalLinks]);

  // Persist human mode preference
  useEffect(() => {
    localStorage.setItem("seo-generator-useHumanMode", JSON.stringify(useHumanMode));
  }, [useHumanMode]);

  // Persist generated content
  useEffect(() => {
    localStorage.setItem("seo-generator-generatedContent", generatedContent);
  }, [generatedContent]);

  // Persist applied rules
  useEffect(() => {
    if (appliedRules) {
      localStorage.setItem("seo-generator-appliedRules", JSON.stringify(appliedRules));
    } else {
      localStorage.removeItem("seo-generator-appliedRules");
    }
  }, [appliedRules]);

  // Persist generated CTAs
  useEffect(() => {
    if (generatedCTAs) {
      localStorage.setItem("seo-generator-generatedCTAs", JSON.stringify(generatedCTAs));
    } else {
      localStorage.removeItem("seo-generator-generatedCTAs");
    }
  }, [generatedCTAs]);

  // Checklist items computation
  const checklistItems = useMemo(() => {
    const hasCompetitorUrls = competitorUrls.some((url) => url.trim());
    const hasGapAnalysis = gapAnalysis.trim().length > 0;
    const hasFormatReference = formatReference.trim().length > 0;
    const hasContextFiles = contextFiles.length > 0;
    const hasTopic = formData.topic.trim().length > 0;
    const hasKeywords = keywords.length > 0;
    const topKeywords = keywords.slice(0, 5);
    const filledClaims = valuePromiseClaims.filter(c => c.trim()).length;
    const hasValuePromise = filledClaims > 0;
    const hasSelectedAngles = selectedAngles.length > 0;
    const hasSelectedGapInsights = selectedGapInsights.length > 0;
    const hasSelectedAngleGaps = selectedAngleGaps.length > 0;
    const totalAngles = selectedAngles.length + selectedGapInsights.length + selectedAngleGaps.length;

    const angleParts: string[] = [];
    if (hasSelectedGapInsights) angleParts.push(`${selectedGapInsights.length} from gaps`);
    if (hasSelectedAngles) angleParts.push(`${selectedAngles.length} unique`);
    if (hasSelectedAngleGaps) angleParts.push(`${selectedAngleGaps.length} info gaps`);

    return [
      {
        id: "unique-angles",
        label: totalAngles > 0
          ? `Angles selected: ${totalAngles} (${angleParts.join(" + ")})`
          : "Angles selected (from gap analysis or unique angles)",
        completed: totalAngles > 0,
        required: false,
      },
      {
        id: "keywords",
        label: hasKeywords 
          ? `Keywords (top 5 will be used): ${topKeywords.join(", ")}${keywords.length > 5 ? ` (+${keywords.length - 5} more)` : ""}`
          : "SEO keywords added (up to 10, top 5 used in article)",
        completed: hasKeywords,
        required: false,
      },
      {
        id: "gap-analysis",
        label: "Content gap analysis completed",
        completed: hasGapAnalysis,
        required: false,
      },
      {
        id: "format-reference",
        label: "Format reference captured (TL;DR as H2, colored tables)",
        completed: hasFormatReference,
        required: false,
      },
      {
        id: "context-files",
        label: hasContextFiles 
          ? `Context files uploaded: ${contextFiles.map(f => f.name).join(", ")}`
          : "Context files uploaded (sources/references will be cited)",
        completed: hasContextFiles,
        required: false,
      },
      {
        id: "word-count",
        label: `Word count selected (${
          formData.length === "short" ? "~500" : 
          formData.length === "medium" ? "~1000" : 
          formData.length === "medium-long" ? "~1500" :
          formData.length === "long" ? "~2000" :
          formData.length === "extended" ? "~3000" : "~3500"
        } words)`,
        completed: true, // Always completed since there's a default
        required: true,
      },
    ];
  }, [competitorUrls, gapAnalysis, formatReference, contextFiles, formData.topic, formData.length, keywords, valuePromise, selectedAngles, selectedGapInsights, selectedAngleGaps]);

  const handleAnalyzeUrls = async () => {
    const validUrls = competitorUrls.filter((url) => url.trim());
    if (validUrls.length === 0) {
      toast({
        title: "URLs required",
        description: "Please enter at least one competitor URL.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setGapAnalysis("");

    try {
      const { data, error } = await supabase.functions.invoke("analyze-urls", {
        body: { urls: validUrls, topic: formData.topic },
      });

      if (error) throw error;

      setGapAnalysis(data.gapAnalysis);
      toast({
        title: "Analysis complete!",
        description: `Analyzed ${data.articles.length} article(s).`,
      });
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to analyze URLs",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFetchFormat = async () => {
    if (!formatUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a URL to use as format reference.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("scrape-format", {
        body: { url: formatUrl },
      });

      if (error) throw error;

      setFormatReference(data.markdown);
      
      // Add to history (avoid duplicates, keep max 10)
      setFormatUrlHistory(prev => {
        const filtered = prev.filter(u => u !== formatUrl.trim());
        return [formatUrl.trim(), ...filtered].slice(0, 10);
      });
      
      toast({
        title: "Format captured!",
        description: `Using format from: ${data.title}`,
      });
    } catch (error) {
      console.error("Format fetch error:", error);
      toast({
        title: "Failed to fetch format",
        description: error instanceof Error ? error.message : "Could not scrape the URL",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingFile(true);

    try {
      for (const file of Array.from(files)) {
        // Sanitize filename: remove special characters that Supabase storage doesn't accept
        const sanitizedName = file.name
          .replace(/['']/g, "") // Remove apostrophes
          .replace(/[^\w\s.-]/g, "_"); // Replace other special chars with underscore
        const filePath = `${Date.now()}-${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from("context-files")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Parse the file content
        const { data, error: parseError } = await supabase.functions.invoke(
          "parse-context-file",
          { body: { filePath, fileName: file.name } }
        );

        if (parseError) throw parseError;

        setContextFiles((prev) => [
          ...prev,
          { name: file.name, content: data.content },
        ]);

        toast({
          title: "File uploaded",
          description: `${file.name} added as context${data.truncated ? " (truncated to 10k chars)" : ""}`,
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploadingFile(false);
      e.target.value = "";
    }
  };

  // Human mode pipeline generation
  const handleHumanModeGenerate = async () => {
    // Initialize pipeline stages
    const stages: PipelineStage[] = [
      { id: "brief", name: "Create Brief", description: "Planning article structure and key claims", status: "pending" },
      { id: "sections", name: "Write Sections", description: "Writing each section atomically", status: "pending", substeps: [] },
      { id: "humanise", name: "Humanise Rewrite", description: "Applying style transformations", status: "pending" },
      { id: "gate", name: "Quality Gate", description: "Checking for AI patterns", status: "pending" },
    ];
    setPipelineStages(stages);
    setCurrentPipelineStage(0);
    setPipelineError(undefined);

    // Map length to word count
    const wordCounts: Record<string, number> = {
      short: 500, medium: 1000, "medium-long": 1500, long: 2000, extended: 3000, comprehensive: 3500,
    };
    const targetWords = wordCounts[formData.length] || 1000;

    // Fetch knowledge rules if enabled
    let knowledgeRules: string[] = [];
    if (useKnowledgeBase) {
      const { data: knowledgeData } = await supabase
        .from("seo_knowledge")
        .select("key_rules")
        .not("key_rules", "is", null);
      if (knowledgeData) {
        knowledgeRules = knowledgeData.flatMap((item) => item.key_rules || []);
      }
    }

    // Fetch tone profile if selected
    let toneProfile = null;
    if (selectedToneProfileId) {
      const { data: profileData } = await supabase
        .from("tone_profiles")
        .select("summary, characteristics, example_phrases")
        .eq("id", selectedToneProfileId)
        .maybeSingle();
      if (profileData) {
        toneProfile = profileData;
      }
    }

    // Stage 1: Create Brief
    stages[0].status = "running";
    setPipelineStages([...stages]);

    const { data: briefData, error: briefError } = await supabase.functions.invoke("humanise-create-brief", {
      body: {
        topic: formData.topic,
        valuePromise: valuePromise || undefined,
        gapAnalysis: gapAnalysis || undefined,
        contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
        uniqueAngles: [...selectedGapInsights, ...selectedAngles, ...selectedAngleGaps].length > 0 ? [...selectedGapInsights, ...selectedAngles, ...selectedAngleGaps] : undefined,
        targetWords,
        keywords: keywords.length > 0 ? keywords.slice(0, 5) : undefined,
      },
    });

    if (briefError || !briefData?.brief) {
      throw new Error(briefError?.message || "Failed to create brief");
    }

    const brief = briefData.brief;
    stages[0].status = "completed";
    setCurrentPipelineStage(1);

    // Stage 2: Write Sections
    stages[1].status = "running";
    stages[1].substeps = brief.sections.map((s: { h2: string }) => ({ name: s.h2, status: "pending" as const }));
    setPipelineStages([...stages]);
    setTotalSections(brief.sections.length);

    const sectionContents: string[] = [];
    for (let i = 0; i < brief.sections.length; i++) {
      setCurrentSectionIndex(i);
      stages[1].substeps![i].status = "running";
      setPipelineStages([...stages]);

      const { data: sectionData, error: sectionError } = await supabase.functions.invoke("humanise-write-section", {
        body: {
          section: brief.sections[i],
          sectionIndex: i,
          totalSections: brief.sections.length,
          audience: brief.audience,
          intent: brief.intent,
          angle: brief.angle,
          keyClaims: brief.keyClaims,
          toneProfile,
          knowledgeRules: knowledgeRules.slice(0, 20),
          useFirstPerson,
        },
      });

      if (sectionError) {
        throw new Error(`Failed to write section ${i + 1}: ${sectionError.message}`);
      }

      sectionContents.push(sectionData.content);
      stages[1].substeps![i].status = "completed";
      setPipelineStages([...stages]);
    }

    stages[1].status = "completed";
    setCurrentPipelineStage(2);

    // Assemble draft with title
    let draft = `# ${formData.topic}\n\n${sectionContents.join("\n\n")}`;

    // Stage 3: Humanise Rewrite
    stages[2].status = "running";
    setPipelineStages([...stages]);

    const { data: rewriteData, error: rewriteError } = await supabase.functions.invoke("humanise-rewrite", {
      body: {
        draft,
        knowledgeRules: knowledgeRules.slice(0, 20),
        toneProfile,
        useFirstPerson,
      },
    });

    if (rewriteError) {
      throw new Error(`Failed to humanise content: ${rewriteError.message}`);
    }

    draft = rewriteData.content;
    stages[2].status = "completed";
    setCurrentPipelineStage(3);

    // Stage 4: Quality Gate
    stages[3].status = "running";
    setPipelineStages([...stages]);

    const { data: gateData, error: gateError } = await supabase.functions.invoke("humanise-quality-gate", {
      body: { draft, valuePromise },
    });

    if (gateError) {
      throw new Error(`Quality gate failed: ${gateError.message}`);
    }

    // If quality gate failed, try one more rewrite pass
    if (!gateData.passed && gateData.issues?.length > 0) {
      console.log("Quality gate failed, attempting fix pass...", gateData);
      
      const { data: fixData, error: fixError } = await supabase.functions.invoke("humanise-rewrite", {
        body: {
          draft,
          issues: gateData.issues,
          toneProfile,
          useFirstPerson,
        },
      });

      if (!fixError && fixData?.content) {
        draft = fixData.content;
      }
    }

    stages[3].status = "completed";
    setPipelineStages([...stages]);

    return draft;
  };

  // Humanise Only mode - runs just Stage 3 + 4 on existing content (saves ~4 credits)
  const handleHumaniseOnly = async () => {
    if (!generatedContent.trim()) {
      toast({
        title: "No content to humanise",
        description: "Generate or import content first.",
        variant: "destructive",
      });
      return;
    }

    setIsHumanisingOnly(true);
    
    // Initialize just the humanise stages
    const stages: PipelineStage[] = [
      { id: "humanise", name: "Humanise Rewrite", description: "Applying style transformations", status: "pending" },
      { id: "gate", name: "Quality Gate", description: "Checking for AI patterns", status: "pending" },
    ];
    setPipelineStages(stages);
    setCurrentPipelineStage(0);
    setPipelineError(undefined);

    try {
      // Fetch knowledge rules if enabled
      let knowledgeRules: string[] = [];
      if (useKnowledgeBase) {
        const { data: knowledgeData } = await supabase
          .from("seo_knowledge")
          .select("key_rules")
          .not("key_rules", "is", null);
        if (knowledgeData) {
          knowledgeRules = knowledgeData.flatMap((item) => item.key_rules || []);
        }
      }

      // Fetch tone profile if selected
      let toneProfile = null;
      if (selectedToneProfileId) {
        const { data: profileData } = await supabase
          .from("tone_profiles")
          .select("summary, characteristics, example_phrases")
          .eq("id", selectedToneProfileId)
          .maybeSingle();
        if (profileData) {
          toneProfile = profileData;
        }
      }

      let draft = generatedContent;

      // Stage 1 (of 2): Humanise Rewrite
      stages[0].status = "running";
      setPipelineStages([...stages]);

      const { data: rewriteData, error: rewriteError } = await supabase.functions.invoke("humanise-rewrite", {
        body: {
          draft,
          knowledgeRules: knowledgeRules.slice(0, 20),
          toneProfile,
          useFirstPerson,
        },
      });

      if (rewriteError) {
        throw new Error(`Failed to humanise content: ${rewriteError.message}`);
      }

      draft = rewriteData.content;
      stages[0].status = "completed";
      setCurrentPipelineStage(1);

      // Stage 2 (of 2): Quality Gate
      stages[1].status = "running";
      setPipelineStages([...stages]);

      const { data: gateData, error: gateError } = await supabase.functions.invoke("humanise-quality-gate", {
        body: { draft, valuePromise },
      });

      if (gateError) {
        throw new Error(`Quality gate failed: ${gateError.message}`);
      }

      // If quality gate failed, try one more rewrite pass
      if (!gateData.passed && gateData.issues?.length > 0) {
        console.log("Quality gate failed, attempting fix pass...", gateData);
        
        const { data: fixData, error: fixError } = await supabase.functions.invoke("humanise-rewrite", {
          body: {
            draft,
            issues: gateData.issues,
            toneProfile,
            useFirstPerson,
          },
        });

        if (!fixError && fixData?.content) {
          draft = fixData.content;
        }
      }

      stages[1].status = "completed";
      setPipelineStages([...stages]);

      setGeneratedContent(draft, true);
      
      toast({
        title: "Content humanised!",
        description: "Stage 3 + 4 complete. Saved ~4 credits vs full pipeline.",
      });
    } catch (error) {
      console.error("Humanise only error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to humanise content";
      setPipelineError(errorMessage);
      toast({
        title: "Humanise failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsHumanisingOnly(false);
    }
  };

  const handleGenerate = async () => {
    if (!formData.topic.trim()) {
      toast({
        title: "Topic required",
        description: "Please enter a topic for your content.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedContent("");
    setAppliedRules(null);

    try {
      let content: string;

      if (useHumanMode) {
        // Use 4-stage humanising pipeline
        content = await handleHumanModeGenerate();
        
        toast({
          title: "Human-like content generated!",
          description: "4-stage pipeline complete. Review the result.",
        });
      } else {
        // Use original quick generation
        let enhancedInstructions = formData.instructions || "";
        
        const allAngles = [...selectedGapInsights, ...selectedAngles, ...selectedAngleGaps];
        if (allAngles.length > 0) {
          enhancedInstructions += `\n\nUNIQUE ANGLES TO INCORPORATE:\n${allAngles.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\nUse these angles to differentiate this content from competitors.`;
        }

        const filledClaims = valuePromiseClaims.filter(c => c.trim());

        const { data, error } = await supabase.functions.invoke("generate-content", {
          body: {
            ...formData,
            instructions: enhancedInstructions,
            keywords: keywords.length > 0 ? keywords.slice(0, 5) : undefined,
            gapAnalysis: gapAnalysis || undefined,
            formatReference: formatReference || undefined,
            contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
            generateCTAs: ctaUrl.trim().length > 0,
            ctaUrl: ctaUrl.trim() || undefined,
            useKnowledgeBase: useKnowledgeBase,
            toneProfileId: selectedToneProfileId || undefined,
            valuePromiseClaims: filledClaims.length > 0 ? filledClaims : undefined,
            useFirstPerson,
            skipFaqs,
            skipQuickTips,
            skipSources,
            firstHandEvidence: formData.firstHandEvidence?.trim() || undefined,
          },
        });

        if (error) throw error;

        content = data.content;
        setAppliedRules(data.appliedRules || null);
        if (data.ctas) {
          console.log("CTAs received from API:", data.ctas);
          setGeneratedCTAs(data.ctas);
          
          if (ctaUrl.trim()) {
            setCtaUrlHistory(prev => {
              const filtered = prev.filter(u => u !== ctaUrl.trim());
              return [ctaUrl.trim(), ...filtered].slice(0, 10);
            });
          }
          
          // Save internal links to history
          const validInternalUrls = internalLinks.filter(u => u.trim());
           if (validInternalUrls.length > 0) {
             setInternalLinkHistory(prev => {
               const newHistory = [...prev];
               validInternalUrls.forEach(url => {
                 const trimmed = url.trim();
                 const idx = newHistory.indexOf(trimmed);
                 if (idx !== -1) newHistory.splice(idx, 1);
                 newHistory.unshift(trimmed);
               });
               return newHistory.slice(0, 100);
             });
             addToInternalLinkHistoryDb(validInternalUrls.map(u => u.trim()));
           }
        } else {
          setGeneratedCTAs(null);
        }
        
        // Show completeness guard results
        if (data.completenessGuard?.fixed?.length > 0) {
          toast({
            title: "Article auto-completed ✓",
            description: `Missing sections were auto-generated: ${data.completenessGuard.fixed.join(", ")}`,
          });
        } else {
          toast({
            title: "Content generated!",
            description: "Your article has been created successfully — all sections verified ✓",
          });
        }
      }

      setGeneratedContent(content, true);
    } catch (error) {
      console.error("Generation error:", error);
      setPipelineError(error instanceof Error ? error.message : "Failed to generate content");
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate content",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Capture settings snapshot on load (for smart rerun diffing)
  useEffect(() => {
    // If content exists on mount, snapshot current settings so Rerun can diff against them
    const hasContent = localStorage.getItem("seo-generator-generatedContent");
    if (hasContent) {
      loadedSettingsSnapshotRef.current = {
        topic: formData.topic,
        length: formData.length,
        outline: formData.outline,
        instructions: formData.instructions,
        keywords: [...keywords],
        toneProfileId: selectedToneProfileId,
        useKnowledgeBase,
        valuePromise,
        selectedAngles: [...selectedAngles],
        selectedGapInsights: [...selectedGapInsights],
        selectedAngleGaps: [...selectedAngleGaps],
        gapAnalysis,
        formatReference,
        contextFiles: contextFiles.map(f => ({ ...f })),
        targetLength: formData.length,
      };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart rerun - only applies changed settings to existing content
  const handleSmartRerun = async () => {
    const snapshot = loadedSettingsSnapshotRef.current;
    
    // If no snapshot exists, fall back to full regeneration
    if (!snapshot) {
      handleGenerate();
      return;
    }

    // Detect which settings changed
    const changedSettings: string[] = [];
    
    if (selectedToneProfileId !== snapshot.toneProfileId) changedSettings.push("toneProfileId");
    if (JSON.stringify(keywords) !== JSON.stringify(snapshot.keywords)) changedSettings.push("keywords");
    if (useKnowledgeBase !== snapshot.useKnowledgeBase) changedSettings.push("useKnowledgeBase");
    if (formData.instructions !== snapshot.instructions) changedSettings.push("instructions");
    if (valuePromise !== snapshot.valuePromise) changedSettings.push("valuePromise");
    if (JSON.stringify(selectedAngles) !== JSON.stringify(snapshot.selectedAngles)) changedSettings.push("selectedAngles");
    if (JSON.stringify(selectedGapInsights) !== JSON.stringify(snapshot.selectedGapInsights)) changedSettings.push("selectedGapInsights");
    if (JSON.stringify(selectedAngleGaps) !== JSON.stringify(snapshot.selectedAngleGaps)) changedSettings.push("selectedAngleGaps");
    if (gapAnalysis !== snapshot.gapAnalysis) changedSettings.push("gapAnalysis");
    if (formatReference !== snapshot.formatReference) changedSettings.push("formatReference");
    if (JSON.stringify(contextFiles.map(f => f.name)) !== JSON.stringify(snapshot.contextFiles.map(f => f.name))) changedSettings.push("contextFiles");
    if (formData.outline !== snapshot.outline) changedSettings.push("outline");
    if (formData.length !== snapshot.targetLength) changedSettings.push("targetLength");
    if (formData.topic !== snapshot.topic) changedSettings.push("topic");

    // If topic changed or no changes detected, do full regen
    if (changedSettings.includes("topic") || changedSettings.length === 0) {
      handleGenerate();
      return;
    }

    setIsRerunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("rerun-changes", {
        body: {
          existingContent: generatedContent,
          changedSettings,
          topic: formData.topic,
          keywords,
          toneProfileId: selectedToneProfileId,
          useKnowledgeBase,
          instructions: formData.instructions,
          valuePromise,
          selectedAngles,
          selectedGapInsights,
          selectedAngleGaps,
          gapAnalysis,
          formatReference,
          contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
          outline: formData.outline,
          targetLength: formData.length,
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content, true);

      // Update snapshot to current settings
      loadedSettingsSnapshotRef.current = {
        topic: formData.topic,
        length: formData.length,
        outline: formData.outline,
        instructions: formData.instructions,
        keywords: [...keywords],
        toneProfileId: selectedToneProfileId,
        useKnowledgeBase,
        valuePromise,
        selectedAngles: [...selectedAngles],
        selectedGapInsights: [...selectedGapInsights],
        selectedAngleGaps: [...selectedAngleGaps],
        gapAnalysis,
        formatReference,
        contextFiles: contextFiles.map(f => ({ ...f })),
        targetLength: formData.length,
      };

      toast({
        title: "Changes applied!",
        description: `Updated ${data.changeCount} setting(s): ${changedSettings.join(", ")}`,
      });
    } catch (error) {
      console.error("Smart rerun error:", error);
      toast({
        title: "Rerun failed",
        description: error instanceof Error ? error.message : "Failed to apply changes",
        variant: "destructive",
      });
    } finally {
      setIsRerunning(false);
    }
  };

  // Auto-rerun from saved articles page (full regen)
  useEffect(() => {
    if (pendingAutoRerunRef.current) {
      pendingAutoRerunRef.current = false;
      localStorage.removeItem("seo-generator-autoRerun");
      const timer = setTimeout(() => {
        if (formData.topic.trim()) {
          handleGenerate();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear only blog post settings (keep generated content)
  const handleClearSettings = () => {
    setFormData({
      topic: "",
      length: "medium",
      outline: "",
      instructions: "",
      firstHandEvidence: "",
    });
    setCompetitorUrls(["", "", ""]);
    setFormatUrl("");
    setFormatReference("");
    setGapAnalysis("");
    setContextFiles([]);
    setKeywords([]);
    setKeywordInput("");
    setCtaUrl("");
    setSelectedToneProfileId(null);
    setValuePromise("");
    setSelectedAngles([]);
    setSelectedGapInsights([]);
    setSelectedAngleGaps([]);
    setArticleImages([]);
    setInternalLinks([""]);
    
    // Clear settings from localStorage (keep content)
    localStorage.removeItem("seo-generator-formData");
    localStorage.removeItem("seo-generator-internalLinks");
    localStorage.removeItem("seo-generator-competitorUrls");
    localStorage.removeItem("seo-generator-formatUrl");
    localStorage.removeItem("seo-generator-formatReference");
    localStorage.removeItem("seo-generator-gapAnalysis");
    localStorage.removeItem("seo-generator-contextFiles");
    localStorage.removeItem("seo-generator-keywords");
    localStorage.removeItem("seo-generator-ctaUrl");
    localStorage.removeItem("seo-generator-useKnowledgeBase");
    localStorage.removeItem("seo-generator-toneProfileId");
    localStorage.removeItem("seo-generator-valuePromise");
    localStorage.removeItem("seo-generator-selectedAngles");
    localStorage.removeItem("seo-generator-selectedGapInsights");
    localStorage.removeItem("seo-generator-selectedAngleGaps");
    localStorage.removeItem("seo-generator-articleImages");
    
    toast({
      title: "Settings cleared",
      description: "Blog post settings have been reset. Generated content is preserved.",
    });
  };

  // Clear only generated content (keep settings)
  const handleClearContent = () => {
    setGeneratedContent("", true);
    setOriginalContent("");
    setAppliedRules(null);
    setGeneratedCTAs(null);
    
    // Clear content from localStorage (keep settings)
    localStorage.removeItem("seo-generator-generatedContent");
    localStorage.removeItem("seo-generator-appliedRules");
    localStorage.removeItem("seo-generator-generatedCTAs");
    localStorage.removeItem("seo-generator-originalContent");
    
    toast({
      title: "Content cleared",
      description: "Generated article has been cleared. Settings are preserved.",
    });
  };

  // Clear all form fields to start fresh
  const handleClearForm = () => {
    setFormData({
      topic: "",
      length: "medium",
      outline: "",
      instructions: "",
      firstHandEvidence: "",
    });
    setCompetitorUrls(["", "", ""]);
    setFormatUrl("");
    setFormatReference("");
    setGapAnalysis("");
    setContextFiles([]);
    setKeywords([]);
    setKeywordInput("");
    setCtaUrl("");
    setGeneratedCTAs(null);
    setGeneratedContent("", true);
    setOriginalContent("");
    setAppliedRules(null);
    setSelectedToneProfileId(null);
    setValuePromise("");
    setSelectedAngles([]);
    setSelectedGapInsights([]);
    setArticleImages([]);
    setInternalLinks([""]);
    
    // Clear localStorage
    localStorage.removeItem("seo-generator-formData");
    localStorage.removeItem("seo-generator-internalLinks");
    localStorage.removeItem("seo-generator-competitorUrls");
    localStorage.removeItem("seo-generator-formatUrl");
    localStorage.removeItem("seo-generator-formatReference");
    localStorage.removeItem("seo-generator-gapAnalysis");
    localStorage.removeItem("seo-generator-contextFiles");
    localStorage.removeItem("seo-generator-keywords");
    localStorage.removeItem("seo-generator-ctaUrl");
    localStorage.removeItem("seo-generator-useKnowledgeBase");
    localStorage.removeItem("seo-generator-toneProfileId");
    localStorage.removeItem("seo-generator-valuePromise");
    localStorage.removeItem("seo-generator-selectedAngles");
    localStorage.removeItem("seo-generator-selectedGapInsights");
    localStorage.removeItem("seo-generator-articleImages");
    localStorage.removeItem("seo-generator-generatedContent");
    localStorage.removeItem("seo-generator-appliedRules");
    localStorage.removeItem("seo-generator-generatedCTAs");
    localStorage.removeItem("seo-generator-originalContent");
    
    toast({
      title: "Form cleared",
      description: "All fields have been reset. Ready for a new article.",
    });
  };

  // Enhance imported content with tone and CTAs
  const handleEnhanceImport = async () => {
    if (!generatedContent.trim()) {
      toast({
        title: "No content",
        description: "Import some HTML content first before enhancing.",
        variant: "destructive",
      });
      return;
    }

    setIsEnhancingImport(true);

    try {
      // Fetch the selected tone profile if one is selected
      let toneProfile = null;
      if (selectedToneProfileId) {
        const { data: toneData } = await supabase
          .from("tone_profiles")
          .select("*")
          .eq("id", selectedToneProfileId)
          .single();
        
        if (toneData) {
          toneProfile = {
            name: toneData.name,
            summary: toneData.summary,
            characteristics: toneData.characteristics as Record<string, unknown>,
            example_phrases: toneData.example_phrases,
          };
        }
      }

      // Prepare CTA config if URL is set
      let ctaConfig = null;
      if (ctaUrl.trim()) {
        ctaConfig = {
          headline: "",
          description: "",
          buttonText: "",
          buttonUrl: ctaUrl,
        };
      }

      // Prepare images for insertion
      const imagesToInsert = articleImages.length > 0 
        ? articleImages.map(img => ({ alt: img.alt, url: img.url })) 
        : undefined;

      const { data, error } = await supabase.functions.invoke("enhance-import", {
        body: {
          content: generatedContent,
          toneProfile,
          ctaConfig,
          addCtas: !!ctaUrl.trim(),
          images: imagesToInsert,
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      
      // Update applied rules to reflect enhancement
      setAppliedRules((prev) => ({
        ...(prev || {
          gapAnalysisUsed: false,
          formatReferenceUsed: false,
          contextFilesUsed: false,
          contextFileNames: [],
          keywordsUsed: false,
          keywords: [],
          targetWordCount: 0,
          outlineProvided: false,
          customInstructionsProvided: false,
        }),
        toneProfileUsed: data.toneApplied,
      }));

      // Imported/enhanced CTAs are embedded directly in markdown content.
      // Keep generatedCTAs cleared to avoid rendering a second duplicate CTA layer.
      setGeneratedCTAs(null);

      const enhancements = [];
      if (data.toneApplied) enhancements.push("Tone applied");
      if (data.ctasAdded) enhancements.push("CTAs added");
      if (data.imagesInserted) enhancements.push("Images inserted");

      toast({
        title: "Content enhanced!",
        description: enhancements.length > 0 ? enhancements.join(". ") + "." : "Content processed.",
      });
    } catch (error) {
      console.error("Enhance import error:", error);
      toast({
        title: "Enhancement failed",
        description: error instanceof Error ? error.message : "Failed to enhance content",
        variant: "destructive",
      });
    } finally {
      setIsEnhancingImport(false);
    }
  };

  // Apply article format structure (TL;DR, Quick Tips, Navigation, FAQ) without changing content
  const handleApplyFormat = async () => {
    if (!generatedContent.trim()) {
      toast({
        title: "No content",
        description: "Import some content first before applying format.",
        variant: "destructive",
      });
      return;
    }

    // Reset and show progress dialog
    setFormatError(null);
    setFormatSteps(DEFAULT_FORMAT_STEPS.map(s => ({ ...s, status: 'pending' as const })));
    setShowFormatProgress(true);
    setIsApplyingFormat(true);

    const updateStep = (id: string, status: FormatStep['status'], detail?: string) => {
      setFormatSteps(prev => prev.map(s => 
        s.id === id ? { ...s, status, detail } : s
      ));
    };

    try {
      // Step 1: Analyze content
      updateStep('analyze', 'checking', 'Scanning for existing sections...');
      await new Promise(r => setTimeout(r, 300)); // Brief delay for visual feedback

      // Detect what exists
      const hasTldr = /##\s*TL;?DR/i.test(generatedContent) || /###\s*TL;?DR/i.test(generatedContent);
      const hasQuickTips = skipQuickTips ? true : (/##\s*Quick\s*Tips/i.test(generatedContent) || />\s*\*\*Tip\s*1/i.test(generatedContent));
      const hasInThisArticle = /##\s*In\s*This\s*Article/i.test(generatedContent);
      const hasFaq = skipFaqs ? true : /##\s*(FAQ|Frequently\s*Asked\s*Questions)/i.test(generatedContent);
      const hasCtaUrl = !!ctaUrl.trim();

      updateStep('analyze', 'done', 'Content analyzed');

      // Update step statuses based on what exists
      updateStep('tldr', hasTldr ? 'skipped' : 'missing', hasTldr ? 'Already exists' : 'Will be generated');
      updateStep('quicktips', hasQuickTips ? 'skipped' : 'missing', hasQuickTips ? 'Already exists' : 'Will be generated');
      updateStep('navigation', hasInThisArticle ? 'skipped' : 'missing', hasInThisArticle ? 'Already exists' : 'Will be generated');
      updateStep('faq', hasFaq ? 'skipped' : 'missing', hasFaq ? 'Already exists' : 'Will be generated');
      updateStep('ctas', hasCtaUrl ? 'missing' : 'skipped', hasCtaUrl ? 'Will insert 2 CTAs' : 'No CTA URL provided');

      await new Promise(r => setTimeout(r, 500)); // Brief delay to show status

      // Step 2-6: Generate missing sections (all done in one AI call)
      const missingSteps = ['tldr', 'quicktips', 'navigation', 'faq', 'ctas'].filter(id => {
        const step = formatSteps.find(s => s.id === id);
        return step?.status === 'missing';
      });

      // Mark generating steps
      if (!hasTldr) updateStep('tldr', 'generating', 'Creating TL;DR summary...');
      if (!hasQuickTips) updateStep('quicktips', 'generating', 'Creating Quick Tips...');
      if (!hasInThisArticle) updateStep('navigation', 'generating', 'Building navigation...');
      if (!hasFaq) updateStep('faq', 'generating', 'Generating FAQ...');
      if (hasCtaUrl) updateStep('ctas', 'generating', 'Inserting CTA banners...');

      // Prepare CTA config if URL is set - text will be generated contextually by AI
      let ctaConfig = null;
      if (ctaUrl.trim()) {
        ctaConfig = {
          headline: "",
          description: "",
          buttonText: "",
          buttonUrl: ctaUrl,
        };
      }

      const { data, error } = await supabase.functions.invoke("apply-format", {
        body: {
          content: generatedContent,
          ctaConfig,
          customInstructions: formData.instructions?.trim() || undefined,
          skipFaqs,
          skipQuickTips,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Update step statuses based on what was added
      const additions = data.additions || [];
      const nowHas = data.nowHas || {};

      updateStep('tldr', nowHas.hasTldr ? (hasTldr ? 'skipped' : 'done') : 'error', 
        nowHas.hasTldr ? (hasTldr ? 'Already existed' : 'Generated ✓') : 'Failed to generate');
      updateStep('quicktips', nowHas.hasQuickTips ? (hasQuickTips ? 'skipped' : 'done') : 'error',
        nowHas.hasQuickTips ? (hasQuickTips ? 'Already existed' : 'Generated ✓') : 'Failed to generate');
      updateStep('navigation', nowHas.hasInThisArticle ? (hasInThisArticle ? 'skipped' : 'done') : 'error',
        nowHas.hasInThisArticle ? (hasInThisArticle ? 'Already existed' : 'Generated ✓') : 'Failed to generate');
      updateStep('faq', nowHas.hasFaq ? (hasFaq ? 'skipped' : 'done') : 'error',
        nowHas.hasFaq ? (hasFaq ? 'Already existed' : 'Generated ✓') : 'Failed to generate');
      updateStep('ctas', nowHas.hasCtas || !hasCtaUrl ? (hasCtaUrl ? 'done' : 'skipped') : 'error',
        hasCtaUrl ? (nowHas.hasCtas ? 'CTAs inserted ✓' : 'Failed to insert') : 'No URL provided');

      // Step 7: Finalize
      updateStep('finalize', 'generating', 'Applying styles and formatting...');
      await new Promise(r => setTimeout(r, 300));

      setGeneratedContent(data.content, true);
      setGeneratedCTAs(null);

      updateStep('finalize', 'done', 'Complete!');

      toast({
        title: "Format applied!",
        description: additions.length > 0 ? `Added: ${additions.join(", ")}` : "Article already formatted.",
      });
    } catch (error) {
      console.error("Apply format error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to apply format";
      setFormatError(errorMessage);
      
      // Mark remaining steps as error
      setFormatSteps(prev => prev.map(s => 
        s.status === 'generating' || s.status === 'missing' || s.status === 'checking' 
          ? { ...s, status: 'error' as const, detail: 'Failed' } 
          : s
      ));

      toast({
        title: "Format failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsApplyingFormat(false);
    }
  };

  // Auto-apply format when content arrives from Convert to Article tool
  useEffect(() => {
    if (pendingApplyFormatRef.current && activeTool === "generator" && generatedContent.trim()) {
      pendingApplyFormatRef.current = false;
      // Small delay to let the UI settle before triggering format
      const timer = setTimeout(() => {
        handleApplyFormat();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeTool, generatedContent]);

  // Refresh CTAs in existing content - strips old ones and regenerates contextual ones
  const handleRefreshCTAs = async () => {
    if (!generatedContent.trim() || !ctaUrl.trim()) {
      toast({
        title: "Cannot refresh CTAs",
        description: "You need both content and a CTA URL configured.",
        variant: "destructive",
      });
      return;
    }

    setIsApplyingFormat(true);
    try {
      const ctaConfig = {
        headline: "",
        description: "",
        buttonText: "",
        buttonUrl: ctaUrl,
      };

      const { data, error } = await supabase.functions.invoke("apply-format", {
        body: {
          content: generatedContent,
          ctaConfig,
          customInstructions: formData.instructions?.trim() || undefined,
          forceRegenerateCtas: true,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setGeneratedContent(data.content);
      toast({
        title: "CTAs refreshed!",
        description: "Old CTAs replaced with contextually relevant ones.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to refresh CTAs";
      toast({
        title: "CTA refresh failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsApplyingFormat(false);
    }
  };

  // Insert internal links contextually into existing content
  const handleInsertInternalLinks = async () => {
    const validUrls = internalLinks.filter((url) => url.trim());
    if (!generatedContent.trim() || validUrls.length === 0) {
      toast({
        title: "Cannot insert links",
        description: "You need both content and at least one URL.",
        variant: "destructive",
      });
      return;
    }

    setIsInsertingLinks(true);
    try {
      const { data, error } = await supabase.functions.invoke("insert-internal-links", {
        body: {
          content: generatedContent,
          urls: validUrls,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setGeneratedContent(data.content);

      // Save used URLs to history
      setInternalLinkHistory(prev => {
        const newHistory = [...prev];
        validUrls.forEach(url => {
          const trimmed = url.trim();
          const idx = newHistory.indexOf(trimmed);
          if (idx !== -1) newHistory.splice(idx, 1);
          newHistory.unshift(trimmed);
        });
        return newHistory.slice(0, 100);
      });
      addToInternalLinkHistoryDb(validUrls.map(u => u.trim()));

      const skipped = data.skippedUrls?.length || 0;
      toast({
        title: "Internal links inserted!",
        description: `${data.insertedCount}/${data.totalProvided} links placed contextually.${skipped > 0 ? ` ${skipped} skipped (no matching context).` : ""}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to insert internal links";
      toast({
        title: "Link insertion failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsInsertingLinks(false);
    }
  };

  // Allocate images logically using AI to match image content to article sections
  const handleAllocateImagesLogically = async (imagesToAllocate: ArticleImage[]) => {
    if (!generatedContent || imagesToAllocate.length === 0) {
      toast({
        title: "Cannot allocate images",
        description: "You need content and uploaded images first.",
        variant: "destructive",
      });
      return;
    }

    setIsAllocatingImages(true);

    try {
      // Call edge function to allocate images based on content analysis
      const { data, error } = await supabase.functions.invoke("enhance-import", {
        body: {
          content: generatedContent,
          toneProfile: null,
          ctaConfig: null,
          addCtas: false,
          images: imagesToAllocate.map(img => ({ alt: img.alt, url: img.url })),
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.content) {
        setGeneratedContent(data.content);
        toast({
          title: "Images allocated!",
          description: `${imagesToAllocate.length} image(s) placed at relevant sections.`,
        });
      }
    } catch (error) {
      console.error("Allocate images error:", error);
      toast({
        title: "Image allocation failed",
        description: error instanceof Error ? error.message : "Failed to allocate images",
        variant: "destructive",
      });
    } finally {
      setIsAllocatingImages(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Tool Tabs */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <nav className="flex items-center gap-1">
            <Button
              variant={activeTool === "generator" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTool("generator")}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              SEO Content Generator
            </Button>
            <Button
              variant={activeTool === "converter" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTool("converter")}
              className="gap-2"
            >
              <FileUp className="h-4 w-4" />
              Convert to Article
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/outline-generator")}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Outline Generator
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/product-descriptions")}
              className="gap-2"
            >
              <Tag className="h-4 w-4" />
              Product Descriptions
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/keyword-research")}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              Keyword Research
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/content-migration")}
              className="gap-2"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Content Migration
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/shopify-faq-bulk")}
              className="gap-2"
            >
              <FileUp className="h-4 w-4" />
              Shopify FAQ Bulk
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/seo-brain/library")}
              className="gap-2"
            >
              <Brain className="h-4 w-4" />
              SEO Brain
            </Button>
          </nav>
        </div>
      </header>

      {activeTool === "converter" ? (
        <ConvertToArticleView
          formatReference={formatReference}
          onContentReady={(content) => {
            setGeneratedContent(content, true);
            setActiveTool("generator");
            pendingApplyFormatRef.current = true;
          }}
        />
      ) : (
      <>
      {/* Action Toolbar */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3 max-w-[1800px]">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Actions */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !formData.topic.trim()}
              title="Creates a fully structured SEO article based on your topic, keywords, tone profile, and all configured settings. Includes TL;DR, Quick Tips, FAQ, comparison tables, and source citations. Uses approximately 1 AI credit per generation."
              size="default"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {useHumanMode ? "Human Mode..." : "Generating..."}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Content
                </>
              )}
            </Button>

            {/* Human Mode Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border" title="When enabled, content goes through a 4-stage humanisation pipeline: AI generation, brief creation, section-by-section rewriting, and quality gating. Produces more natural, human-sounding content but uses ~10 credits instead of ~1.">
              <Label htmlFor="human-mode" className="text-sm font-medium cursor-pointer">
                Human Mode
              </Label>
              <Switch
                id="human-mode"
                checked={useHumanMode}
                onCheckedChange={setUseHumanMode}
                disabled={isGenerating}
              />
              {useHumanMode && (
                <span className="text-xs text-muted-foreground">(4-stage pipeline)</span>
              )}
            </div>

            {/* Humanise Only Button - appears when content exists */}
            {generatedContent && (
              <Button
                variant="outline"
                onClick={handleHumaniseOnly}
                disabled={isGenerating || isHumanisingOnly || !generatedContent.trim()}
                size="default"
                title="Runs only the humanisation stages (Stage 3 + 4) on your existing content. Rewrites for natural, human-sounding language without regenerating the article from scratch. Costs ~4 credits vs ~10 for a full Human Mode generation."
              >
                {isHumanisingOnly ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Humanising...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Humanise Only
                  </>
                )}
              </Button>
            )}

            <div className="h-6 w-px bg-border" />

            {/* Import/Export */}
            <HtmlImportDialog onImport={(content) => {
              setGeneratedContent(content, true);
              setGeneratedCTAs(null);
            }} />
            <UrlImportDialog
              onImport={(content) => {
                setGeneratedContent(content, true);
                setGeneratedCTAs(null);
              }}
              formatReference={formatReference}
              targetLength={formData.length}
              instructions={formData.instructions}
            />
            <PasteAndFormatDialog
              onPasteAndFormat={(content) => {
                setGeneratedContent(content, true);
                setGeneratedCTAs(null);
                pendingApplyFormatRef.current = true;
              }}
            />
            
            <Button
              variant="outline"
              size="default"
              onClick={handleEnhanceImport}
              disabled={isEnhancingImport || !generatedContent}
              title="Enhances imported content by applying your selected tone profile, inserting CTA banners, and placing article images. Use this after importing HTML or URL content to match your brand voice and add promotional elements."
            >
              {isEnhancingImport ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enhancing...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Enhance Import
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="default"
              onClick={handleApplyFormat}
              disabled={isApplyingFormat || !generatedContent}
              title="Adds structural formatting to your article without changing the existing content. Inserts TL;DR summary, 3 Quick Tips, 'In This Article' navigation, FAQ section, and 2 contextual CTA banners if a CTA URL is set."
            >
              {isApplyingFormat ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Apply Format
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="default"
              title="Copies your article as clean, production-ready HTML with inline styles for navigation panels, FAQ accordions, CTA banners, and color branding. Ready to paste directly into Shopify, WordPress, or any CMS."
              disabled={!generatedContent}
              onClick={() => {
                // Generate clean HTML from source data (not DOM parsing)
                const primaryColor = selectedColorPalette?.primary || "#7c3aed";
                const secondaryColor = selectedColorPalette?.secondary || "#9333ea";
                const accentColor = selectedColorPalette?.accent || primaryColor;
                const isDarkSitePaletteForExport = selectedColorPalette?.id === "dark-transparent";
                const panelBg = isDarkSitePaletteForExport ? "rgba(255,255,255,0.06)" : "#f8f4ff";
                const panelText = isDarkSitePaletteForExport ? "#ffffff" : "#1f2937";
                const bodyText = isDarkSitePaletteForExport ? "#e5e7eb" : "#374151";
                const tableRowOdd = isDarkSitePaletteForExport ? "rgba(255,255,255,0.04)" : "#f9fafb";
                const tableRowEven = isDarkSitePaletteForExport ? "rgba(255,255,255,0.08)" : "#ffffff";
                const tableBorder = isDarkSitePaletteForExport ? "rgba(255,255,255,0.2)" : "#e5e7eb";
                const tableHeaderText = isDarkSitePaletteForExport ? "#000000" : "#ffffff";
                
                // Extract navigation and FAQ items from markdown
                const navItems = getBestNavigationItems(generatedContent);
                const faqItems = skipFaqs ? [] : extractFAQFromContent(generatedContent);
                
                // Get article element for base HTML structure
                const article = document.querySelector("article");
                if (!article) return;
                
                // Clone and process for base content
                const clone = article.cloneNode(true) as HTMLElement;
                
                // Remove all buttons (delete buttons on images, etc.)
                clone.querySelectorAll('button').forEach((el) => el.remove());
                
                // Remove SVG icons (like X icons on buttons)
                clone.querySelectorAll('svg').forEach((el) => el.remove());
                
                // Remove React-rendered navigation panel (we'll add proper HTML)
                clone.querySelectorAll('div').forEach((el) => {
                  if (el.textContent?.includes('In This Article') && el.className?.includes('rounded')) {
                    el.remove();
                  }
                });
                
                // Remove React-rendered FAQ panel
                clone.querySelectorAll('div').forEach((el) => {
                  if (el.textContent?.includes('Frequently Asked Questions') && el.className?.includes('rounded')) {
                    el.remove();
                  }
                });
                
                // CRITICAL: Remove duplicate "In This Article" navigation lists
                // These are plain <ul> lists with numbered items like "2. The Power of Porcelain Veneers - Description..."
                // They appear after Quick Tips and should be removed since we insert a styled navigation panel
                clone.querySelectorAll('ul').forEach((ul) => {
                  const listItems = ul.querySelectorAll('li');
                  if (listItems.length >= 3) {
                    // Check if this is a navigation-style list (items start with numbers and have long descriptions)
                    let isNavList = true;
                    let navItemCount = 0;
                    listItems.forEach((li) => {
                      const text = li.textContent || '';
                      // Match pattern: "2. Title Name - Long description text..." or with bold
                      const isNavItem = /^\s*\d+\.\s*[A-Z][^-]*\s*[-–—]\s*.{30,}/i.test(text);
                      if (isNavItem) {
                        navItemCount++;
                      }
                    });
                    // If majority of items match navigation pattern, remove the list
                    if (navItemCount >= 3 || (navItemCount >= listItems.length * 0.5 && navItemCount >= 2)) {
                      ul.remove();
                    }
                  }
                });
                
                // Convert CTA banners to proper inline HTML before removing React components
                clone.querySelectorAll('[data-cta-banner]').forEach((el) => {
                  // Use data attributes to reliably extract CTA content
                  const headlineEl = el.querySelector('[data-cta-headline]');
                  const descriptionEl = el.querySelector('[data-cta-description]');
                  const buttonEl = el.querySelector('[data-cta-button]') as HTMLAnchorElement | null;
                  const taglineEl = el.querySelector('[data-cta-tagline]');
                  
                  const headline = headlineEl?.textContent?.replace(/^[🔥🎨✨💡🚀💪🌟⭐️🎉]+\s*/, '').trim() || 'Learn More';
                  const description = descriptionEl?.textContent?.trim() || '';
                  const buttonText = buttonEl?.textContent?.replace(/\s*→\s*$/, '').trim() || 'Learn More';
                  const buttonUrl = buttonEl?.getAttribute('href') || ctaUrl || '#';
                  const tagline = taglineEl?.textContent?.trim() || '';
                  
                  // Generate proper CTA HTML with preserve marker
                  const ctaHtml = generateCTAHtml(
                    headline,
                    description,
                    buttonText,
                    buttonUrl,
                    selectedColorPalette,
                    tagline || undefined
                  );
                  
                  // Replace the React component with styled HTML
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = ctaHtml;
                  const ctaElement = tempDiv.firstElementChild as HTMLElement;
                  
                  if (ctaElement && el.parentNode) {
                    // Mark this CTA to prevent it from being unwrapped
                    ctaElement.setAttribute('data-preserve-cta', 'true');
                    el.parentNode.replaceChild(ctaElement, el);
                  }
                });
                
                // Unwrap images from their React wrapper divs
                clone.querySelectorAll('div').forEach((wrapper) => {
                  const classList = wrapper.className || '';
                  if ((classList.includes('relative') && classList.includes('group')) || 
                      (classList.includes('relative') && classList.includes('block'))) {
                    const img = wrapper.querySelector('img');
                    if (img && wrapper.parentNode) {
                      wrapper.parentNode.replaceChild(img.cloneNode(true), wrapper);
                    }
                  }
                });
                
                // === STYLE ELEMENTS DIRECTLY VIA DOM ===
                
                // Wrap tables in scrollable container and style them
                clone.querySelectorAll('table').forEach((table) => {
                  // Create a wrapper div for horizontal scroll
                  const wrapper = document.createElement('div');
                  wrapper.setAttribute('style', 'width: 100%; overflow-x: auto; margin: 24px 0; -webkit-overflow-scrolling: touch;');
                  
                  // Style the table itself
                  table.setAttribute('style', `min-width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid ${tableBorder}; table-layout: auto;`);
                  table.removeAttribute('class');
                  
                  // Insert wrapper before table and move table inside
                  if (table.parentNode) {
                    table.parentNode.insertBefore(wrapper, table);
                    wrapper.appendChild(table);
                  }
                });
                
                // Style theads with gradient
                clone.querySelectorAll('thead').forEach((thead) => {
                  thead.setAttribute('style', `background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);`);
                  thead.removeAttribute('class');
                });
                
                // Style th cells
                clone.querySelectorAll('th').forEach((th) => {
                  th.setAttribute('style', `padding: 12px 16px; text-align: left; color: ${tableHeaderText}; font-weight: 600; font-size: 14px; border: 1px solid ${tableBorder}; white-space: nowrap;`);
                  th.removeAttribute('class');
                });
                
                // Style tbody rows with alternating colors
                clone.querySelectorAll('tbody').forEach((tbody) => {
                  tbody.removeAttribute('class');
                  const rows = tbody.querySelectorAll('tr');
                  rows.forEach((tr, idx) => {
                    const bgColor = idx % 2 === 0 ? tableRowOdd : tableRowEven;
                    tr.setAttribute('style', `background: ${bgColor}; color: ${bodyText};`);
                    tr.removeAttribute('class');
                  });
                });
                
                // Style td cells - allow text wrapping for proper column sizing
                clone.querySelectorAll('td').forEach((td) => {
                  td.setAttribute('style', `padding: 12px 16px; font-size: 14px; border: 1px solid ${tableBorder}; word-wrap: break-word; color: ${bodyText};`);
                  td.removeAttribute('class');
                });
                
                // Style links - BUT skip links inside CTA banners (they have their own button styling)
                clone.querySelectorAll('a').forEach((a) => {
                  // Skip if this anchor is a CTA button (has data-cta-button) or is inside a CTA banner
                  const isCTAButton = a.hasAttribute('data-cta-button');
                  const isInsideCTA = a.closest('[data-preserve-cta]') || a.closest('[data-cta-banner]');
                  
                  if (isCTAButton || isInsideCTA) {
                    // Just remove class, keep existing inline styles (the button styling)
                    a.removeAttribute('class');
                    return;
                  }
                  
                  const href = a.getAttribute('href') || '';
                  if (href.startsWith('#')) {
                    a.setAttribute('style', 'color: #2563eb; text-decoration: underline;');
                  } else {
                    a.setAttribute('style', 'color: #2563eb; text-decoration: underline;');
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener noreferrer');
                  }
                  a.removeAttribute('class');
                });
                
                // Style images
                clone.querySelectorAll('img').forEach((img) => {
                  img.setAttribute('style', 'max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; display: block;');
                  img.removeAttribute('class');
                });
                
                // Style headings - only set margins, let website inherit font-size/weight/color
                // For dark sites, explicitly set light text color
                const headingColor = isDarkSitePaletteForExport ? `color: #ffffff;` : '';
                clone.querySelectorAll('h1').forEach((h) => {
                  h.setAttribute('style', `margin: 0 0 16px 0; ${headingColor}`);
                  h.removeAttribute('class');
                });
                clone.querySelectorAll('h2').forEach((h) => {
                  const id = h.getAttribute('id') || '';
                  const textContent = h.textContent || '';
                  const isTldr = id.includes('tldr') || /TL;?DR/i.test(textContent);
                  
                  if (isTldr) {
                    // TL;DR gets special background styling but no font overrides
                    h.setAttribute('style', `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 12px 16px; margin: 24px 0 0 0; border-radius: 0 8px 0 0;`);
                    // Style the UL that immediately follows the TL;DR heading
                    const nextSibling = h.nextElementSibling;
                    if (nextSibling && nextSibling.tagName === 'UL') {
                      nextSibling.setAttribute('style', `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px 16px 40px; margin: 0 0 24px 0; border-radius: 0 0 8px 0; list-style-type: disc;`);
                      nextSibling.setAttribute('data-tldr-styled', 'true');
                      nextSibling.querySelectorAll('li').forEach((li) => {
                        li.setAttribute('style', `margin: 8px 0; line-height: 1.6; color: ${panelText};`);
                        li.setAttribute('data-tldr-styled', 'true');
                        if (li.innerHTML) {
                          li.innerHTML = li.innerHTML.replace(/^[\s]*[-–—•]\s*[-–—]?\s*/i, '');
                        }
                      });
                    }
                    // Handle all consecutive paragraphs after TL;DR heading
                    let sibling = h.nextElementSibling;
                    while (sibling && sibling.tagName === 'P') {
                      const nextAfter = sibling.nextElementSibling;
                      const isLast = !nextAfter || nextAfter.tagName !== 'P';
                      sibling.setAttribute('style', `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px; margin: 0 0 ${isLast ? '24px' : '0'} 0; border-radius: ${isLast ? '0 0 8px 0' : '0'}; line-height: 1.7;`);
                      sibling.setAttribute('data-tldr-styled', 'true');
                      sibling = nextAfter;
                    }
                  } else {
                    // Regular H2 - only margins, inherit everything else (+ dark color if needed)
                    h.setAttribute('style', `margin: 32px 0 16px 0; ${headingColor}`);
                  }
                  h.removeAttribute('class');
                });
                clone.querySelectorAll('h3').forEach((h) => {
                  const id = h.getAttribute('id') || '';
                  const textContent = h.textContent || '';
                  const isTldr = id.includes('tldr') || /TL;?DR/i.test(textContent);
                  
                  if (isTldr) {
                    // TL;DR H3 gets same styling as H2 TL;DR
                    h.setAttribute('style', `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 12px 16px; margin: 24px 0 0 0; border-radius: 0 8px 0 0;`);
                    const nextSibling = h.nextElementSibling;
                    if (nextSibling && nextSibling.tagName === 'UL') {
                      nextSibling.setAttribute('style', `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px 16px 40px; margin: 0 0 24px 0; border-radius: 0 0 8px 0; list-style-type: disc;`);
                      nextSibling.querySelectorAll('li').forEach((li) => {
                        li.setAttribute('style', `margin: 8px 0; line-height: 1.6; color: ${panelText};`);
                        if (li.innerHTML) {
                          li.innerHTML = li.innerHTML.replace(/^[\s]*[-–—•]\s*[-–—]?\s*/i, '');
                        }
                      });
                    }
                    if (nextSibling && nextSibling.tagName === 'P') {
                      nextSibling.setAttribute('style', `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px; margin: 0 0 24px 0; border-radius: 0 0 8px 0; line-height: 1.7;`);
                    }
                  } else {
                    // Regular H3 - only margins, inherit everything else (+ dark color if needed)
                    h.setAttribute('style', `margin: 24px 0 12px 0; ${headingColor}`);
                  }
                  h.removeAttribute('class');
                });
                
                // Style paragraphs - skip those already styled as TL;DR siblings
                clone.querySelectorAll('p').forEach((p) => {
                  if (p.hasAttribute('data-tldr-styled')) return;
                  p.setAttribute('style', `margin: 0 0 16px 0; line-height: 1.7; color: ${bodyText};`);
                  p.removeAttribute('class');
                });
                
                // Style lists (but not TL;DR list which was already styled)
                clone.querySelectorAll('ul').forEach((ul) => {
                  const existingStyle = ul.getAttribute('style') || '';
                  if (!existingStyle.includes('f8f4ff') && !existingStyle.includes('border-left')) {
                    ul.setAttribute('style', `margin: 0 0 16px 0; padding-left: 24px; list-style-type: disc; ${isDarkSitePaletteForExport ? `color: ${bodyText};` : ''}`);
                  }
                  ul.removeAttribute('class');
                });
                clone.querySelectorAll('ol').forEach((ol) => {
                  ol.setAttribute('style', 'margin: 0 0 16px 0; padding-left: 24px; list-style-type: decimal;');
                  ol.removeAttribute('class');
                });
                clone.querySelectorAll('li').forEach((li) => {
                  if (!li.getAttribute('style')) {
                    li.setAttribute('style', `margin: 8px 0; line-height: 1.6; color: ${bodyText};`);
                  }
                  li.removeAttribute('class');
                  // Clean any remaining double bullets
                  if (li.innerHTML) {
                    li.innerHTML = li.innerHTML.replace(/^[\s]*[-–—•]\s*[-–—]\s*/i, '');
                  }
                });
                
                // Style blockquotes - detect Quick Tips vs CTA vs regular blockquotes
                let tipIndex = 0;
                clone.querySelectorAll('blockquote').forEach((bq) => {
                  const firstStrong = bq.querySelector('strong');
                  const isQuickTip = firstStrong && /^Tip \d+:?/i.test(firstStrong.textContent || '');
                  
                  // Check if this is a CTA blockquote (contains a link that's NOT a tip)
                  const linkElement = bq.querySelector('a');
                  const hasLink = linkElement && linkElement.getAttribute('href')?.startsWith('http');
                  const isCTA = hasLink && !isQuickTip;
                  
                  if (isCTA && linkElement) {
                    // Extract CTA content from the blockquote
                    // Structure: > **Headline**\n> Description\n> [Button](url)\n> Tagline
                    const headlines = bq.querySelectorAll('strong');
                    const headline = headlines[0]?.textContent?.replace(/^[🔥🎨✨💡🚀💪🌟⭐️🎉]+\s*/, '') || 'Learn More';
                    
                    // Get all text nodes and paragraphs
                    const paragraphs = bq.querySelectorAll('p');
                    let description = '';
                    let tagline = '';
                    
                    if (paragraphs.length >= 2) {
                      // If structured with paragraphs: first is headline, second is description, etc.
                      description = paragraphs[1]?.textContent || '';
                    } else {
                      // Extract from text content - description is between headline and button
                      const fullText = bq.textContent || '';
                      const afterHeadline = fullText.split(headline)[1] || '';
                      const buttonText = linkElement.textContent || '';
                      const beforeButton = afterHeadline.split(buttonText)[0] || '';
                      description = beforeButton.replace(/^\s*[-–—]\s*/, '').trim();
                      
                      // Tagline is after the button
                      const afterButton = afterHeadline.split(buttonText)[1] || '';
                      tagline = afterButton.replace(/^\s*[-–—→]\s*/, '').trim();
                    }
                    
                    const buttonText = linkElement.textContent?.replace(/\s*→\s*$/, '') || 'Learn More';
                    const buttonUrl = linkElement.getAttribute('href') || ctaUrl || '#';
                    
                    // Replace blockquote with proper CTA HTML
                    const ctaHtml = generateCTAHtml(
                      headline,
                      description,
                      buttonText,
                      buttonUrl,
                      selectedColorPalette,
                      tagline || undefined
                    );
                    
                    // Create a temporary container to parse the HTML
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = ctaHtml;
                    const ctaElement = tempDiv.firstElementChild;
                    
                    if (ctaElement && bq.parentNode) {
                      bq.parentNode.replaceChild(ctaElement, bq);
                    }
                  } else if (isQuickTip) {
                    tipIndex++;
                    // Remove the "Tip X:" text since we'll show it as a circle
                    if (firstStrong) {
                      firstStrong.remove();
                    }
                    
                    // Create the numbered circle as inline element
                    const circleSpan = document.createElement('span');
                    circleSpan.setAttribute('style', `display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: ${primaryColor}; border-radius: 50%; color: white; font-weight: 700; font-size: 14px; margin-right: 12px; flex-shrink: 0; vertical-align: middle;`);
                    circleSpan.textContent = String(tipIndex);
                    
                    // Style the blockquote for tips
                    bq.setAttribute('style', `display: flex; align-items: center; background: ${isDarkSitePaletteForExport ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${primaryColor}10 0%, ${primaryColor}20 100%)`}; border: 1px solid ${isDarkSitePaletteForExport ? 'rgba(255,255,255,0.12)' : `${primaryColor}33`}; border-radius: 12px; padding: 16px 20px; margin: 12px 0; font-style: normal;`);
                    
                    // Wrap content and prepend circle
                    const content = bq.innerHTML;
                    bq.innerHTML = '';
                    bq.appendChild(circleSpan);
                    const textSpan = document.createElement('span');
                    textSpan.innerHTML = content.replace(/^[\s]*/, '');
                    textSpan.setAttribute('style', `flex: 1; color: ${bodyText};`);
                    bq.appendChild(textSpan);
                  } else {
                    // Regular blockquote (like TL;DR content)
                    bq.setAttribute('style', `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px; margin: 24px 0; border-radius: 0 8px 8px 0; font-style: normal;`);
                  }
                  bq.removeAttribute('class');
                });
                
                // Remove wrapper divs around tables
                clone.querySelectorAll('div').forEach((div) => {
                  const className = div.className || '';
                  if (className.includes('overflow') && div.querySelector('table')) {
                    const table = div.querySelector('table');
                    if (table && div.parentNode) {
                      div.parentNode.replaceChild(table, div);
                    }
                  }
                });
                
                // IMPORTANT: Unwrap most divs to allow WordPress editing
                // BUT preserve CTA banners AND their children (marked with data-preserve-cta or data-cta-banner)
                // WordPress block editor needs clean semantic HTML without wrapper divs
                let divsToUnwrap = clone.querySelectorAll('div:not([data-preserve-cta]):not([data-cta-banner])');
                while (divsToUnwrap.length > 0) {
                  let unwrappedAny = false;
                  divsToUnwrap.forEach((div) => {
                    // Skip if this div has the preserve marker OR is inside a preserved CTA
                    if (div.hasAttribute('data-preserve-cta') || 
                        div.hasAttribute('data-cta-banner') || 
                        div.closest('[data-preserve-cta]') || 
                        div.closest('[data-cta-banner]')) {
                      return;
                    }
                    if (div.parentNode) {
                      // Move all children out of the div
                      while (div.firstChild) {
                        div.parentNode.insertBefore(div.firstChild, div);
                      }
                      // Remove the empty div
                      div.parentNode.removeChild(div);
                      unwrappedAny = true;
                    }
                  });
                  // Break if no divs were unwrapped to prevent infinite loop
                  if (!unwrappedAny) break;
                  divsToUnwrap = clone.querySelectorAll('div:not([data-preserve-cta]):not([data-cta-banner])');
                }
                
                // Check for inline CTA banners BEFORE stripping data attributes
                const hasInlineCtaBanners = !!clone.querySelector('[data-cta-banner]');
                
                // Remove all remaining class and data attributes
                clone.querySelectorAll('*').forEach((el) => {
                  el.removeAttribute('class');
                  Array.from(el.attributes).forEach((attr) => {
                    if (attr.name.startsWith('data-')) {
                      el.removeAttribute(attr.name);
                    }
                  });
                });
                
                // Get the cleaned HTML
                let htmlContent = clone.innerHTML;
                
                // Remove broken/placeholder images (empty src or failed loads)
                htmlContent = htmlContent.replace(/<img[^>]*src=""[^>]*>/gi, '');
                htmlContent = htmlContent.replace(/<img[^>]*src="data:,"[^>]*>/gi, '');
                // Remove image containers with no valid image
                htmlContent = htmlContent.replace(/<figure[^>]*>\s*<\/figure>/gi, '');
                
                // Clean up double bullets/dashes in list items (• - or - - patterns)
                htmlContent = htmlContent.replace(/<li[^>]*style="[^"]*"[^>]*>\s*[-–—•]\s*[-–—]\s*/gi, (match) => {
                  const styleMatch = match.match(/style="[^"]*"/);
                  return `<li ${styleMatch ? styleMatch[0] : ''}>`;
                });
                
                // Remove any remaining class attributes that DOM manipulation might have missed
                htmlContent = htmlContent.replace(/\s+class="[^"]*"/gi, '');
                
                // Remove any stray React-specific attributes
                htmlContent = htmlContent.replace(/\s+node="[^"]*"/gi, '');
                
                // Strip data attributes from the string now
                htmlContent = htmlContent.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
                
                // Remove duplicate TL;DR / Quick Tips sections that appear after Final Thoughts
                // The AI sometimes generates these at both top and bottom of the article
                const finalThoughtsPos = htmlContent.search(/<h2[^>]*>.*?Final Thoughts.*?<\/h2>/i);
                if (finalThoughtsPos > -1) {
                  const beforeFT = htmlContent.slice(0, finalThoughtsPos);
                  let afterFT = htmlContent.slice(finalThoughtsPos);
                  // Find the end of the Final Thoughts section (next H2 or end)
                  const nextH2InAfter = afterFT.match(/<h2[^>]*>/gi);
                  if (nextH2InAfter && nextH2InAfter.length > 1) {
                    // There's content after Final Thoughts paragraph - check for duplicate structural sections
                    // Remove any TL;DR sections after Final Thoughts
                    afterFT = afterFT.replace(/(<h2[^>]*>[\s\S]*?TL;?DR[\s\S]*?<\/h2>[\s\S]*?)(?=<h2|$)/gi, (match, _p1, offset) => {
                      // Only remove if it's NOT the first H2 (which is Final Thoughts itself)
                      if (offset > 0) return '';
                      return match;
                    });
                    // Remove duplicate Quick Tips after Final Thoughts
                    afterFT = afterFT.replace(/(<h2[^>]*>[\s\S]*?Quick\s*Tips[\s\S]*?<\/h2>(?:\s*<blockquote[\s\S]*?<\/blockquote>)*)/gi, (match, _p1, offset) => {
                      if (offset > 0) return '';
                      return match;
                    });
                  }
                  htmlContent = beforeFT + afterFT;
                }
                
                // Build final HTML with navigation, content, FAQ, and CTAs in correct order
                let finalHtml = '';
                
                // Clean the HTML content first
                let cleanedHtmlContent = htmlContent;
                
                // Remove any standalone "In This Article" H2 heading
                cleanedHtmlContent = cleanedHtmlContent.replace(/<h2[^>]*>[\s\S]*?In This Article[\s\S]*?<\/h2>/gi, '');
                
                // Remove ALL UL lists that contain navigation-style numbered items
                // These are the duplicate "In This Article" items appearing as plain bullets
                cleanedHtmlContent = cleanedHtmlContent.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
                  // Check multiple patterns for navigation-style items
                  // Pattern 1: <strong>2. Title</strong> - Description
                  const hasStrongNavItems = /<li[^>]*>[\s\S]*?<strong[^>]*>\s*\d+\.\s*[^<]+<\/strong>[\s\S]*?[-–—][\s\S]*?<\/li>/i.test(content);
                  // Pattern 2: Plain text "2. Title - Description" with long description
                  const hasPlainNavItems = /<li[^>]*>\s*\d+\.\s*[A-Z][^<]*[-–—][^<]{30,}<\/li>/i.test(content);
                  // Pattern 3: List items containing navigation text patterns
                  const hasNavPatterns = /\d+\.\s*(The Power of|Head-to-Head|Cost and|Care and|Which Option|What is|How to|Why|Understanding)/i.test(content);
                  
                  if (hasStrongNavItems || hasPlainNavItems || hasNavPatterns) {
                    return ''; // Remove this navigation list entirely
                  }
                  return match; // Keep other lists (like TL;DR bullets)
                });
                
                // Find Quick Tips section - navigation should go AFTER Quick Tips
                // Quick Tips uses blockquotes with "Tip 1:", "Tip 2:", etc.
                const quickTipsPattern = /(<blockquote[^>]*>[\s\S]*?Tip\s*3[\s\S]*?<\/blockquote>)/i;
                const quickTipsMatch = cleanedHtmlContent.match(quickTipsPattern);
                
                // Also try to find the last blockquote that's a tip
                const allBlockquotes = [...cleanedHtmlContent.matchAll(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi)];
                let lastTipIndex = -1;
                let lastTipEndPos = -1;
                
                allBlockquotes.forEach((match) => {
                  // Match both raw "Tip N" text AND styled tip blockquotes (circle spans with inline-flex)
                  if (/Tip\s*\d/i.test(match[0]) || /inline-flex.*28px.*28px.*border-radius:\s*50%/i.test(match[0])) {
                    lastTipEndPos = (match.index || 0) + match[0].length;
                  }
                });
                
                if (lastTipEndPos > 0 && navItems.length > 0 && !skipNavigation) {
                  // Insert navigation after Quick Tips
                  const beforeNav = cleanedHtmlContent.slice(0, lastTipEndPos);
                  const afterNav = cleanedHtmlContent.slice(lastTipEndPos);
                  finalHtml = beforeNav + generateNavigationHtml(navItems, selectedColorPalette) + afterNav;
                } else if (!skipNavigation) {
                  // Fallback: insert after TL;DR section
                  // Try matching TL;DR followed by list or paragraph
                  const tldrMatch = cleanedHtmlContent.match(/(<h2[^>]*>.*?TL;?DR.*?<\/h2>[\s\S]*?<\/(?:ul|p)>)/i);
                  if (tldrMatch && navItems.length > 0) {
                    const tldrEndIndex = cleanedHtmlContent.indexOf(tldrMatch[0]) + tldrMatch[0].length;
                    const beforeNav = cleanedHtmlContent.slice(0, tldrEndIndex);
                    const afterNav = cleanedHtmlContent.slice(tldrEndIndex);
                    finalHtml = beforeNav + generateNavigationHtml(navItems, selectedColorPalette) + afterNav;
                  } else {
                    finalHtml = cleanedHtmlContent;
                  }
                } else {
                  finalHtml = cleanedHtmlContent;
                }
                
                // Add FAQ section before References/Final Thoughts
                if (faqItems.length > 0) {
                  const faqHtml = generateFAQHtml(faqItems, selectedColorPalette);
                  // Try to insert before References or at the end
                  const referencesMatch = finalHtml.match(/<h2[^>]*>.*?References.*?<\/h2>/i);
                  const finalThoughtsMatch = finalHtml.match(/<h2[^>]*>.*?Final Thoughts.*?<\/h2>/i);
                  
                  if (finalThoughtsMatch) {
                    const insertPoint = finalHtml.indexOf(finalThoughtsMatch[0]);
                    finalHtml = finalHtml.slice(0, insertPoint) + faqHtml + finalHtml.slice(insertPoint);
                  } else if (referencesMatch) {
                    const insertPoint = finalHtml.indexOf(referencesMatch[0]);
                    finalHtml = finalHtml.slice(0, insertPoint) + faqHtml + finalHtml.slice(insertPoint);
                  } else {
                    finalHtml += faqHtml;
                  }
                }

                // Insert Trust Signal box immediately before the TL;DR heading
                if (includeTrustSignal && trustSignalContent.trim()) {
                  try {
                    const { marked } = await import("marked");
                    const trustHtml = buildTrustSignalHtml(
                      trustSignalTitle?.trim() || "Why You Can Trust This Article",
                      marked.parse(trustSignalContent, { async: false }) as string,
                      selectedColorPalette,
                    );
                    const tldrHeadingMatch = finalHtml.match(/<h2[^>]*>[\s\S]*?TL;?DR[\s\S]*?<\/h2>/i);
                    if (tldrHeadingMatch) {
                      const insertPoint = finalHtml.indexOf(tldrHeadingMatch[0]);
                      finalHtml = finalHtml.slice(0, insertPoint) + trustHtml + finalHtml.slice(insertPoint);
                    } else {
                      const h1Match = finalHtml.match(/<h1[^>]*>[\s\S]*?<\/h1>/i);
                      if (h1Match) {
                        const after = finalHtml.indexOf(h1Match[0]) + h1Match[0].length;
                        finalHtml = finalHtml.slice(0, after) + trustHtml + finalHtml.slice(after);
                      } else {
                        finalHtml = trustHtml + finalHtml;
                      }
                    }
                  } catch (e) {
                    console.error("Failed to inject trust signal into export:", e);
                  }
                }
                
                
                // Add CTA banners only when content does not already contain inline CTA banners
                if (generatedCTAs && ctaUrl && !hasInlineCtaBanners) {
                  // Add middle CTA at ~40% of content
                  const h2Matches = [...finalHtml.matchAll(/<h2[^>]*>/gi)];
                  if (h2Matches.length > 3 && generatedCTAs.middle) {
                    const middleIndex = Math.floor(h2Matches.length * 0.4);
                    const insertPoint = h2Matches[middleIndex].index;
                    if (insertPoint) {
                      const middleCTAHtml = generateCTAHtml(
                        generatedCTAs.middle.headline,
                        generatedCTAs.middle.description,
                        generatedCTAs.middle.buttonText,
                        ctaUrl,
                        selectedColorPalette,
                        (generatedCTAs.middle as any).tagline
                      );
                      finalHtml = finalHtml.slice(0, insertPoint) + middleCTAHtml + finalHtml.slice(insertPoint);
                    }
                  }
                  
                  // Add end CTA
                  if (generatedCTAs.end) {
                    const endCTAHtml = generateCTAHtml(
                      generatedCTAs.end.headline,
                      generatedCTAs.end.description,
                      generatedCTAs.end.buttonText,
                      ctaUrl,
                      selectedColorPalette,
                      (generatedCTAs.end as any).tagline
                    );
                    finalHtml += endCTAHtml;
                  }
                }
                
                // Append FAQ JSON-LD schema if enabled
                if (generateFaqSchema && faqItems.length > 0) {
                  const faqSchema = {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    "mainEntity": faqItems.map(item => ({
                      "@type": "Question",
                      "name": item.question,
                      "acceptedAnswer": {
                        "@type": "Answer",
                        "text": item.answer
                      }
                    }))
                  };
                  finalHtml += `\n<script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n</script>`;
                }
                
                // Copy to clipboard
                navigator.clipboard.writeText(finalHtml).then(() => {
                  toast({
                    title: "HTML copied to clipboard!",
                    description: "Clean, styled HTML ready for Shopify or WordPress.",
                  });
                }).catch(() => {
                  // Fallback: download as file
                  const blob = new Blob([finalHtml], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "article.html";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                });
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Copy HTML
            </Button>

            <Button
              variant="outline"
              size="default"
              title="Copies your article as rich formatted text that preserves headings, bold, links, and tables. Paste directly into Google Docs, Microsoft Word, or any rich text editor with formatting intact."
              onClick={() => {
                if (!generatedContent.trim()) return;
                // Copy as rich text (formatted) using clipboard API
                const tempDiv = document.createElement("div");
                // Convert markdown tables to HTML tables first
                const convertTables = (md: string) => {
                  const lines = md.split("\n");
                  let result = "";
                  let i = 0;
                  while (i < lines.length) {
                    // Detect table: line with |, next line is separator |---|
                    if (
                      lines[i]?.trim().startsWith("|") &&
                      lines[i + 1]?.trim().match(/^\|[\s:-]+\|/)
                    ) {
                      // Header row
                      const headerCells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
                      let table = '<table style="border-collapse:collapse;width:100%;margin:16px 0"><thead><tr>';
                      headerCells.forEach(cell => {
                        table += `<th style="border:1px solid #ddd;padding:8px 12px;background:#f5f5f5;font-weight:bold;text-align:left">${cell}</th>`;
                      });
                      table += "</tr></thead><tbody>";
                      i += 2; // skip header + separator
                      while (i < lines.length && lines[i]?.trim().startsWith("|")) {
                        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
                        table += "<tr>";
                        cells.forEach(cell => {
                          table += `<td style="border:1px solid #ddd;padding:8px 12px">${cell}</td>`;
                        });
                        table += "</tr>";
                        i++;
                      }
                      table += "</tbody></table>";
                      result += table + "\n";
                    } else {
                      result += lines[i] + "\n";
                      i++;
                    }
                  }
                  return result;
                };

                // Convert markdown to HTML for rich-text copy, preserving links
                let html = convertTables(generatedContent)
                  .replace(/^### (.+)$/gm, "<h3>$1</h3>")
                  .replace(/^## (.+)$/gm, "<h2>$1</h2>")
                  .replace(/^# (.+)$/gm, "<h1>$1</h1>")
                  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
                  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\*(.+?)\*/g, "<em>$1</em>")
                  .replace(/^- (.+)$/gm, "<li>$1</li>")
                  .replace(/((?:<li>.*<\/li>\s*)+)/g, "<ul>$1</ul>")
                  .replace(/\n\n/g, "<br><br>")
                  .replace(/\n/g, "<br>");
                tempDiv.innerHTML = html;
                const blob = new Blob([html], { type: "text/html" });
                const textBlob = new Blob([generatedContent], { type: "text/plain" });
                navigator.clipboard.write([
                  new ClipboardItem({
                    "text/html": blob,
                    "text/plain": textBlob,
                  })
                ]).then(() => {
                  toast({ title: "Formatted content copied!", description: "Paste into Google Docs, Word, or any rich text editor." });
                }).catch(() => {
                  navigator.clipboard.writeText(generatedContent).then(() => {
                    toast({ title: "Content copied as plain text", description: "Rich text copy not supported in this browser." });
                  });
                });
              }}
            >
              <FileUp className="h-4 w-4 mr-2" />
              Copy Formatted
            </Button>

            <Button
              variant="outline"
              size="default"
              title="Downloads your article as a Markdown (.md) file to your computer. The file preserves all formatting, headings, tables, and links. You can open it in any text editor or import it into other tools."
              onClick={() => {
                if (!generatedContent.trim()) return;
                const blob = new Blob([generatedContent], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const titleMatch = generatedContent.match(/^#{1,2}\s+(.+)$/m);
                const fileName = titleMatch
                  ? titleMatch[1].replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 50)
                  : "article";
                a.download = `${fileName}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast({ title: "Article downloaded!", description: `Saved as ${fileName}.md` });
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>

            <div className="h-6 w-px bg-border" />

            {/* Secondary Actions */}
            <Button
              variant="outline"
              size="default"
              title="Generates a sample article using a demo topic (Composite Bonding vs Veneers) with all your current settings applied. Great for testing your tone profile, color palette, and other configurations before using your own topic."
              onClick={async () => {
                // Always generate through AI to pull in all current settings
                setIsGenerating(true);
                setGeneratedContent("");
                try {
                  // Use the user's topic if set, otherwise fall back to sample topic
                  const sampleTopic = formData.topic.trim() || "Composite Bonding vs Veneers: Which Smile Transformation is Right for You?";
                  
                  // Build enhanced instructions from all settings
                  let enhancedInstructions = formData.instructions || "";
                  if (!formData.topic.trim()) {
                    enhancedInstructions += "\nCompare composite bonding and veneers for cosmetic dental treatments. Include pros and cons, costs, and who each option is best for.";
                  }
                  
                  if (valuePromise.trim()) {
                    enhancedInstructions += `\n\nVALUE PROMISE - The reader MUST be able to: ${valuePromise}. Ensure every section helps achieve this outcome.`;
                  }
                  
                  const allAngles = [...selectedGapInsights, ...selectedAngles];
                  if (allAngles.length > 0) {
                    enhancedInstructions += `\n\nUNIQUE ANGLES TO INCORPORATE:\n${allAngles.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\nUse these angles to differentiate this content.`;
                  }

                  const { data, error } = await supabase.functions.invoke("generate-content", {
                    body: {
                      topic: sampleTopic,
                      length: formData.length || "long",
                      outline: formData.outline || "",
                      instructions: enhancedInstructions,
                      keywords: keywords.length > 0 ? keywords.slice(0, 5) : undefined,
                      gapAnalysis: gapAnalysis || undefined,
                      formatReference: formatReference || undefined,
                      contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
                      generateCTAs: !!ctaUrl.trim(),
                      ctaUrl: ctaUrl.trim() || undefined,
                      useKnowledgeBase: useKnowledgeBase,
                      toneProfileId: selectedToneProfileId || undefined,
                      firstHandEvidence: formData.firstHandEvidence?.trim() || undefined,
                    },
                  });
                  if (error) throw error;
                  let finalContent = data.content;
                  setAppliedRules(data.appliedRules || null);
                  if (data.ctas) {
                    setGeneratedCTAs(data.ctas);
                  } else {
                    setGeneratedCTAs(null);
                  }

                   // Auto-insert internal links if configured
                   const validUrls = internalLinks.filter((url) => url.trim());
                   if (validUrls.length > 0 && finalContent.trim()) {
                     try {
                       const linkResult = await supabase.functions.invoke("insert-internal-links", {
                         body: {
                           content: finalContent,
                           urls: validUrls,
                         },
                       });
                       if (!linkResult.error && linkResult.data?.content) {
                         finalContent = linkResult.data.content;
                       }
                     } catch (linkErr) {
                       console.warn("Auto internal link insertion failed:", linkErr);
                     }
                     // Save URLs to history
                     setInternalLinkHistory(prev => {
                       const newHistory = [...prev];
                       validUrls.forEach(url => {
                         const trimmed = url.trim();
                         const idx = newHistory.indexOf(trimmed);
                         if (idx !== -1) newHistory.splice(idx, 1);
                         newHistory.unshift(trimmed);
                       });
                       return newHistory.slice(0, 100);
                     });
                     addToInternalLinkHistoryDb(validUrls.map(u => u.trim()));
                   }

                  setGeneratedContent(finalContent, true);
                  toast({
                    title: "Sample generated!",
                    description: "Generated with all current settings applied.",
                  });
                } catch (error) {
                  console.error("Generation error:", error);
                  toast({
                    title: "Generation failed",
                    description: error instanceof Error ? error.message : "Failed to generate content",
                    variant: "destructive",
                  });
                } finally {
                  setIsGenerating(false);
                }
              }}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Load Sample
                </>
              )}
            </Button>

            {/* Reset Content button - only show if content has been modified */}
            {hasContentChanges && (
              <Button
                variant="outline"
                onClick={handleResetContent}
                disabled={isGenerating}
                className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                title="Reverts all edits, voice commands, and format changes back to the original AI-generated version. Useful if you've made changes you want to undo. This cannot be reversed once confirmed."
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Content
              </Button>
            )}

            {/* Rerun button - only show when content exists */}
            {generatedContent.trim() && (
              <Button
                variant="outline"
                onClick={handleSmartRerun}
                disabled={isGenerating || isRerunning}
                title="Detects which settings you've changed since the last generation and applies only those updates to the existing article. Much faster than regenerating from scratch - preserves your content while updating tone, keywords, length, or other modified settings."
              >
                {isRerunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying changes...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Rerun
                  </>
                )}
              </Button>
            )}

            {/* Save Article button - only show when content exists */}
            {generatedContent.trim() && (
              <Button
                variant="outline"
                onClick={handleSaveArticle}
                disabled={isSavingArticle || isGenerating}
                title="Saves your article and all its settings (topic, keywords, tone, images, CTAs) to your library. You can reload and continue editing saved articles anytime from the Saved Articles page."
              >
                {isSavingArticle ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Article
                  </>
                )}
              </Button>
            )}

            {/* Saved Articles link */}
            <Button
              variant="ghost"
              onClick={() => navigate("/articles")}
              title="Opens your library of previously saved articles. You can load, edit, or re-export any saved article. Articles are saved with all their settings so you can pick up where you left off."
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Saved Articles
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isGenerating}
                  title="Clear options: remove just the generated content, just the blog post settings (topic, keywords, etc.), or clear everything to start fresh."
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleClearContent} disabled={!generatedContent}>
                  <FileText className="h-4 w-4 mr-2" />
                  Clear Generated Content
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearSettings}>
                  <Settings className="h-4 w-4 mr-2" />
                  Clear Blog Post Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleClearForm} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Everything
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className={isPreviewFullscreen ? "px-4 py-6" : "container mx-auto px-4 py-6 max-w-[1800px]"}>
        <div className={`grid gap-6 min-h-[calc(100vh-180px)] ${isPreviewFullscreen ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
          {/* Left Panel - Form (hidden in fullscreen mode) */}
          {!isPreviewFullscreen && <Card className="flex flex-col settings-panel">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Blog Post Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-6 overflow-auto">
              {/* Section 1: Topic */}
              <CollapsibleSection
                number={1}
                title="What is the topic of your post?"
                isComplete={!!formData.topic.trim()}
                summary={formData.topic}
                defaultOpen={!formData.topic.trim()}
              >
                <Input
                  id="topic"
                  placeholder="e.g., Best practices for React performance optimization"
                  value={formData.topic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, topic: e.target.value }))
                  }
                  className="bg-input border-2 border-input-border"
                />
              </CollapsibleSection>

              {/* Section 2: Value Promise - Required */}
              <CollapsibleSection
                number={2}
                title="Value Promise"
                isComplete={!!valuePromise.trim()}
                summary={valuePromise}
                icon={<Target className="h-4 w-4 text-primary" />}
                required
                defaultOpen={!valuePromise.trim()}
              >
                <p className="text-xs text-muted-foreground mb-2">
                  Define 5 specific points this article must deliver. Each claim will be individually verified.
                </p>
                <div className="space-y-2">
                  {valuePromiseClaims.map((claim, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{index + 1}.</span>
                      <Input
                        placeholder={
                          index === 0 ? "e.g., Compare Albanian vs British food side by side" :
                          index === 1 ? "e.g., Cover gluten-free options for both cuisines" :
                          index === 2 ? "e.g., Address common food sensitivities" :
                          index === 3 ? "e.g., Include practical cost comparisons" :
                          "e.g., Provide actionable meal planning tips"
                        }
                        className="bg-input border-2 border-input-border text-sm"
                        value={claim}
                        onChange={(e) => {
                          setValuePromiseClaims(prev => {
                            const next = [...prev];
                            next[index] = e.target.value;
                            return next;
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {(gapAnalysis.trim() || selectedAngles.length > 0 || selectedGapInsights.length > 0) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 text-xs"
                      onClick={() => {
                        const allAngles = [...selectedGapInsights, ...selectedAngles];
                        if (allAngles.length > 0) {
                          const newClaims = ["", "", "", "", ""];
                          allAngles.slice(0, 5).forEach((a, i) => { newClaims[i] = a; });
                          setValuePromiseClaims(newClaims);
                          toast({
                            title: "Value promise claims populated",
                            description: "Based on your selected gap insights and angles",
                          });
                        }
                      }}
                      title="Auto-fill from gap analysis & angles"
                    >
                      <Wand2 className="h-3 w-3 mr-1" />
                      Auto-fill from analysis
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${
                      isListeningValuePromise 
                        ? "text-destructive bg-destructive/10 animate-pulse" 
                        : "text-muted-foreground hover:text-primary"
                    }`}
                    onClick={toggleValuePromiseListening}
                    title={isListeningValuePromise ? "Stop recording" : "Record voice input"}
                    disabled={!isVoiceSupported}
                  >
                    <Mic2 className="h-4 w-4" />
                  </Button>
                </div>
                {isListeningValuePromise && (
                  <p className="text-xs text-destructive animate-pulse">
                    🎙️ Listening... speak now (appends to first claim)
                  </p>
                )}
                {(gapAnalysis.trim() || selectedAngles.length > 0 || selectedGapInsights.length > 0) && !valuePromise.trim() && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <Wand2 className="h-3 w-3" />
                    Tip: Click "Auto-fill" to populate claims from your analysis
                  </p>
                )}
              </CollapsibleSection>

              {/* Section 3: Competitor URLs Section */}
              <CollapsibleSection
                number={3}
                title="Competitor Analysis (Optional)"
                isComplete={competitorUrls.some(u => u.trim()) || !!gapAnalysis.trim()}
                summary={gapAnalysis ? "Gap analysis complete" : competitorUrls.filter(u => u.trim()).length + " URL(s) added"}
                icon={<Search className="h-4 w-4" />}
              >
                <p className="text-sm text-muted-foreground">
                  Add up to 3 top-ranking article URLs for gap analysis
                </p>
                {competitorUrls.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder={`Competitor URL ${index + 1}`}
                      value={url}
                      onChange={(e) => {
                        const newUrls = [...competitorUrls];
                        newUrls[index] = e.target.value;
                        setCompetitorUrls(newUrls);
                      }}
                    />
                    {url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newUrls = [...competitorUrls];
                          newUrls[index] = "";
                          setCompetitorUrls(newUrls);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleAnalyzeUrls}
                  disabled={isAnalyzing || !competitorUrls.some((u) => u.trim())}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Run Gap Analysis
                    </>
                  )}
                </Button>
                {gapAnalysis && (
                  <div className="space-y-3">
                    {/* Show the full analysis */}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            View Full Analysis
                          </span>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ScrollArea className="h-[200px] rounded-md border p-3 bg-muted/30">
                          <div className="prose prose-sm max-w-none text-xs text-muted-foreground whitespace-pre-wrap">
                            {gapAnalysis}
                          </div>
                        </ScrollArea>
                      </CollapsibleContent>
                    </Collapsible>
                    
                    <GapAnalysisSelector
                      gapAnalysis={gapAnalysis}
                      selectedInsights={selectedGapInsights}
                      onInsightsChange={setSelectedGapInsights}
                    />
                  </div>
                )}
                
                {/* Unique Angles Panel */}
                <UniqueAnglesPanel
                  topic={formData.topic}
                  gapAnalysis={gapAnalysis}
                  selectedAngles={selectedAngles}
                  onAnglesChange={setSelectedAngles}
                  selectedGaps={selectedAngleGaps}
                  onGapsChange={setSelectedAngleGaps}
                  toneProfileId={selectedToneProfileId}
                />
              </CollapsibleSection>


              {/* Section 4: Format Reference URL */}
              <CollapsibleSection
                number={4}
                title="Format Reference (Optional)"
                isComplete={!!formatUrl.trim() || !!formatReference.trim()}
                summary={formatReference ? "Format captured" : formatUrl}
                icon={<Link className="h-4 w-4" />}
              >
                <p className="text-sm text-muted-foreground">
                  Match the format/structure of an existing article
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter URL to use as format reference"
                    value={formatUrl}
                    onChange={(e) => setFormatUrl(e.target.value)}
                    className="bg-input border-2 border-input-border"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleFetchFormat}
                    disabled={!formatUrl.trim()}
                  >
                    Capture
                  </Button>
                </div>
                
                {/* Recent URLs history - always show section */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Recent captures:</p>
                  {formatUrlHistory.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {formatUrlHistory.slice(0, 3).map((url, idx) => {
                        // Extract domain for display
                        let displayUrl = url;
                        try {
                          const urlObj = new URL(url);
                          displayUrl = urlObj.hostname.replace('www.', '') + urlObj.pathname.slice(0, 30);
                          if (urlObj.pathname.length > 30) displayUrl += '...';
                        } catch {
                          displayUrl = url.slice(0, 40) + (url.length > 40 ? '...' : '');
                        }
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setFormatUrl(url)}
                            className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px]"
                            title={url}
                          >
                            {displayUrl}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 italic">No recent captures yet - capture a URL to save it here</p>
                  )}
                </div>
                
                {formatReference && (
                  <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    ✓ Format captured - will be used during generation
                  </div>
                )}
              </CollapsibleSection>

              {/* Section 5: Context Files Upload */}
              <CollapsibleSection
                number={5}
                title="Context Files (Optional)"
                isComplete={contextFiles.length > 0}
                summary={contextFiles.length > 0 ? `${contextFiles.length} file(s) uploaded` : undefined}
                icon={<Upload className="h-4 w-4" />}
              >
                <p className="text-sm text-muted-foreground">
                  Upload text/markdown files with brand voice, research, or reference material
                </p>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".txt,.md,.json"
                    multiple
                    onChange={handleFileUpload}
                    disabled={isUploadingFile}
                    className="cursor-pointer"
                  />
                </div>
                {isUploadingFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </div>
                )}
                {contextFiles.length > 0 && (
                  <div className="space-y-2">
                    {contextFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-md bg-muted p-2 text-sm"
                      >
                        <span className="truncate">{file.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            setContextFiles((prev) =>
                              prev.filter((_, i) => i !== index)
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Separator className="my-3" />

                <ContextHubPanel
                  contextFiles={contextFiles}
                  onLoadTopicFiles={(files) => {
                    setContextFiles((prev) => {
                      const existingNames = new Set(prev.map((f) => f.name));
                      const newFiles = files.filter((f) => !existingNames.has(f.name));
                      return [...prev, ...newFiles];
                    });
                  }}
                />
              </CollapsibleSection>

              {/* Section 6: Tone of Voice Profiles */}
              <CollapsibleSection
                number={6}
                title="Tone of Voice (Optional)"
                isComplete={!!selectedToneProfileId}
                summary={selectedToneProfileId ? "Tone profile selected" : undefined}
                icon={<Mic2 className="h-4 w-4" />}
              >
                <ToneProfilePanel
                  selectedProfileId={selectedToneProfileId}
                  onProfileSelect={setSelectedToneProfileId}
                  useFirstPerson={useFirstPerson}
                  onUseFirstPersonChange={setUseFirstPerson}
                />
              </CollapsibleSection>

              {/* Section 7: SEO Knowledge Base */}
              <CollapsibleSection
                number={7}
                title="SEO Knowledge Base (Optional)"
                isComplete={useKnowledgeBase}
                summary={useKnowledgeBase ? "Knowledge base enabled" : undefined}
                icon={<BookOpen className="h-4 w-4" />}
              >
                <KnowledgeBasePanel />
              </CollapsibleSection>

              {/* Section 8: Keywords */}
              <CollapsibleSection
                number={8}
                title="SEO Keywords (up to 10, top 5 used)"
                isComplete={keywords.length > 0}
                summary={keywords.length > 0 ? keywords.slice(0, 3).join(", ") + (keywords.length > 3 ? ` +${keywords.length - 3} more` : "") : undefined}
                icon={<Tag className="h-4 w-4" />}
              >
                <p className="text-sm text-muted-foreground">
                  Paste comma-separated keywords or add one at a time
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., keyword1, keyword2, keyword3"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    className="bg-input border-2 border-input-border"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && keywordInput.trim()) {
                        e.preventDefault();
                        const newKeywords = keywordInput
                          .split(",")
                          .map((k) => k.trim().replace(/\s*\(\s*[\d,]+\s*\)\s*$/, "").replace(/\s*\(\s*\?\s*\)\s*$/, "").trim())
                          .filter((k) => k.length > 0);
                        const availableSlots = 10 - keywords.length;
                        const keywordsToAdd = newKeywords.slice(0, availableSlots);
                        if (keywordsToAdd.length > 0) {
                          setKeywords((prev) => [...prev, ...keywordsToAdd]);
                        }
                        setKeywordInput("");
                      }
                    }}
                    disabled={keywords.length >= 10}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (keywordInput.trim()) {
                        const newKeywords = keywordInput
                          .split(",")
                          .map((k) => k.trim().replace(/\s*\(\s*[\d,]+\s*\)\s*$/, "").replace(/\s*\(\s*\?\s*\)\s*$/, "").trim())
                          .filter((k) => k.length > 0);
                        const availableSlots = 10 - keywords.length;
                        const keywordsToAdd = newKeywords.slice(0, availableSlots);
                        if (keywordsToAdd.length > 0) {
                          setKeywords((prev) => [...prev, ...keywordsToAdd]);
                        }
                        setKeywordInput("");
                      }
                    }}
                    disabled={!keywordInput.trim() || keywords.length >= 10}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                          index < 5
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {index < 5 && <span className="text-xs font-medium">#{index + 1}</span>}
                        <span>{keyword}</span>
                        <button
                          type="button"
                          onClick={() => setKeywords((prev) => prev.filter((_, i) => i !== index))}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {keywords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setKeywords([])}
                        className="text-xs text-muted-foreground hover:text-destructive underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                )}
                {keywords.length >= 10 && (
                  <p className="text-xs text-muted-foreground">Maximum 10 keywords reached</p>
                )}
              </CollapsibleSection>

              {/* Section 9: Length */}
              <CollapsibleSection
                number={9}
                title="How long would you like the blog post to be?"
                isComplete={true}
                summary={formData.length === "short" ? "~500 words" : formData.length === "medium" ? "~1000 words" : formData.length === "medium-long" ? "~1500 words" : formData.length === "long" ? "~2000 words" : formData.length === "extended" ? "~3000 words" : "~3500 words"}
              >
                <Select
                  value={formData.length}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, length: value }))
                  }
                >
                  <SelectTrigger className="bg-input border-2 border-input-border">
                    <SelectValue placeholder="Select length" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (~500 words)</SelectItem>
                    <SelectItem value="medium">Medium (~1000 words)</SelectItem>
                    <SelectItem value="medium-long">Medium-Long (~1500 words)</SelectItem>
                    <SelectItem value="long">Long (~2000 words)</SelectItem>
                    <SelectItem value="extended">Extended (~3000 words)</SelectItem>
                    <SelectItem value="comprehensive">Comprehensive (~3500 words)</SelectItem>
                  </SelectContent>
                </Select>
              </CollapsibleSection>

              {/* Section 10: Outline */}
              <CollapsibleSection
                number={10}
                title="What is the outline of your post?"
                isComplete={!!formData.outline.trim()}
                summary={formData.outline.split("\n")[0]}
              >
                <div className="space-y-2">
                  <Textarea
                    id="outline"
                    placeholder="- Introduction&#10;- Main points&#10;- Conclusion"
                    className="min-h-[100px] resize-none bg-input border-2 border-input-border"
                    value={formData.outline}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, outline: e.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isGeneratingOutline || !formData.topic.trim()}
                    onClick={async () => {
                      setIsGeneratingOutline(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("generate-outline", {
                          body: {
                            topic: formData.topic,
                            valuePromise: valuePromise || undefined,
                            valuePromiseClaims: valuePromiseClaims.filter(c => c.trim()).length > 0 ? valuePromiseClaims.filter(c => c.trim()) : undefined,
                            gapAnalysis: gapAnalysis || undefined,
                            selectedAngles: selectedAngles.length > 0 ? selectedAngles : undefined,
                            selectedGapInsights: selectedGapInsights.length > 0 ? selectedGapInsights : undefined,
                            formatReference: formatReference || undefined,
                            contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
                            toneProfileId: selectedToneProfileId || undefined,
                            useKnowledgeBase,
                            keywords: keywords.length > 0 ? keywords.slice(0, 5) : undefined,
                            length: formData.length,
                          },
                        });
                        if (error) throw error;
                        if (data?.outline) {
                          setFormData((prev: typeof formData) => ({ ...prev, outline: data.outline }));
                          toast({
                            title: "Outline generated",
                            description: "Your outline has been created based on all your settings.",
                          });
                        }
                      } catch (err) {
                        console.error("Outline generation error:", err);
                        toast({
                          title: "Failed to generate outline",
                          description: err instanceof Error ? err.message : "Please try again.",
                          variant: "destructive",
                        });
                      } finally {
                        setIsGeneratingOutline(false);
                      }
                    }}
                  >
                    {isGeneratingOutline ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating outline...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Auto-Generate Outline
                      </>
                    )}
                  </Button>
                  {!formData.topic.trim() && (
                    <p className="text-xs text-muted-foreground">Enter a topic first to auto-generate an outline.</p>
                  )}
                </div>
              </CollapsibleSection>

              {/* Section 11: Custom Instructions */}
              <CollapsibleSection
                number={11}
                title="Custom Instructions (Optional)"
                isComplete={!!formData.instructions.trim()}
                summary={formData.instructions}
              >
                <Textarea
                  id="instructions"
                  placeholder="e.g., CTA should promote property in Bali, use casual British tone, include statistics..."
                  className="min-h-[60px] resize-none bg-input border-2 border-input-border"
                  value={formData.instructions}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, instructions: e.target.value }))
                  }
                />
              </CollapsibleSection>

              {/* Section 12: CTA URL */}
              <CollapsibleSection
                number={12}
                title="Call-to-Action URL (Optional)"
                isComplete={!!ctaUrl.trim()}
                summary={ctaUrl}
                icon={<ExternalLink className="h-4 w-4" />}
              >
                <p className="text-sm text-muted-foreground">
                  Add a URL to include two relevant CTA banners in the article
                </p>
                <Input
                  id="cta-url"
                  placeholder="https://your-website.com/booking"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  className="bg-input border-2 border-input-border"
                />
                
                {/* Recent CTA URLs history */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Recent URLs:</p>
                  {ctaUrlHistory.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ctaUrlHistory.slice(0, 3).map((url, idx) => {
                        let displayUrl = url;
                        try {
                          const urlObj = new URL(url);
                          displayUrl = urlObj.hostname.replace('www.', '') + urlObj.pathname.slice(0, 20);
                          if (urlObj.pathname.length > 20) displayUrl += '...';
                        } catch {
                          displayUrl = url.slice(0, 35) + (url.length > 35 ? '...' : '');
                        }
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setCtaUrl(url)}
                            className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]"
                            title={url}
                          >
                            {displayUrl}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 italic">No recent URLs yet - generate content with a CTA URL to save it here</p>
                  )}
                </div>
                
                {ctaUrl.trim() && (
                  <div className="space-y-2">
                    <p className="text-xs text-primary">
                      ✓ Two CTA banners will be generated (middle + end of article)
                    </p>
                    {generatedContent.trim() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshCTAs}
                        disabled={isApplyingFormat}
                        className="w-full text-xs"
                      >
                        {isApplyingFormat ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Refresh CTAs in Current Article
                      </Button>
                    )}
                  </div>
                )}
              </CollapsibleSection>

              {/* Section 13: Internal Links */}
              <CollapsibleSection
                number={13}
                title="Internal Links (Optional)"
                isComplete={internalLinks.some(u => u.trim())}
                summary={internalLinks.filter(u => u.trim()).length > 0 ? `${internalLinks.filter(u => u.trim()).length} link(s)` : undefined}
                icon={<Link className="h-4 w-4" />}
              >
                <p className="text-sm text-muted-foreground">
                  Add up to 12 internal URLs to contextually link within your article
                </p>
                <div className="space-y-2">
                  {internalLinks.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground font-mono w-4 shrink-0">{idx + 1}.</span>
                      <Input
                        placeholder="https://your-site.com/related-page"
                        value={url}
                        onChange={(e) => {
                          const updated = [...internalLinks];
                          updated[idx] = e.target.value;
                          setInternalLinks(updated);
                        }}
                        onBlur={() => {
                          const trimmed = url.trim();
                          if (trimmed && trimmed.startsWith("http")) {
                            setInternalLinkHistory(prev => {
                              if (prev.includes(trimmed)) return prev;
                              const updated = [trimmed, ...prev].slice(0, 100);
                              return updated;
                            });
                            addToInternalLinkHistoryDb([trimmed]);
                          }
                        }}
                        className="bg-input border-2 border-input-border text-sm h-9"
                      />
                      {internalLinks.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => {
                            const updated = internalLinks.filter((_, i) => i !== idx);
                            setInternalLinks(updated.length === 0 ? [""] : updated);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {internalLinks.length < 12 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs w-full"
                      onClick={() => setInternalLinks([...internalLinks, ""])}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add URL
                    </Button>
                  )}
                </div>
                
                {/* Recent Internal Link URLs history - grouped by domain */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Recent URLs:</p>
                  {internalLinkHistory.length > 0 ? (() => {
                    const grouped: Record<string, string[]> = {};
                    internalLinkHistory.forEach(url => {
                      let domain = url;
                      try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
                      if (!grouped[domain]) grouped[domain] = [];
                      grouped[domain].push(url);
                    });
                      return (
                      <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                        {Object.entries(grouped).map(([domain, urls]) => (
                          <div key={domain}>
                            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">{domain}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {urls.map((url, idx) => {
                                let displayUrl = url;
                                let pathDisplay = url;
                                try {
                                  const urlObj = new URL(url);
                                  pathDisplay = urlObj.pathname === '/' ? '/' : urlObj.pathname;
                                } catch {
                                  pathDisplay = url;
                                }
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      const emptyIdx = internalLinks.findIndex(u => !u.trim());
                                      if (emptyIdx !== -1) {
                                        const updated = [...internalLinks];
                                        updated[emptyIdx] = url;
                                        setInternalLinks(updated);
                                      } else if (internalLinks.length < 12) {
                                        setInternalLinks([...internalLinks, url]);
                                      }
                                    }}
                                    className="text-xs px-2.5 py-1.5 rounded-md bg-muted hover:bg-primary/10 border border-border hover:border-primary/30 text-foreground/80 hover:text-foreground transition-colors text-left break-all"
                                    title={url}
                                  >
                                    {pathDisplay}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })() : (
                    <p className="text-xs text-muted-foreground/60 italic">No recent URLs yet - links used in generated articles will appear here</p>
                  )}
                </div>
                {internalLinks.some(u => u.trim()) && generatedContent.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleInsertInternalLinks}
                    disabled={isInsertingLinks}
                    className="w-full text-xs"
                  >
                    {isInsertingLinks ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Link className="h-3 w-3 mr-1" />
                    )}
                    Insert Links into Article
                  </Button>
                )}
              </CollapsibleSection>

              {/* Section 14: Color Palette */}
              <CollapsibleSection
                number={14}
                title="Color Scheme"
                isComplete={!!selectedColorPalette}
                summary={selectedColorPalette?.name || "Default"}
              >
                <p className="text-sm text-muted-foreground">
                  Choose a color palette for tables, TL;DR sections, and CTA banners
                </p>
                <ColorPaletteSelector
                  selectedPalette={selectedColorPalette}
                  onSelectPalette={setSelectedColorPalette}
                />
              </CollapsibleSection>

              {/* Section 15: Output Options */}
              <CollapsibleSection
                number={15}
                title="Output Options"
                isComplete={true}
                summary={[skipNavigation && "Navigation skipped", skipFaqs && "FAQs skipped", skipQuickTips && "Tips skipped", skipSources && "Sources skipped", includeTrustSignal && "Trust box on"].filter(Boolean).join(", ") || "All sections included"}
                icon={<Settings className="h-4 w-4" />}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="skip-navigation" className="text-sm font-medium">
                        Skip "In This Article" Section
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Exclude the navigation panel from the generated article and HTML export
                      </p>
                    </div>
                    <Switch
                      id="skip-navigation"
                      checked={skipNavigation}
                      onCheckedChange={setSkipNavigation}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="skip-faqs" className="text-sm font-medium">
                        Skip FAQs
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Exclude the FAQ section from generated articles and Apply Format
                      </p>
                    </div>
                    <Switch
                      id="skip-faqs"
                      checked={skipFaqs}
                      onCheckedChange={setSkipFaqs}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="skip-quick-tips" className="text-sm font-medium">
                        Skip Quick Tips
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Exclude the Quick Tips section from generated articles and Apply Format
                      </p>
                    </div>
                    <Switch
                      id="skip-quick-tips"
                      checked={skipQuickTips}
                      onCheckedChange={setSkipQuickTips}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="skip-sources" className="text-sm font-medium">
                        Skip Sources / References
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Exclude per-section sources and the References section from generated articles
                      </p>
                    </div>
                    <Switch
                      id="skip-sources"
                      checked={skipSources}
                      onCheckedChange={setSkipSources}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="generate-faq-schema" className="text-sm font-medium">
                        Generate FAQ Schema (JSON-LD)
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Append FAQPage structured data script to the exported HTML for rich results
                      </p>
                    </div>
                    <Switch
                      id="generate-faq-schema"
                      checked={generateFaqSchema}
                      onCheckedChange={setGenerateFaqSchema}
                    />
                  </div>

                  <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label htmlFor="include-trust-signal" className="text-sm font-medium">
                          Include "Why Trust This Article" Box
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Adds a collapsible E-E-A-T trust panel at the very top of the article, just above the TL;DR.
                        </p>
                      </div>
                      <Switch
                        id="include-trust-signal"
                        checked={includeTrustSignal}
                        onCheckedChange={setIncludeTrustSignal}
                      />
                    </div>

                    {includeTrustSignal && (
                      <div className="space-y-2 pt-1">
                        <div className="space-y-1">
                          <label htmlFor="trust-signal-title" className="text-xs font-medium text-muted-foreground">
                            Box Title
                          </label>
                          <Input
                            id="trust-signal-title"
                            value={trustSignalTitle}
                            onChange={(e) => setTrustSignalTitle(e.target.value)}
                            placeholder="Why You Can Trust This Article"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="trust-signal-content" className="text-xs font-medium text-muted-foreground">
                            Trust Content (Markdown supported — author, credentials, sources policy, verification links)
                          </label>
                          <Textarea
                            id="trust-signal-content"
                            value={trustSignalContent}
                            onChange={(e) => setTrustSignalContent(e.target.value)}
                            rows={6}
                            className="font-mono text-xs"
                            placeholder="Author bio, credentials, editorial policy, links to LinkedIn/reviews, etc."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleSection>

              {/* Section 16: Article Images */}
              <CollapsibleSection
                number={16}
                title="Article Images (Optional)"
                isComplete={articleImages.length > 0}
                summary={articleImages.length > 0 ? `${articleImages.length} image(s) uploaded` : undefined}
                icon={<ImagePlus className="h-4 w-4" />}
              >
                <ArticleImagesPanel
                  images={articleImages}
                  onImagesChange={setArticleImages}
                  onAllocateLogically={handleAllocateImagesLogically}
                  isAllocating={isAllocatingImages}
                  hasContent={!!generatedContent}
                />
              </CollapsibleSection>

              {/* First-Hand Evidence (Optional) - Google flags first-hand experience as the #1 non-commodity signal for GenAI surfaces */}
              <CollapsibleSection
                number={17}
                title="First-Hand Evidence (Optional)"
                isComplete={!!(formData.firstHandEvidence || "").trim()}
                summary={formData.firstHandEvidence}
              >
                <p className="text-xs text-muted-foreground">
                  Anecdote, case study, internal data, or expert observation. The writer will weave this into the article as a concrete, citable detail. Format stays the same - this only affects the copy. Leave blank to disable.
                </p>
                <Textarea
                  id="first-hand-evidence"
                  placeholder={`e.g. "Last March we surveyed 240 readers and 68% said they tried at least one new hobby after age 50…" or "A practitioner in Hamburg observed that group walks consistently outperform 1:1 meetups for first-time users."`}
                  className="min-h-[90px] resize-none bg-input border-2 border-input-border"
                  value={formData.firstHandEvidence || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, firstHandEvidence: e.target.value }))
                  }
                />
                <EvidenceSuggestionsPanel
                  article={generatedContent}
                  ctaUrl={ctaUrl}
                  topic={formData.topic}
                  onInsert={(updated) => setGeneratedContent(updated)}
                />
              </CollapsibleSection>


              {/* Pre-Generation Checklist */}
              <GenerationChecklist items={checklistItems} />
            </CardContent>
          </Card>}

          {/* Right Panel - Output */}
          <Card className={`flex flex-col ${isPreviewFullscreen ? "max-w-4xl mx-auto" : ""}`}>
            <CardHeader className="pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {isPreviewFullscreen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPreviewFullscreen(false)}
                      className="h-8 w-8 p-0"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  )}
                  Generated Content
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                  title={isPreviewFullscreen ? "Exit fullscreen" : "Fullscreen preview"}
                >
                  {isPreviewFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto space-y-4">
              {/* Human Mode / Humanise Only Progress Indicator */}
              {((isGenerating && useHumanMode) || isHumanisingOnly) && pipelineStages.length > 0 && (
                <GenerationProgress
                  stages={pipelineStages}
                  currentStage={currentPipelineStage}
                  totalSections={totalSections}
                  currentSection={currentSectionIndex}
                  error={pipelineError}
                  title={isHumanisingOnly ? "Humanising Content" : undefined}
                />
              )}

              {generatedContent ? (
                <>
                  {/* Inline Editing Toggle + Insert Image */}
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="edit-mode"
                        checked={isEditMode}
                        onCheckedChange={setIsEditMode}
                      />
                      <Label htmlFor="edit-mode" className="text-sm cursor-pointer">
                        {isEditMode ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Edit2 className="h-3.5 w-3.5" />
                            Editing enabled - click text to edit
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Eye className="h-3.5 w-3.5" />
                            Preview mode
                          </span>
                        )}
                      </Label>
                    </div>
                    
                    {/* Insert Image Button with Floating Picker */}
                    {articleImages.length > 0 && (
                      <Popover open={isImagePopoverOpen} onOpenChange={setIsImagePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button 
                            variant={isImagePopoverOpen ? "default" : "outline"} 
                            size="sm" 
                            className="h-8"
                          >
                            <Image className="h-3.5 w-3.5 mr-1.5" />
                            Insert Image ({articleImages.length})
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-80 p-3" 
                          align="end"
                          side="bottom"
                          sideOffset={8}
                          // Keep popover open while interacting with article
                          onInteractOutside={(e) => {
                            // Only close if clicking outside both the popover and the article area
                            const target = e.target as HTMLElement;
                            if (target.closest('article') || target.closest('[data-radix-popper-content-wrapper]')) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium">Click image to insert</div>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                stays open
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {cursorInsertPosition !== null 
                                ? "✓ Insertion point set - click an image to add it there." 
                                : "Click in the article to set where images go, or they'll be added at the end."}
                            </p>
                            <ScrollArea className="h-[240px]">
                              <div className="grid grid-cols-2 gap-2">
                                {articleImages.map((image, index) => (
                                  <button
                                    key={index}
                                    className="relative group rounded-md border bg-muted/50 p-1.5 hover:border-primary hover:bg-primary/5 transition-colors text-left"
                                    onClick={() => {
                                      const imageMarkdown = `\n\n![${image.alt}](${image.url})\n`;
                                      
                                      if (cursorInsertPosition !== null && cursorInsertPosition > 0) {
                                        // Insert at cursor position
                                        const before = generatedContent.slice(0, cursorInsertPosition);
                                        const after = generatedContent.slice(cursorInsertPosition);
                                        setGeneratedContent(before + imageMarkdown + after);
                                        // Move cursor position forward for next insert
                                        setCursorInsertPosition(cursorInsertPosition + imageMarkdown.length);
                                        toast({
                                          title: "Image inserted!",
                                          description: `${image.name} added at cursor position`,
                                        });
                                      } else {
                                        // Fallback: add at end
                                        setGeneratedContent(generatedContent + imageMarkdown);
                                        toast({
                                          title: "Image inserted!",
                                          description: `${image.name} added to end of article`,
                                        });
                                      }
                                      // Keep popover open for adding more images
                                    }}
                                  >
                                    <div className="aspect-square w-full overflow-hidden rounded bg-background">
                                      <img
                                        src={image.url}
                                        alt={image.alt}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground truncate mt-1" title={image.name}>
                                      {image.name}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </ScrollArea>
                            <div className="flex gap-2 pt-1 border-t">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="flex-1 h-7 text-xs"
                                onClick={() => setIsImagePopoverOpen(false)}
                              >
                                Done
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>

                  {/* Generated Article - Always rendered, optionally editable */}
                  <div 
                    className={`relative ${isEditMode ? "ring-1 ring-primary/20 rounded-md p-2 -m-2" : ""} ${isDraggingImage ? "ring-2 ring-primary ring-dashed bg-primary/5" : ""}`}
                    onDragOver={(e) => {
                      // Check if this is an image drag
                      if (e.dataTransfer.types.includes("application/json")) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                        setIsDraggingImage(true);
                        
                        // Find and highlight the target element
                        const target = e.target as HTMLElement;
                        let blockElement: HTMLElement | null = target;
                        
                        // Walk up to find a block-level element
                        while (blockElement && !blockElement.tagName.match(/^(H[1-6]|P|LI|UL|OL|TABLE|BLOCKQUOTE|DIV)$/i)) {
                          blockElement = blockElement.parentElement;
                        }
                        
                        // Only update if we found a different element
                        if (blockElement && blockElement !== dropTargetElement) {
                          // Remove highlight from previous element
                          if (dropTargetElement) {
                            dropTargetElement.style.outline = '';
                            dropTargetElement.style.outlineOffset = '';
                            dropTargetElement.style.backgroundColor = '';
                          }
                          // Add highlight to new element
                          blockElement.style.outline = '2px solid hsl(var(--primary))';
                          blockElement.style.outlineOffset = '2px';
                          blockElement.style.backgroundColor = 'hsl(var(--primary) / 0.1)';
                          setDropTargetElement(blockElement);
                        }
                      }
                    }}
                    onDragLeave={(e) => {
                      // Only set to false if we're leaving the container, not entering a child
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setIsDraggingImage(false);
                        // Clean up highlight
                        if (dropTargetElement) {
                          dropTargetElement.style.outline = '';
                          dropTargetElement.style.outlineOffset = '';
                          dropTargetElement.style.backgroundColor = '';
                          setDropTargetElement(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingImage(false);
                      
                      // Clean up highlight
                      if (dropTargetElement) {
                        dropTargetElement.style.outline = '';
                        dropTargetElement.style.outlineOffset = '';
                        dropTargetElement.style.backgroundColor = '';
                      }
                      
                      try {
                        const jsonData = e.dataTransfer.getData("application/json");
                        if (!jsonData) return;
                        
                        const imageData = JSON.parse(jsonData);
                        if (imageData.type !== "article-image") return;
                        
                        // Use the highlighted element as the drop target
                        const insertAfterElement = dropTargetElement;
                        setDropTargetElement(null);
                        
                        // Build the markdown image to insert
                        const imageMarkdown = `![${imageData.alt}](${imageData.url})`;
                        
                        if (!insertAfterElement) {
                          // No target found, append at end
                          setGeneratedContent(generatedContent + "\n\n" + imageMarkdown + "\n");
                          toast({
                            title: "Image added",
                            description: `${imageData.name} added to end of article`,
                          });
                          return;
                        }
                        
                        // Get the text content of the element we're dropping after
                        const elementText = insertAfterElement.textContent?.trim() || "";
                        const lines = generatedContent.split("\n");
                        let insertIndex = -1;
                        
                        // Try multiple matching strategies
                        // Strategy 1: Match by heading (if it's a heading)
                        if (insertAfterElement.tagName.match(/^H[1-6]$/i)) {
                          const headingLevel = insertAfterElement.tagName[1];
                          const headingPrefix = "#".repeat(parseInt(headingLevel)) + " ";
                          
                          for (let i = 0; i < lines.length; i++) {
                            if (lines[i].startsWith(headingPrefix)) {
                              const lineHeadingText = lines[i].slice(headingPrefix.length).trim();
                              if (elementText.includes(lineHeadingText) || lineHeadingText.includes(elementText.slice(0, 20))) {
                                insertIndex = i;
                                break;
                              }
                            }
                          }
                        }
                        
                        // Strategy 2: Match by text content (first 40 chars)
                        if (insertIndex < 0 && elementText.length > 5) {
                          const searchText = elementText.slice(0, 40).toLowerCase();
                          
                          for (let i = 0; i < lines.length; i++) {
                            const lineText = lines[i].replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim().toLowerCase();
                            if (lineText.length > 5 && (lineText.includes(searchText.slice(0, 25)) || searchText.includes(lineText.slice(0, 25)))) {
                              insertIndex = i;
                              break;
                            }
                          }
                        }
                        
                        // Strategy 3: Match by element ID (for headings with IDs)
                        if (insertIndex < 0 && insertAfterElement.id) {
                          const headingId = insertAfterElement.id;
                          
                          for (let i = 0; i < lines.length; i++) {
                            const lineSlug = lines[i].toLowerCase().replace(/^#+\s*/, '').replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                            if (lineSlug === headingId) {
                              insertIndex = i;
                              break;
                            }
                          }
                        }
                        
                        // If we found a matching line, insert after it
                        if (insertIndex >= 0) {
                          // Find the end of this paragraph/section
                          let targetIndex = insertIndex + 1;
                          
                          // For paragraphs, insert right after; for headings, find end of first paragraph
                          if (lines[insertIndex].startsWith("#")) {
                            // It's a heading, find end of first paragraph after it
                            while (targetIndex < lines.length && lines[targetIndex].trim() !== "" && !lines[targetIndex].startsWith("#")) {
                              targetIndex++;
                            }
                          }
                          
                          // Insert the image
                          lines.splice(targetIndex, 0, "", imageMarkdown, "");
                          setGeneratedContent(lines.join("\n"));
                          
                          toast({
                            title: "Image inserted!",
                            description: `${imageData.name} added after "${elementText.slice(0, 25)}..."`,
                          });
                          return;
                        }
                        
                        // Last fallback: append at end
                        setGeneratedContent(generatedContent + "\n\n" + imageMarkdown + "\n");
                        toast({
                          title: "Image added",
                          description: `${imageData.name} added to end of article`,
                        });
                      } catch (err) {
                        console.error("Drop error:", err);
                      }
                    }}
                  >
                    {isDraggingImage && !dropTargetElement && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
                          Hover over a paragraph to insert image
                        </div>
                      </div>
                    )}
                    {(
                    <article 
                      className={`prose prose-sm max-w-none dark:prose-invert ${isDarkSitePalette ? 'rounded-lg p-4 sm:p-6' : ''}`}
                      contentEditable={isEditMode}
                      suppressContentEditableWarning
                      onClick={(e) => {
                        if (!isEditMode) return;
                        
                        // Find the closest heading or paragraph to determine insert position
                        const target = e.target as HTMLElement;
                        let blockElement: HTMLElement | null = target;
                        
                        // Walk up to find a block-level element with text content
                        while (blockElement && !blockElement.tagName?.match(/^(H[1-6]|P|LI|BLOCKQUOTE)$/i)) {
                          blockElement = blockElement.parentElement;
                        }
                        
                        if (blockElement) {
                          const textContent = blockElement.textContent?.trim() || '';
                          if (textContent.length > 10) {
                            // Find this text in the markdown content
                            // Normalize both for comparison
                            const normalizedSearch = textContent.substring(0, 50).replace(/\s+/g, ' ').toLowerCase();
                            const lines = generatedContent.split('\n');
                            
                            let foundIndex = -1;
                            let charIndex = 0;
                            
                            for (let i = 0; i < lines.length; i++) {
                              const normalizedLine = lines[i].replace(/[#*_\[\]()]/g, '').replace(/\s+/g, ' ').toLowerCase();
                              if (normalizedLine.includes(normalizedSearch.substring(0, 30))) {
                                // Found the line, position is at the end of this line
                                foundIndex = charIndex + lines[i].length;
                                break;
                              }
                              charIndex += lines[i].length + 1; // +1 for newline
                            }
                            
                            if (foundIndex > 0) {
                              setCursorInsertPosition(foundIndex);
                            }
                          }
                        }
                      }}
                      onBlur={(e) => {
                        // Only save if we're still in edit mode and the blur is leaving the article entirely
                        // This prevents the issue where clicking the switch triggers a save before the switch takes effect
                        if (isEditMode && !e.currentTarget.contains(e.relatedTarget as Node)) {
                          // Convert edited HTML back to approximate markdown
                          const element = e.currentTarget;
                          const html = element.innerHTML;
                          
                          // Skip if no meaningful content
                          if (!html || html.trim().length === 0) {
                            console.warn("Skipping empty content save");
                            return;
                          }
                          
                          // Simple HTML to Markdown conversion
                          let markdown = html
                            // Headers
                            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
                            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
                            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
                            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
                            // Bold and italic
                            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
                            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
                            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
                            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
                            // Links
                            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
                            // Lists
                            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
                            .replace(/<\/?ul[^>]*>/gi, '\n')
                            .replace(/<\/?ol[^>]*>/gi, '\n')
                            // Paragraphs and breaks
                            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
                            .replace(/<br\s*\/?>/gi, '\n')
                            .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n')
                            // Clean up remaining tags
                            .replace(/<[^>]+>/g, '')
                            // Clean up entities
                            .replace(/&nbsp;/g, ' ')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            // Clean up extra whitespace
                            .replace(/\n{3,}/g, '\n\n')
                            .trim();
                          
                          // Only update if we got valid content back
                          if (markdown && markdown.length > 50) {
                            setGeneratedContent(markdown);
                          }
                        }
                      }}
                      style={{ 
                        outline: 'none',
                        cursor: isEditMode ? 'text' : 'default',
                        // Apply colors via CSS custom properties
                        ...(articlePaletteStyles || {}),
                        ...(isDarkSitePalette ? { backgroundColor: '#111111' } : {})
                      }}
                    >
                      {(() => {
                        // Extract "In This Article" navigation items - robust parsing + fallback
                        const navItems = getBestNavigationItems(generatedContent);
                        // Extract FAQ items
                        const faqItems = skipFaqs ? [] : extractFAQFromContent(generatedContent);
                        // Remove "In This Article" and FAQ sections from markdown for custom rendering
                        let contentWithoutNav = removeInThisArticleSection(generatedContent);
                        contentWithoutNav = removeFAQSection(contentWithoutNav);
                        
                        // Extract inline CTA divs and replace with markers for rendering
                        const ctaDivRegex = /<div class="cta-banner">\s*<div class="cta-headline">([^<]+)<\/div>\s*<div class="cta-description">([^<]+)<\/div>\s*<a href="([^"]+)" class="cta-button">([^<]+)<\/a>\s*<\/div>/gi;
                        const inlineCTAs: { headline: string; description: string; url: string; buttonText: string }[] = [];
                        contentWithoutNav = contentWithoutNav.replace(ctaDivRegex, (_, headline, description, url, buttonText) => {
                          inlineCTAs.push({ headline: headline.trim(), description: description.trim(), url: url.trim(), buttonText: buttonText.trim() });
                          return `\n\n<!--CTA_MARKER_${inlineCTAs.length - 1}-->\n\n`;
                        });
                        const hasInlineCtas = inlineCTAs.length > 0;
                        
                        // Split content to insert CTAs and Navigation Panel
                        const lines = contentWithoutNav.split('\n');
                        const h2Indices: number[] = [];
                        lines.forEach((line, idx) => {
                          if (/^## /.test(line) && !/tldr/i.test(line) && !/in this article/i.test(line)) {
                            h2Indices.push(idx);
                          }
                        });
                        
                        // Find where TL;DR ends (after the bullet points)
                        let tldrEndIndex = -1;
                        const tldrStartIndex = lines.findIndex(line => /^## TL;?DR/i.test(line));
                        if (tldrStartIndex >= 0) {
                          // Find next H2 after TL;DR, skipping Quick Tips so navigation goes AFTER tips
                          for (let i = tldrStartIndex + 1; i < lines.length; i++) {
                            if (/^## /.test(lines[i]) && !/tldr/i.test(lines[i]) && !/quick\s*tips/i.test(lines[i])) {
                              tldrEndIndex = i;
                              break;
                            }
                          }
                        }
                        
                        // Insert middle CTA after ~40% of H2s
                        const middleInsertIndex = h2Indices.length > 2 
                          ? h2Indices[Math.floor(h2Indices.length * 0.4)]
                          : -1;
                        
                        // Build parts: content before TL;DR end, navigation panel, rest of content
                        const parts: { content: string; ctaPosition?: 'middle' | 'end'; navPanel?: boolean; trustSignal?: boolean }[] = [];
                        
                        if (tldrEndIndex > 0 && navItems.length > 0) {
                          // Part 1: Title + TL;DR
                          parts.push({ content: lines.slice(0, tldrEndIndex).join('\n') });
                          // Part 2: Navigation Panel
                          parts.push({ content: '', navPanel: true });
                          
                          // Rest of content with potential CTA insertion
                          const restLines = lines.slice(tldrEndIndex);
                          const restContent = restLines.join('\n');
                          
                          if (middleInsertIndex > 0 && generatedCTAs?.middle && ctaUrl && !hasInlineCtas) {
                            // Calculate relative index for CTA in rest content
                            const restH2Indices: number[] = [];
                            restLines.forEach((line, idx) => {
                              if (/^## /.test(line) && !/tldr/i.test(line)) {
                                restH2Indices.push(idx);
                              }
                            });
                            const relativeMiddleIndex = restH2Indices.length > 2 
                              ? restH2Indices[Math.floor(restH2Indices.length * 0.4)]
                              : -1;
                            
                            if (relativeMiddleIndex > 0) {
                              parts.push({ content: restLines.slice(0, relativeMiddleIndex).join('\n') });
                              parts.push({ content: '', ctaPosition: 'middle' });
                              parts.push({ content: restLines.slice(relativeMiddleIndex).join('\n') });
                            } else {
                              parts.push({ content: restContent });
                            }
                          } else {
                            parts.push({ content: restContent });
                          }
                        } else if (middleInsertIndex > 0 && generatedCTAs?.middle && ctaUrl && !hasInlineCtas) {
                          parts.push({ content: lines.slice(0, middleInsertIndex).join('\n') });
                          parts.push({ content: '', ctaPosition: 'middle' });
                          parts.push({ content: lines.slice(middleInsertIndex).join('\n') });
                        } else {
                          parts.push({ content: contentWithoutNav });
                        }

                        // Trust signal: split the part that starts with title/intro so the box sits
                        // immediately above the TL;DR heading.
                        if (includeTrustSignal && tldrStartIndex >= 0 && parts[0]?.content) {
                          const firstLines = parts[0].content.split('\n');
                          const localTldrIdx = firstLines.findIndex(line => /^## TL;?DR/i.test(line));
                          if (localTldrIdx > 0) {
                            const preTldr = firstLines.slice(0, localTldrIdx).join('\n');
                            const fromTldr = firstLines.slice(localTldrIdx).join('\n');
                            parts.splice(
                              0,
                              1,
                              { content: preTldr },
                              { content: '', trustSignal: true },
                              { content: fromTldr },
                            );
                          } else {
                            // No TL;DR found in first part — prepend trust box at the very top.
                            parts.unshift({ content: '', trustSignal: true });
                          }
                        }
                        
                        return (
                          <>
                            {parts.map((part, idx) => (
                              <div key={idx}>
                                {part.trustSignal ? (
                                  <TrustSignalBox
                                    title={trustSignalTitle}
                                    content={trustSignalContent}
                                    brandColors={selectedColorPalette}
                                  />
                                ) : part.navPanel && navItems.length > 0 && !skipNavigation ? (
                                  <div className="my-6">
                                    <ArticleNavigationPanel 
                                      items={navItems}
                                      skipNavigation={skipNavigation}
                                      onSkipNavigationChange={setSkipNavigation}
                                      isDarkSite={isDarkSitePalette}
                                    />
                                  </div>
                                ) : part.navPanel && navItems.length > 0 && skipNavigation ? (
                                  <div className="my-6 rounded-lg border border-dashed border-muted-foreground/30 p-4">
                                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                                      <span className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-bold">
                                          #
                                        </span>
                                        In This Article (skipped)
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs">Skip</span>
                                        <Switch 
                                          checked={skipNavigation}
                                          onCheckedChange={setSkipNavigation}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : part.ctaPosition === 'middle' && generatedCTAs?.middle && ctaUrl ? (
                                  <CTABanner
                                    headline={generatedCTAs.middle.headline}
                                    description={generatedCTAs.middle.description}
                                    buttonText={generatedCTAs.middle.buttonText}
                                    url={ctaUrl}
                                    tagline={(generatedCTAs.middle as any).tagline}
                                    brandColors={selectedColorPalette}
                                  />
                                ) : part.content ? (
                                   (() => {
                                     // Sanitize: remove flattened/broken table fragments where the AI lost pipes & newlines
                                     // (e.g. "Personality TraitRecommended EnvironmentWhy It WorksIntroverted/Anxious...")
                                     const sanitizeFlattenedTables = (text: string): string => {
                                       return text
                                         .split(/\n{2,}/)
                                         .filter((para) => {
                                           const trimmed = para.trim();
                                           if (!trimmed) return true;
                                           // Keep proper markdown tables (have pipes)
                                           if (trimmed.includes("|")) return true;
                                           // Drop single-line paragraphs with 3+ CamelCase concatenations (e.g. "TraitRecommendedWhy")
                                           const camelRuns = trimmed.match(/[a-z][A-Z]/g);
                                           const isSingleLine = !trimmed.includes("\n");
                                           if (isSingleLine && camelRuns && camelRuns.length >= 3 && trimmed.length < 600) {
                                             return false;
                                           }
                                           return true;
                                         })
                                         .join("\n\n");
                                     };
                                     const sanitizedContent = sanitizeFlattenedTables(part.content);
                                     // Split content by CTA markers and render inline CTAs
                                     const ctaMarkerRegex = /<!--CTA_MARKER_(\d+)-->/g;
                                     const segments: { type: 'content' | 'cta'; value: string | number }[] = [];
                                     let lastIndex = 0;
                                     let match;
                                     
                                     while ((match = ctaMarkerRegex.exec(sanitizedContent)) !== null) {
                                      if (match.index > lastIndex) {
                                        segments.push({ type: 'content', value: sanitizedContent.slice(lastIndex, match.index) });
                                      }
                                      segments.push({ type: 'cta', value: parseInt(match[1], 10) });
                                      lastIndex = match.index + match[0].length;
                                    }
                                    
                                    if (lastIndex < sanitizedContent.length) {
                                      segments.push({ type: 'content', value: sanitizedContent.slice(lastIndex) });
                                    }
                                    
                                    // If no CTA markers, just render normally
                                    if (segments.length === 0) {
                                      segments.push({ type: 'content', value: sanitizedContent });
                                    }
                                    
                                    return (
                                      <>
                                        {segments.map((segment, segIdx) => (
                                          segment.type === 'cta' && inlineCTAs[segment.value as number] ? (
                                            <CTABanner
                                              key={`cta-${segIdx}`}
                                              headline={inlineCTAs[segment.value as number].headline}
                                              description={inlineCTAs[segment.value as number].description}
                                              buttonText={inlineCTAs[segment.value as number].buttonText}
                                              url={inlineCTAs[segment.value as number].url}
                                              brandColors={selectedColorPalette}
                                            />
                                          ) : segment.type === 'content' && (segment.value as string).trim() ? (
                                            <ReactMarkdown 
                                              key={`content-${segIdx}`}
                                              remarkPlugins={[remarkGfm]}
                                              components={{
                                                img: ({ src, alt, ...props }) => (
                                                  <div className="relative block group my-4">
                                                    <img src={src} alt={alt} {...props} className="max-w-full h-auto rounded-md" />
                                                    <button
                                                      type="button"
                                                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-lg hover:bg-destructive/90"
                                                      onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        // Remove this image from the markdown content
                                                        const imagePattern = new RegExp(`!\\[${alt?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '[^\\]]*'}\\]\\(${src?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '[^)]*'}\\)\\n*`, 'g');
                                                        const newContent = generatedContent.replace(imagePattern, '');
                                                        setGeneratedContent(newContent.replace(/\n{3,}/g, '\n\n'));
                                                        toast({
                                                          title: "Image removed",
                                                          description: "The image has been removed from the article",
                                                        });
                                                      }}
                                                      title="Remove image"
                                                    >
                                                      <X className="h-4 w-4" />
                                                    </button>
                                                  </div>
                                                ),
                                                table: ({ children, ...props }) => (
                                                  <div className="overflow-x-auto my-4">
                                                    <table className="min-w-full border-collapse border border-border" {...props}>{children}</table>
                                                  </div>
                                                ),
                                                thead: ({ children, ...props }) => (
                                                  <thead className="bg-muted" {...props}>{children}</thead>
                                                ),
                                                tbody: ({ children, ...props }) => (
                                                  <tbody {...props}>{children}</tbody>
                                                ),
                                                tr: ({ children, ...props }) => (
                                                  <tr className="border-b border-border" {...props}>{children}</tr>
                                                ),
                                                th: ({ children, ...props }) => (
                                                  <th className="px-4 py-2 text-left font-semibold border border-border" {...props}>{children}</th>
                                                ),
                                                td: ({ children, ...props }) => (
                                                  <td className="px-4 py-2 border border-border" {...props}>{children}</td>
                                                ),
                                                h2: ({ children, ...props }) => {
                                                  const text = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                                                  const headingText = String(children).toLowerCase();
                                                  // Insert FAQ before Final Thoughts
                                                  if (headingText.includes('final thought')) {
                                                    return (
                                                      <>
                                                        {faqItems.length > 0 && (
                                                          <FAQAccordion items={faqItems} brandColors={selectedColorPalette} isDarkSite={isDarkSitePalette} />
                                                        )}
                                                        <h2 id={text} {...props}>{children}</h2>
                                                      </>
                                                    );
                                                  }
                                                  return <h2 id={text} {...props}>{children}</h2>;
                                                },
                                                a: ({ href, children, ...props }) => (
                                                  <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                                                    {children}
                                                  </a>
                                                ),
                                                blockquote: ({ children, ...props }) => {
                                                  // Check if this is a CTA blockquote (has bold headline + link)
                                                  // Look for pattern: bold text followed by a link
                                                  let headline = '';
                                                  let description = '';
                                                  let buttonText = '';
                                                  let buttonUrl = '';
                                                  let tagline = '';
                                                  
                                                  // Extract text content from children
                                                  const extractText = (node: React.ReactNode): string => {
                                                    if (typeof node === 'string') return node;
                                                    if (typeof node === 'number') return String(node);
                                                    if (!node) return '';
                                                    if (Array.isArray(node)) return node.map(extractText).join('');
                                                    if (typeof node === 'object' && 'props' in node) {
                                                      const el = node as React.ReactElement;
                                                      return extractText(el.props?.children);
                                                    }
                                                    return '';
                                                  };
                                                  
                                                  // Check for CTA pattern in children - improved detection
                                                  let hasStrong = false;
                                                  let hasLink = false;
                                                  
                                                  const findElements = (node: React.ReactNode, depth = 0): void => {
                                                    if (!node) return;
                                                    if (Array.isArray(node)) {
                                                      node.forEach(n => findElements(n, depth));
                                                      return;
                                                    }
                                                    if (typeof node === 'object' && 'props' in node) {
                                                      const el = node as React.ReactElement;
                                                      const elType = el.type;
                                                      
                                                      // Check for strong element (various ways it can appear)
                                                      if (elType === 'strong' || 
                                                          (typeof elType === 'string' && elType === 'strong') ||
                                                          (el.props?.node?.tagName === 'strong')) {
                                                        hasStrong = true;
                                                        const text = extractText(el.props?.children);
                                                        // Remove emoji prefix for cleaner headline
                                                        headline = text.replace(/^[🔥🎨✨💡🚀💪🌟⭐️🎉🎯]+\s*/, '');
                                                      }
                                                      
                                                      // Check for link element (various ways it can appear)
                                                      if (elType === 'a' || 
                                                          (typeof elType === 'string' && elType === 'a') ||
                                                          el.props?.href) {
                                                        hasLink = true;
                                                        buttonText = extractText(el.props?.children);
                                                        buttonUrl = el.props?.href || '';
                                                      }
                                                      
                                                      // Recurse into children
                                                      if (el.props?.children) {
                                                        findElements(el.props.children, depth + 1);
                                                      }
                                                    }
                                                  };
                                                  
                                                  findElements(children);
                                                  
                                                  // Also check full text for CTA patterns in case element detection fails
                                                  const fullText = extractText(children);
                                                  const hasCtaPattern = /\*\*[^*]+\*\*/.test(fullText) && 
                                                                       /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(fullText);
                                                  
                                                  // If we have both strong and link (or CTA pattern in text), treat as CTA
                                                  if ((hasStrong && hasLink && buttonUrl) || 
                                                      (hasCtaPattern && buttonUrl)) {
                                                    // Extract description and tagline from full text
                                                    let remainingText = fullText
                                                      .replace(headline, '')
                                                      .replace(buttonText, '')
                                                      .replace(/\n+/g, ' ')
                                                      .trim();
                                                    
                                                    // Check for tagline pattern (text with • separators)
                                                    const taglineMatch = remainingText.match(/([^•]+•[^•]+•[^•]+)$/);
                                                    if (taglineMatch) {
                                                      tagline = taglineMatch[1].trim();
                                                      remainingText = remainingText.replace(taglineMatch[1], '').trim();
                                                    }
                                                    
                                                    // Clean up description - remove any "Description:" prefix and emoji icons
                                                    description = remainingText
                                                      .replace(/^Description:\s*/i, '')
                                                      .replace(/^[🔔📢📣🔵🔴⚪️⭕️❌✅☑️✔️]\s*Description:\s*/i, '')
                                                      .trim();
                                                    
                                                    return (
                                                      <div className="relative group">
                                                        <CTABanner
                                                          headline={headline}
                                                          description={description}
                                                          buttonText={buttonText || 'Learn More'}
                                                          url={buttonUrl}
                                                          tagline={tagline || undefined}
                                                          brandColors={selectedColorPalette}
                                                        />
                                                        <button
                                                          type="button"
                                                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-lg hover:bg-destructive/90 z-10"
                                                          onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            // Remove CTA blockquote from markdown content
                                                            const escapedUrl = buttonUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                            const ctaPattern = new RegExp(
                                                              `>\\s*\\*\\*[^*]+\\*\\*[\\s\\S]*?\\[[^\\]]+\\]\\(${escapedUrl}\\)[^\\n]*(?:\\n>\\s*[^\\n]+)*\\n*`,
                                                              'g'
                                                            );
                                                            const newContent = generatedContent.replace(ctaPattern, '');
                                                            setGeneratedContent(newContent.replace(/\n{3,}/g, '\n\n'));
                                                            toast({
                                                              title: "CTA removed",
                                                              description: "The CTA banner has been removed from the article",
                                                            });
                                                          }}
                                                          title="Remove CTA"
                                                        >
                                                          <X className="h-4 w-4" />
                                                        </button>
                                                      </div>
                                                    );
                                                  }
                                                  
                                                  // Check if this is a Quick Tip (skip CTA detection for tips)
                                                  const isQuickTip = /^Tip \d+:?/i.test(fullText);
                                                  if (isQuickTip) {
                                                    // Let the default prose styling handle it
                                                    return <blockquote {...props}>{children}</blockquote>;
                                                  }
                                                  
                                                  // Regular blockquote
                                                  return <blockquote {...props}>{children}</blockquote>;
                                                },
                                              }}
                                            >
                                              {segment.value as string}
                                            </ReactMarkdown>
                                          ) : null
                                        ))}
                                      </>
                                    );
                                  })()
                                ) : null}
                              </div>
                            ))}
                            {/* End CTA */}
                            {generatedCTAs?.end && ctaUrl && (
                              <CTABanner
                                headline={generatedCTAs.end.headline}
                                description={generatedCTAs.end.description}
                                buttonText={generatedCTAs.end.buttonText}
                                url={ctaUrl}
                                tagline={(generatedCTAs.end as any).tagline}
                                brandColors={selectedColorPalette}
                              />
                            )}
                          </>
                        );
                      })()}
                    </article>
                  )}
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p className="text-center">
                    Your generated content will appear here.
                    <br />
                    Fill in the form and click "Generate Content" to start.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Third Column - Tools & Verification (hidden in fullscreen mode) */}
          {!isPreviewFullscreen && (
            <Card className="flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Tools & Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto space-y-4">
                {generatedContent ? (
                  <>
                    {/* Voice Edit Agent */}
                    <VoiceEditAgent 
                      content={generatedContent} 
                      onContentUpdate={setGeneratedContent}
                      onCreditUsed={(action, details) => trackUsage(action, "voice_edit", details)}
                    />
                    
                    {/* Content Verification Panel */}
                    <ContentVerification
                      content={generatedContent} 
                      appliedRules={appliedRules}
                      internalLinks={internalLinks}
                      selectedGapInsights={selectedGapInsights}
                      valuePromiseClaims={valuePromiseClaims}
                      onFixEmDashes={() => {
                        const fixed = generatedContent.replace(/—/g, "-");
                        setGeneratedContent(fixed);
                        toast({
                          title: "Em dashes fixed",
                          description: "All em dashes have been replaced with regular hyphens.",
                        });
                      }}
                      onFixHorizontalLines={() => {
                        const fixed = generatedContent.replace(/^\s*[-*_]{3,}\s*$/gm, "");
                        setGeneratedContent(fixed);
                        toast({
                          title: "Horizontal lines removed",
                          description: "All horizontal lines have been removed from the content.",
                        });
                      }}
                      onRegenerateForWordCount={async () => {
                        if (!generatedContent.trim()) return;
                        
                        setIsGenerating(true);
                        try {
                          const targetWords = appliedRules?.targetWordCount || 1000;
                          
                          // Calculate current word count (excluding FAQ/References)
                          let contentForCount = generatedContent;
                          const faqMatch = contentForCount.match(/^## .*(?:FAQ|Frequently Asked Questions)/im);
                          if (faqMatch && faqMatch.index !== undefined) {
                            contentForCount = contentForCount.substring(0, faqMatch.index);
                          }
                          const referencesMatch = contentForCount.match(/^## .*(?:References|Sources|Bibliography)/im);
                          if (referencesMatch && referencesMatch.index !== undefined) {
                            contentForCount = contentForCount.substring(0, referencesMatch.index);
                          }
                          const currentWordCount = contentForCount.trim().split(/\s+/).filter(Boolean).length;
                          const wordsNeeded = targetWords - currentWordCount;
                          
                          const { data, error } = await supabase.functions.invoke("generate-content", {
                            body: {
                              topic: formData.topic,
                              wordCount: targetWords,
                              expandExistingContent: true,
                              existingContent: generatedContent,
                              wordsToAdd: wordsNeeded,
                              instructions: `EXPAND THIS EXISTING ARTICLE to reach ${targetWords} words. Currently ${currentWordCount} words, need ${wordsNeeded} more.

CRITICAL EXPANSION RULES:
1. Keep ALL existing content intact - do not remove or shorten anything
2. Expand each section with more details, examples, and explanations
3. Add more subsections under existing H2s where appropriate
4. Include additional practical examples and case studies
5. Add more comparison tables if helpful
6. Ensure new content is substantive, not filler
7. Maintain the same tone and style as the existing content
8. The final output MUST be at least ${targetWords} words`,
                            },
                          });

                          if (error) throw error;
                          setGeneratedContent(data.content);
                          if (data.appliedRules) {
                            setAppliedRules(data.appliedRules);
                          }
                          if (data.ctas) {
                            setGeneratedCTAs(data.ctas);
                          }
                          toast({
                            title: "Content expanded",
                            description: `Article expanded to meet ${targetWords} word target.`,
                          });
                        } catch (error) {
                          console.error("Expansion error:", error);
                          toast({
                            title: "Expansion failed",
                            description: error instanceof Error ? error.message : "Failed to expand content",
                            variant: "destructive",
                          });
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      ctaUrl={ctaUrl}
                      generatedCTAs={generatedCTAs}
                      regeneratingSectionTitle={regeneratingSectionTitle}
                      regeneratingAllSections={regeneratingAllSections}
                      onStripInlineSources={() => {
                        if (!generatedContent.trim()) return;
                        const lines = generatedContent.split("\n");
                        const out: string[] = [];
                        let skipping = false;
                        let removed = 0;
                        for (const line of lines) {
                          const trimmed = line.trim();
                          const isHeading = /^\*?\*?Sources?:\*?\*?\s*$/i.test(trimmed);
                          const isSourceBullet = /^[-*+]\s+\[[^\]]+\]\(https?:\/\/[^)\s]+\)/i.test(trimmed);
                          const isBareSourceLink = /^\[[^\]]+\]\(https?:\/\/[^)\s]+\)$/i.test(trimmed);
                          if (isHeading) { skipping = true; removed++; continue; }
                          if (skipping) {
                            if (!trimmed || isSourceBullet || isBareSourceLink) { if (trimmed) removed++; continue; }
                            skipping = false;
                          }
                          out.push(line);
                        }
                        const cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n");
                        if (cleaned === generatedContent) {
                          toast({ title: "Nothing to remove", description: "No inline Sources blocks found." });
                          return;
                        }
                        setGeneratedContent(cleaned);
                        toast({ title: "Inline Sources removed", description: `Cleaned ${removed} line(s). Only the final References section remains.` });
                      }}
                      onRegenerateSection={async (sectionTitle) => {
                        if (!generatedContent.trim() || regeneratingSectionTitle || regeneratingAllSections) return;
                        setRegeneratingSectionTitle(sectionTitle);
                        try {
                          const result = await regenerateOneSection(sectionTitle, generatedContent);
                          if (result.updated) {
                            setGeneratedContent(result.updated);
                            toast({ title: "Section regenerated", description: sectionTitle });
                          } else {
                            toast({ title: "Section not found", description: sectionTitle, variant: "destructive" });
                          }
                        } catch (err) {
                          console.error("Regenerate section error:", err);
                          toast({
                            title: "Regenerate failed",
                            description: err instanceof Error ? err.message : "Failed to regenerate section",
                            variant: "destructive",
                          });
                        } finally {
                          setRegeneratingSectionTitle(null);
                        }
                      }}
                      onRegenerateAllSections={async (sectionTitles) => {
                        if (!generatedContent.trim() || regeneratingAllSections || regeneratingSectionTitle) return;
                        setRegeneratingAllSections(true);
                        let working = generatedContent;
                        let success = 0;
                        const failures: string[] = [];
                        try {
                          for (const title of sectionTitles) {
                            setRegeneratingSectionTitle(title);
                            try {
                              const result = await regenerateOneSection(title, working);
                              if (result.updated) {
                                working = result.updated;
                                success++;
                              } else {
                                failures.push(title);
                              }
                            } catch (err) {
                              console.error("Batch regen failed for", title, err);
                              failures.push(title);
                            }
                          }
                          if (working !== generatedContent) setGeneratedContent(working);
                          toast({
                            title: failures.length === 0 ? "All sections fixed" : "Batch finished with errors",
                            description: failures.length === 0
                              ? `${success} section(s) regenerated successfully.`
                              : `${success} fixed, ${failures.length} failed: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "…" : ""}`,
                            variant: failures.length === 0 ? "default" : "destructive",
                          });
                        } finally {
                          setRegeneratingSectionTitle(null);
                          setRegeneratingAllSections(false);
                        }
                      }}
                      onCheckAndFixLinks={async () => {
                        if (!generatedContent.trim()) return null;
                        try {
                          const { data, error } = await supabase.functions.invoke("fix-broken-links", {
                            body: { content: generatedContent },
                          });
                          if (error) throw error;
                          if (typeof data?.content === "string" && data.content !== generatedContent) {
                            setGeneratedContent(data.content);
                          }
                          toast({
                            title: "Link check complete",
                            description: `${data.brokenCount} broken • ${data.fixedCount} replaced • ${data.removedCount} removed`,
                          });
                          return {
                            totalLinks: data.totalLinks ?? 0,
                            brokenCount: data.brokenCount ?? 0,
                            fixedCount: data.fixedCount ?? 0,
                            removedCount: data.removedCount ?? 0,
                            fixed: data.fixed ?? [],
                            removed: data.removed ?? [],
                          };
                        } catch (err) {
                          console.error("fix-broken-links error", err);
                          toast({
                            title: "Link check failed",
                            description: err instanceof Error ? err.message : "Could not check links",
                            variant: "destructive",
                          });
                          return null;
                        }
                      }}

                    />
                    
                    
                    {/* Value Promise Verification */}
                    {valuePromiseClaims.some(c => c.trim()) && (
                      <ValuePromiseVerification
                        content={generatedContent}
                        claims={valuePromiseClaims.filter(c => c.trim())}
                        valuePromise={valuePromise}
                        onContentUpdate={setGeneratedContent}
                      />
                    )}
                    
                    {/* Quality Scoring Panel */}
                    <QualityScoringPanel
                      content={generatedContent}
                      topic={formData.topic}
                      valuePromise={valuePromise}
                      useFirstPerson={useFirstPerson}
                      onContentUpdate={setGeneratedContent}
                      onCreditUsed={(action, type, details) => trackUsage(action, type, details)}
                    />
                    
                    {/* Credit Usage Display */}
                    <CreditUsageDisplay
                      voiceEditCredits={getVoiceEditCredits()}
                      qualityAnalysisCredits={getQualityAnalysisCredits()}
                      qualityBreakdown={getQualityAnalysisBreakdown()}
                      onClear={clearCreditHistory}
                    />
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p className="text-center text-sm">
                      Generate content to see verification tools.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Apply Format Progress Dialog */}
      <ApplyFormatProgress
        open={showFormatProgress}
        onOpenChange={(open) => {
          if (!isApplyingFormat) {
            setShowFormatProgress(open);
          }
        }}
        steps={formatSteps}
        isComplete={!isApplyingFormat && formatSteps.some(s => s.status === 'done')}
        error={formatError}
      />
      </>
      )}
    </div>
  );
};

export default Index;
