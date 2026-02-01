import { useState, useMemo, useEffect, useCallback } from "react";
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
import { Loader2, Sparkles, FileText, Link, Search, X, Upload, Plus, Tag, Download, ExternalLink, BookOpen, Eye, Edit2, Mic2, RotateCcw, Target, Maximize2, Minimize2, ImagePlus, Wand2, Image } from "lucide-react";
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
import { ColorPaletteSelector, ColorPalette, COLOR_PALETTES } from "@/components/ColorPaletteSelector";
import { KnowledgeBasePanel } from "@/components/KnowledgeBasePanel";
import { VoiceEditAgent } from "@/components/VoiceEditAgent";
import { ToneProfilePanel } from "@/components/ToneProfilePanel";
import { UniqueAnglesPanel } from "@/components/UniqueAnglesPanel";
import { QualityScoringPanel } from "@/components/QualityScoringPanel";
import { Switch } from "@/components/ui/switch";
import { ArticleNavigationPanel, extractNavigationFromContent } from "@/components/ArticleNavigationPanel";
import { FAQAccordion, extractFAQFromContent, removeFAQSection } from "@/components/FAQAccordion";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { SectionIndicator } from "@/components/SectionIndicator";
import { ArticleImagesPanel, ArticleImage } from "@/components/ArticleImagesPanel";
import { HtmlImportDialog } from "@/components/HtmlImportDialog";
import { CollapsibleSection } from "@/components/CollapsibleSection";

const SAMPLE_CONTENT = `# Composite Bonding vs Veneers: Which Smile Transformation is Right for You?

We've all been there - looking in the mirror and focusing on that one chipped tooth, a persistent stain, or a small gap that makes us self-conscious when we laugh.

## TL;DR

- **Composite bonding** is a minimally invasive, largely reversible cosmetic dental treatment best suited to small chips, gaps, and minor shape issues. It is cheaper upfront, but requires more maintenance over time.
- **Veneers** are a permanent cosmetic solution designed for full smile makeovers, severe discolouration, and significant shape or symmetry issues. They are more expensive but last longer.

---

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

## Which Option Should You Choose?

### Choose Composite Bonding if:
- You have **minor chips or small gaps**
- You want to **preserve natural enamel**
- You prefer a **lower upfront cost**
- You're looking for a **reversible option**

### Choose Veneers if:
- You want a **major colour or shape change**
- You're planning a **full smile makeover**
- You prioritise **long-term durability**
- You need **colour stability** over many years

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
  return content
    .replace(/—/g, "-")  // Remove em dashes
    .replace(/–/g, "-")  // Remove en dashes
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")  // Remove horizontal lines
    .replace(/^(\s*[-*])\s+[-–—]\s*/gm, "$1 ");  // Remove dashes after bullet points (e.g., "- - text" -> "- text")
};

// Helper to extract "In This Article" navigation items from markdown
const extractInThisArticleItems = (content: string): { number: number; title: string; description: string; detailedDescription?: string; slug: string; isHighlighted?: boolean }[] => {
  const items: { number: number; title: string; description: string; detailedDescription?: string; slug: string; isHighlighted?: boolean }[] = [];
  
  // Match the "## In This Article" section and its list items
  const inThisArticleMatch = content.match(/## In This Article\s*\n([\s\S]*?)(?=\n## [^I]|\n## [A-Z](?!n This))/i);
  if (!inThisArticleMatch) return items;
  
  const listContent = inThisArticleMatch[1];
  
  // Match list items like: - **1. Title** - Description
  const itemRegex = /- \*\*(\d+)\. ([^*]+)\*\*\s*[-–—]\s*(.+)/g;
  let match;
  
  while ((match = itemRegex.exec(listContent)) !== null) {
    const number = parseInt(match[1], 10);
    const title = match[2].trim();
    const bulletDescription = match[3].trim();
    // Generate slug EXACTLY like ReactMarkdown does (line ~1846)
    const slug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");
    
    // Find the actual H2 section and extract its first paragraph for richer description
    const h2Pattern = new RegExp(`## ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?\\n\\n([^#\\n][\\s\\S]*?)(?=\\n\\n|\\n##|$)`, 'i');
    const sectionMatch = content.match(h2Pattern);
    
    let fullDescription = bulletDescription;
    if (sectionMatch && sectionMatch[1]) {
      // Use the section's first paragraph - it's usually longer and more descriptive
      const sectionFirstPara = sectionMatch[1].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      if (sectionFirstPara.length > bulletDescription.length) {
        fullDescription = sectionFirstPara;
      }
    }
    
    // Ensure we have enough text for 4 lines (~280 chars for 2+2 lines)
    // If not enough, combine bullet description with section content
    if (fullDescription.length < 200) {
      fullDescription = bulletDescription + " " + fullDescription;
    }
    
    // Split: ~140 chars visible (2 lines), next ~140 chars expanded (2 more lines)
    const visibleLength = 140;
    const expandedLength = 140;
    
    const description = fullDescription.length > visibleLength 
      ? fullDescription.slice(0, visibleLength).trim() + "..."
      : fullDescription;
    
    const detailedDescription = fullDescription.length > visibleLength 
      ? fullDescription.slice(visibleLength, visibleLength + expandedLength).trim() + (fullDescription.length > visibleLength + expandedLength ? "..." : "")
      : "Click to jump directly to this section and learn more about " + title.toLowerCase() + ".";
    
    items.push({
      number,
      title,
      description,
      detailedDescription,
      slug,
      isHighlighted: number === 1,
    });
  }
  
  return items;
};

// Helper to remove "In This Article" section from markdown for custom rendering
const removeInThisArticleSection = (content: string): string => {
  let cleaned = content;
  
  // Remove "# In This Article" (H1 format from some imports)
  cleaned = cleaned.replace(/^# In This Article\s*\n[\s\S]*?(?=\n## |\n# [^I]|$)/gim, "");
  
  // Remove "## In This Article" (H2 format)
  cleaned = cleaned.replace(/^## In This Article\s*\n[\s\S]*?(?=\n## [^I]|\n## [A-Z](?!n This)|$)/gim, "");
  
  // Also catch sections that have numbered lists with "Jump to section" links
  cleaned = cleaned.replace(/^#+\s*In This Article[\s\S]*?(?=\n## [A-Z])/gim, "");
  
  // Remove any stray CSS that leaked through
  cleaned = cleaned.replace(/details\[open\][\s\S]*?display:\s*none;\s*\}/g, "");
  cleaned = cleaned.replace(/[a-z-]+(?:\[[^\]]*\])?\s*[a-z-]*\s*\{[^}]*\}/gi, "");
  
  return cleaned;
};

const Index = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEnhancingImport, setIsEnhancingImport] = useState(false);
  const [generatedContent, setGeneratedContentRaw] = useState(() => {
    const saved = localStorage.getItem("seo-generator-generatedContent");
    return saved ? cleanContent(saved) : "";
  });
  
  // Wrapper that auto-cleans content before setting
  const setGeneratedContent = (content: string) => {
    setGeneratedContentRaw(cleanContent(content));
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
    return saved ? JSON.parse(saved) : {
      topic: "",
      length: "medium",
      outline: "",
      instructions: "",
    };
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
    return saved ? JSON.parse(saved) : [];
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
  
  const [selectedColorPalette, setSelectedColorPalette] = useState<ColorPalette | null>(() => {
    const saved = localStorage.getItem("seo-generator-colorPalette");
    if (saved) {
      const id = JSON.parse(saved);
      return COLOR_PALETTES.find(p => p.id === id) || null;
    }
    return COLOR_PALETTES[0]; // Default to purple
  });
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(() => {
    const saved = localStorage.getItem("seo-generator-useKnowledgeBase");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedToneProfileId, setSelectedToneProfileId] = useState<string | null>(() => {
    const saved = localStorage.getItem("seo-generator-toneProfileId");
    return saved || null;
  });
  const [valuePromise, setValuePromise] = useState(() => {
    const saved = localStorage.getItem("seo-generator-valuePromise");
    return saved || "";
  });
  const [selectedAngles, setSelectedAngles] = useState<string[]>(() => {
    const saved = localStorage.getItem("seo-generator-selectedAngles");
    return saved ? JSON.parse(saved) : [];
  });
  const [articleImages, setArticleImages] = useState<ArticleImage[]>(() => {
    const saved = localStorage.getItem("seo-generator-articleImages");
    return saved ? JSON.parse(saved) : [];
  });
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dropTargetElement, setDropTargetElement] = useState<HTMLElement | null>(null);
  const [isAllocatingImages, setIsAllocatingImages] = useState(false);
  const [isImagePopoverOpen, setIsImagePopoverOpen] = useState(false);
  const [cursorInsertPosition, setCursorInsertPosition] = useState<number | null>(null);

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
  
  useEffect(() => {
    localStorage.setItem("seo-generator-useKnowledgeBase", JSON.stringify(useKnowledgeBase));
  }, [useKnowledgeBase]);
  
  useEffect(() => {
    if (selectedToneProfileId) {
      localStorage.setItem("seo-generator-toneProfileId", selectedToneProfileId);
    } else {
      localStorage.removeItem("seo-generator-toneProfileId");
    }
  }, [selectedToneProfileId]);

  useEffect(() => {
    localStorage.setItem("seo-generator-valuePromise", valuePromise);
  }, [valuePromise]);

  useEffect(() => {
    localStorage.setItem("seo-generator-selectedAngles", JSON.stringify(selectedAngles));
  }, [selectedAngles]);

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
    const hasValuePromise = valuePromise.trim().length > 0;
    const hasSelectedAngles = selectedAngles.length > 0;

    return [
      {
        id: "topic",
        label: "Topic entered",
        completed: hasTopic,
        required: true,
      },
      {
        id: "value-promise",
        label: hasValuePromise 
          ? `Value promise: "${valuePromise.substring(0, 50)}${valuePromise.length > 50 ? "..." : ""}"`
          : "Value promise defined (what reader will DO after reading)",
        completed: hasValuePromise,
        required: true,
      },
      {
        id: "unique-angles",
        label: hasSelectedAngles 
          ? `Unique angles selected: ${selectedAngles.length}`
          : "Unique angles selected (differentiates from competitors)",
        completed: hasSelectedAngles,
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
          formData.length === "long" ? "~2000" :
          formData.length === "extended" ? "~3000" : "~3500"
        } words)`,
        completed: true, // Always completed since there's a default
        required: true,
      },
    ];
  }, [competitorUrls, gapAnalysis, formatReference, contextFiles, formData.topic, formData.length, keywords, valuePromise, selectedAngles]);

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
      // Build enhanced instructions with value promise and unique angles
      let enhancedInstructions = formData.instructions || "";
      
      if (valuePromise.trim()) {
        enhancedInstructions += `\n\nVALUE PROMISE - The reader MUST be able to: ${valuePromise}. Ensure every section helps achieve this outcome.`;
      }
      
      if (selectedAngles.length > 0) {
        enhancedInstructions += `\n\nUNIQUE ANGLES TO INCORPORATE:\n${selectedAngles.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\nUse these angles to differentiate this content from competitors.`;
      }

      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          ...formData,
          instructions: enhancedInstructions,
          keywords: keywords.length > 0 ? keywords.slice(0, 5) : undefined,
          gapAnalysis: gapAnalysis || undefined,
          formatReference: formatReference || undefined,
          contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
          generateCTAs: ctaUrl.trim().length > 0,
          useKnowledgeBase: useKnowledgeBase,
          toneProfileId: selectedToneProfileId || undefined,
          articleImages: articleImages.length > 0 ? articleImages.map(img => ({ alt: img.alt, url: img.url })) : undefined,
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      setAppliedRules(data.appliedRules || null);
      if (data.ctas) {
        console.log("CTAs received from API:", data.ctas);
        setGeneratedCTAs(data.ctas);
        
        // Save CTA URL to history if used
        if (ctaUrl.trim()) {
          setCtaUrlHistory(prev => {
            const filtered = prev.filter(u => u !== ctaUrl.trim());
            return [ctaUrl.trim(), ...filtered].slice(0, 10);
          });
        }
      } else {
        console.log("No CTAs in response, generateCTAs was:", ctaUrl.trim().length > 0);
        setGeneratedCTAs(null);
      }
      toast({
        title: "Content generated!",
        description: "Your article has been created successfully.",
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
  };

  // Clear all form fields to start fresh
  const handleClearForm = () => {
    setFormData({
      topic: "",
      length: "medium",
      outline: "",
      instructions: "",
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
    setGeneratedContent("");
    setAppliedRules(null);
    setSelectedToneProfileId(null);
    setValuePromise("");
    setSelectedAngles([]);
    setArticleImages([]);
    
    // Clear localStorage
    localStorage.removeItem("seo-generator-formData");
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
    localStorage.removeItem("seo-generator-articleImages");
    localStorage.removeItem("seo-generator-generatedContent");
    localStorage.removeItem("seo-generator-appliedRules");
    localStorage.removeItem("seo-generator-generatedCTAs");
    
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
          headline: "Want to Learn More?",
          description: "Get expert guidance and personalized recommendations.",
          buttonText: "Get Started",
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

      // If CTAs were added, set generated CTAs
      if (data.ctasAdded) {
        setGeneratedCTAs({
          middle: {
            headline: ctaConfig?.headline || "Want to Learn More?",
            description: ctaConfig?.description || "Get expert guidance.",
            buttonText: ctaConfig?.buttonText || "Learn More",
          },
          end: {
            headline: "Ready to Take Action?",
            description: "Start your journey today.",
            buttonText: "Get Started",
          },
        });
      }

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

  // Allocate images logically using AI to match image content to article sections
  const handleAllocateImagesLogically = async () => {
    if (!generatedContent || articleImages.length === 0) {
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
          images: articleImages.map(img => ({ alt: img.alt, url: img.url })),
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.content) {
        setGeneratedContent(data.content);
        toast({
          title: "Images allocated!",
          description: `${articleImages.length} image(s) placed at relevant sections.`,
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
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">SEO Content Generator</h1>
        </div>
      </header>

      {/* Action Toolbar */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3 max-w-[1800px]">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Actions */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !formData.topic.trim()}
              size="default"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Content
                </>
              )}
            </Button>

            <div className="h-6 w-px bg-border" />

            {/* Import/Export */}
            <HtmlImportDialog onImport={setGeneratedContent} />
            
            <Button
              variant="outline"
              size="default"
              onClick={handleEnhanceImport}
              disabled={isEnhancingImport || !generatedContent}
              title="Apply tone profile and add CTAs to imported content"
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
              disabled={!generatedContent}
              onClick={() => {
                // Generate HTML with inline styles for components
                const article = document.querySelector("article");
                if (article) {
                  // Clone the article to modify it
                  const clone = article.cloneNode(true) as HTMLElement;
                  
                  // Convert navigation panel to styled HTML
                  const navPanels = clone.querySelectorAll("[class*='grid']");
                  navPanels.forEach((panel) => {
                    const navItems = panel.querySelectorAll("a[href^='#']");
                    if (navItems.length > 0) {
                      // This is likely the navigation panel
                      const parent = panel.parentElement;
                      if (parent) {
                        const navHtml = document.createElement("nav");
                        navHtml.style.cssText = "margin: 1.5rem 0; padding: 1rem; background: #f5f5f5; border-radius: 8px;";
                        navHtml.innerHTML = `<p style="font-weight: 600; margin-bottom: 0.5rem;">In This Article:</p><ul style="margin: 0; padding-left: 1.25rem;">
                          ${Array.from(navItems).map((item) => `<li style="margin: 0.25rem 0;"><a href="${item.getAttribute("href")}" style="color: #6366f1; text-decoration: none;">${item.textContent}</a></li>`).join("")}
                        </ul>`;
                        parent.replaceChild(navHtml, panel);
                      }
                    }
                  });
                  
                  // Convert FAQ accordions to details/summary elements
                  const faqSections = clone.querySelectorAll("[data-faq]");
                  faqSections.forEach((section) => {
                    const items = section.querySelectorAll("[data-faq-item]");
                    if (items.length > 0) {
                      const faqContainer = document.createElement("div");
                      faqContainer.innerHTML = `<h2 style="font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 1rem;">Frequently Asked Questions</h2>`;
                      items.forEach((item) => {
                        const question = item.querySelector("[data-faq-question]")?.textContent || "";
                        const answer = item.querySelector("[data-faq-answer]")?.textContent || "";
                        const details = document.createElement("details");
                        details.style.cssText = "margin: 0.5rem 0; padding: 0.75rem; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px;";
                        details.innerHTML = `<summary style="cursor: pointer; font-weight: 500;">${question}</summary><p style="margin-top: 0.5rem; color: #525252;">${answer}</p>`;
                        faqContainer.appendChild(details);
                      });
                      section.replaceWith(faqContainer);
                    }
                  });
                  
                  // Get the HTML content
                  let htmlContent = clone.innerHTML;
                  
                  // Replace CTA banners with styled versions
                  const ctaBanners = clone.querySelectorAll(".cta-banner, [class*='cta']");
                  ctaBanners.forEach((banner) => {
                    const headline = banner.querySelector("[class*='headline']")?.textContent || "";
                    const description = banner.querySelector("[class*='description']")?.textContent || "";
                    const button = banner.querySelector("a");
                    const buttonText = button?.textContent || "Learn More";
                    const buttonUrl = button?.getAttribute("href") || "#";
                    
                    const styledCta = document.createElement("div");
                    styledCta.style.cssText = `margin: 2rem 0; padding: 1.5rem; background: linear-gradient(135deg, ${selectedColorPalette?.primary || "#6366f1"} 0%, ${selectedColorPalette?.secondary || "#a855f7"} 100%); border-radius: 12px; text-align: center; color: white;`;
                    styledCta.innerHTML = `
                      <p style="font-size: 1.25rem; font-weight: 700; margin: 0 0 0.5rem;">${headline}</p>
                      <p style="margin: 0 0 1rem; opacity: 0.9;">${description}</p>
                      <a href="${buttonUrl}" style="display: inline-block; padding: 0.75rem 1.5rem; background: white; color: ${selectedColorPalette?.primary || "#6366f1"}; font-weight: 600; border-radius: 6px; text-decoration: none;">${buttonText}</a>
                    `;
                    banner.replaceWith(styledCta);
                  });
                  
                  // Get final HTML
                  htmlContent = clone.innerHTML;
                  
                  navigator.clipboard.writeText(htmlContent).then(() => {
                    toast({
                      title: "HTML copied to clipboard!",
                      description: "Ready to paste into Shopify or WordPress.",
                    });
                  }).catch(() => {
                    // Fallback: download as file
                    const blob = new Blob([htmlContent], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "article.html";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  });
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Copy HTML
            </Button>

            <div className="h-6 w-px bg-border" />

            {/* Secondary Actions */}
            <Button
              variant="outline"
              size="default"
              onClick={async () => {
                // If a tone profile is selected, generate content with that tone
                if (selectedToneProfileId) {
                  setIsGenerating(true);
                  setGeneratedContent("");
                  try {
                    const { data, error } = await supabase.functions.invoke("generate-content", {
                      body: {
                        topic: "Composite Bonding vs Veneers: Which Smile Transformation is Right for You?",
                        length: "long",
                        outline: "",
                        instructions: "Compare composite bonding and veneers for cosmetic dental treatments. Include pros and cons, costs, and who each option is best for.",
                        generateCTAs: !!ctaUrl.trim(),
                        useKnowledgeBase: useKnowledgeBase,
                        toneProfileId: selectedToneProfileId,
                      },
                    });
                    if (error) throw error;
                    setGeneratedContent(data.content);
                    setAppliedRules(data.appliedRules || null);
                    if (data.ctas) {
                      setGeneratedCTAs(data.ctas);
                    }
                    toast({
                      title: "Sample generated with tone!",
                      description: "The sample article uses your selected tone profile.",
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
                } else {
                  // No tone profile - load static sample
                  setGeneratedContent(SAMPLE_CONTENT);
                  if (ctaUrl.trim()) {
                    setGeneratedCTAs({
                      middle: {
                        headline: "TRANSFORM YOUR SMILE TODAY!",
                        description: "Get expert advice on the best cosmetic dental treatment for your needs.",
                        buttonText: "Book Consultation"
                      },
                      end: {
                        headline: "READY FOR YOUR DREAM SMILE?",
                        description: "Limited time offer - Free consultation with our cosmetic dentistry experts.",
                        buttonText: "Get Started Now"
                      }
                    });
                  } else {
                    setGeneratedCTAs(null);
                  }
                }
              }}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : selectedToneProfileId ? (
                <>
                  <Mic2 className="h-4 w-4 mr-2" />
                  Load Sample with Tone
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Load Sample
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleClearForm}
              disabled={isGenerating}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear Form
            </Button>
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
                <p className="text-xs text-muted-foreground">
                  What will the reader be able to DO or DECIDE after reading this?
                </p>
                <div className="relative">
                  <Textarea
                    id="value-promise"
                    placeholder="e.g., Choose between composite bonding and veneers based on their budget, timeline, and aesthetic goals"
                    className="min-h-[60px] resize-none pr-12 bg-input border-2 border-input-border"
                    value={valuePromise}
                    onChange={(e) => setValuePromise(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`absolute right-1 bottom-1 h-8 w-8 ${
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
                    🎙️ Listening... speak now
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
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium mb-2">Gap Analysis Results:</p>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{gapAnalysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
                
                {/* Unique Angles Panel */}
                <UniqueAnglesPanel
                  topic={formData.topic}
                  gapAnalysis={gapAnalysis}
                  selectedAngles={selectedAngles}
                  onAnglesChange={setSelectedAngles}
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
                          .map((k) => k.trim())
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
                          .map((k) => k.trim())
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
                summary={formData.length === "short" ? "~500 words" : formData.length === "medium" ? "~1000 words" : formData.length === "long" ? "~2000 words" : formData.length === "extended" ? "~3000 words" : "~3500 words"}
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
                <Textarea
                  id="outline"
                  placeholder="- Introduction&#10;- Main points&#10;- Conclusion"
                  className="min-h-[100px] resize-none bg-input border-2 border-input-border"
                  value={formData.outline}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, outline: e.target.value }))
                  }
                />
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
                  <p className="text-xs text-primary">
                    ✓ Two CTA banners will be generated (middle + end of article)
                  </p>
                )}
              </CollapsibleSection>

              {/* Section 13: Color Palette */}
              <CollapsibleSection
                number={13}
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

              {/* Section 14: Article Images */}
              <CollapsibleSection
                number={14}
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
                    
                    {/* Insert Image Button with Popover */}
                    {articleImages.length > 0 && (
                      <Popover open={isImagePopoverOpen} onOpenChange={setIsImagePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">
                            <Image className="h-3.5 w-3.5 mr-1.5" />
                            Insert Image
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3" align="end">
                          <div className="space-y-3">
                            <div className="text-sm font-medium">Select image to insert</div>
                            <p className="text-xs text-muted-foreground">
                              {cursorInsertPosition !== null 
                                ? "Image will be inserted at your cursor position." 
                                : "Click in the article first to set insertion point, or image will be added at the end."}
                            </p>
                            <ScrollArea className="h-[200px]">
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
                                        setCursorInsertPosition(null); // Reset after insertion
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
                                      setIsImagePopoverOpen(false);
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
                      className="prose prose-sm max-w-none dark:prose-invert"
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
                        ...(selectedColorPalette ? {
                          '--brand-primary': selectedColorPalette.primary,
                          '--brand-secondary': selectedColorPalette.secondary,
                          '--brand-accent': selectedColorPalette.accent,
                        } as React.CSSProperties : {})
                      }}
                    >
                      {(() => {
                        // Extract "In This Article" navigation items - use explicit section or fallback to H2 extraction
                        let navItems = extractInThisArticleItems(generatedContent);
                        if (navItems.length === 0) {
                          // Fallback: extract from H2 headings
                          navItems = extractNavigationFromContent(generatedContent);
                        }
                        // Extract FAQ items
                        const faqItems = extractFAQFromContent(generatedContent);
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
                          // Find next H2 after TL;DR
                          for (let i = tldrStartIndex + 1; i < lines.length; i++) {
                            if (/^## /.test(lines[i]) && !/tldr/i.test(lines[i])) {
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
                        const parts: { content: string; ctaPosition?: 'middle' | 'end'; navPanel?: boolean }[] = [];
                        
                        if (tldrEndIndex > 0 && navItems.length > 0) {
                          // Part 1: Title + TL;DR
                          parts.push({ content: lines.slice(0, tldrEndIndex).join('\n') });
                          // Part 2: Navigation Panel
                          parts.push({ content: '', navPanel: true });
                          
                          // Rest of content with potential CTA insertion
                          const restLines = lines.slice(tldrEndIndex);
                          const restContent = restLines.join('\n');
                          
                          if (middleInsertIndex > 0 && generatedCTAs?.middle && ctaUrl) {
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
                        } else if (middleInsertIndex > 0 && generatedCTAs?.middle && ctaUrl) {
                          parts.push({ content: lines.slice(0, middleInsertIndex).join('\n') });
                          parts.push({ content: '', ctaPosition: 'middle' });
                          parts.push({ content: lines.slice(middleInsertIndex).join('\n') });
                        } else {
                          parts.push({ content: contentWithoutNav });
                        }
                        
                        return (
                          <>
                            {parts.map((part, idx) => (
                              <div key={idx}>
                                {part.navPanel && navItems.length > 0 ? (
                                  <div className="my-6">
                                    <ArticleNavigationPanel items={navItems} />
                                  </div>
                                ) : part.ctaPosition === 'middle' && generatedCTAs?.middle && ctaUrl ? (
                                  <CTABanner
                                    headline={generatedCTAs.middle.headline}
                                    description={generatedCTAs.middle.description}
                                    buttonText={generatedCTAs.middle.buttonText}
                                    url={ctaUrl}
                                    brandColors={selectedColorPalette}
                                  />
                                ) : part.content ? (
                                  (() => {
                                    // Split content by CTA markers and render inline CTAs
                                    const ctaMarkerRegex = /<!--CTA_MARKER_(\d+)-->/g;
                                    const segments: { type: 'content' | 'cta'; value: string | number }[] = [];
                                    let lastIndex = 0;
                                    let match;
                                    
                                    while ((match = ctaMarkerRegex.exec(part.content)) !== null) {
                                      if (match.index > lastIndex) {
                                        segments.push({ type: 'content', value: part.content.slice(lastIndex, match.index) });
                                      }
                                      segments.push({ type: 'cta', value: parseInt(match[1], 10) });
                                      lastIndex = match.index + match[0].length;
                                    }
                                    
                                    if (lastIndex < part.content.length) {
                                      segments.push({ type: 'content', value: part.content.slice(lastIndex) });
                                    }
                                    
                                    // If no CTA markers, just render normally
                                    if (segments.length === 0) {
                                      segments.push({ type: 'content', value: part.content });
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
                                                          <FAQAccordion items={faqItems} brandColors={selectedColorPalette} />
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
                    />
                    
                    {/* Content Verification Panel */}
                    <ContentVerification
                      content={generatedContent} 
                      appliedRules={appliedRules}
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
                        if (!formData.topic.trim()) return;
                        
                        setIsGenerating(true);
                        try {
                          const targetWords = appliedRules?.targetWordCount || 1000;
                          const requiredTables = targetWords >= 3000 ? 4 : targetWords >= 2000 ? 3 : 1;
                          
                          const { data, error } = await supabase.functions.invoke("generate-content", {
                            body: {
                              ...formData,
                              keywords: keywords.length > 0 ? keywords.slice(0, 5) : undefined,
                              gapAnalysis: gapAnalysis || undefined,
                              formatReference: formatReference || undefined,
                              contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
                              generateCTAs: ctaUrl.trim().length > 0,
                              useKnowledgeBase: useKnowledgeBase,
                              toneProfileId: selectedToneProfileId || undefined,
                              instructions: `${formData.instructions || ""}\n\nCRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE:
1. The article MUST be at least ${targetWords} words. Expand each section with more detail, examples, and explanations.
2. Include a MINIMUM of ${requiredTables} markdown tables comparing different aspects, features, or options.
3. Add more subsections, examples, case studies, and detailed explanations to reach the word count.
4. Do NOT pad with filler - add genuinely useful, substantive content.`.trim(),
                            },
                          });

                          if (error) throw error;
                          setGeneratedContent(data.content);
                          setAppliedRules(data.appliedRules || null);
                          if (data.ctas) {
                            setGeneratedCTAs(data.ctas);
                          }
                          toast({
                            title: "Content regenerated",
                            description: "Article expanded to meet word count target.",
                          });
                        } catch (error) {
                          console.error("Regeneration error:", error);
                          toast({
                            title: "Regeneration failed",
                            description: error instanceof Error ? error.message : "Failed to regenerate",
                            variant: "destructive",
                          });
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      ctaUrl={ctaUrl}
                      generatedCTAs={generatedCTAs}
                    />
                    
                    {/* Quality Scoring Panel */}
                    <QualityScoringPanel
                      content={generatedContent}
                      topic={formData.topic}
                      valuePromise={valuePromise}
                      onContentUpdate={setGeneratedContent}
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
    </div>
  );
};

export default Index;
