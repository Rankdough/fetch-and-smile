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
import { Loader2, Sparkles, FileText, Link, Search, X, Upload, Plus, Tag, Download, ExternalLink, BookOpen, Eye, Edit2, Mic2, RotateCcw, Target, Maximize2, Minimize2 } from "lucide-react";
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
  // Remove the "## In This Article" section and its list items
  return content.replace(/## In This Article\s*\n([\s\S]*?)(?=\n## [^I]|\n## [A-Z](?!n This))/i, "");
};

const Index = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatedContent, setGeneratedContentRaw] = useState("");
  
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
  } | null>(null);
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
  const [generatedCTAs, setGeneratedCTAs] = useState<{ middle: { headline: string; description: string; buttonText: string }; end: { headline: string; description: string; buttonText: string } } | null>(null);
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
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

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
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      setAppliedRules(data.appliedRules || null);
      if (data.ctas) {
        console.log("CTAs received from API:", data.ctas);
        setGeneratedCTAs(data.ctas);
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
    
    toast({
      title: "Form cleared",
      description: "All fields have been reset. Ready for a new article.",
    });
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

      <div className={isPreviewFullscreen ? "px-4 py-6" : "container mx-auto px-4 py-6 max-w-[1800px]"}>
        <div className={`grid gap-6 min-h-[calc(100vh-120px)] ${isPreviewFullscreen ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={1} isComplete={!!formData.topic.trim()} />
                  <Label htmlFor="topic" className="text-base font-medium">What is the topic of your post?</Label>
                </div>
                <Input
                  id="topic"
                  placeholder="e.g., Best practices for React performance optimization"
                  value={formData.topic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, topic: e.target.value }))
                  }
                  className="bg-input border-2 border-input-border"
                />
              </div>

              <Separator />

              {/* Section 2: Value Promise - Required */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={2} isComplete={!!valuePromise.trim()} />
                  <Label htmlFor="value-promise" className="flex items-center gap-2 text-base font-medium">
                    <Target className="h-4 w-4 text-primary" />
                    Value Promise <span className="text-xs text-destructive">*Required</span>
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-8">
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
              </div>

              <Separator />

              {/* Section 3: Competitor URLs Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={3} isComplete={competitorUrls.some(u => u.trim()) || !!gapAnalysis.trim()} />
                  <span className="text-base font-medium">Competitor Analysis (Optional)</span>
                </div>
              <Collapsible className="space-y-2 ml-8">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-input border-2 border-input-border">
                    <span className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Click to expand
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
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
                </CollapsibleContent>
              </Collapsible>
              </div>

              <Separator />

              {/* Section 4: Format Reference URL */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={4} isComplete={!!formatUrl.trim() || !!formatReference.trim()} />
                  <span className="text-base font-medium">Format Reference (Optional)</span>
                </div>
              <Collapsible className="space-y-2 ml-8">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-input border-2 border-input-border">
                    <span className="flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Click to expand
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
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
                  {formatReference && (
                    <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                      ✓ Format captured - will be used during generation
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
              </div>

              <Separator />

              {/* Section 5: Context Files Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={5} isComplete={contextFiles.length > 0} />
                  <span className="text-base font-medium">Context Files (Optional)</span>
                </div>
              <Collapsible className="space-y-2 ml-8">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-input border-2 border-input-border">
                    <span className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Click to expand
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
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
                </CollapsibleContent>
              </Collapsible>
              </div>

              <Separator />

              {/* Section 6: Tone of Voice Profiles */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={6} isComplete={!!selectedToneProfileId} />
                  <span className="text-base font-medium">Tone of Voice (Optional)</span>
                </div>
              <Collapsible className="space-y-2 ml-8">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-input border-2 border-input-border">
                    <span className="flex items-center gap-2">
                      <Mic2 className="h-4 w-4" />
                      Click to expand
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <ToneProfilePanel
                    selectedProfileId={selectedToneProfileId}
                    onProfileSelect={setSelectedToneProfileId}
                  />
                </CollapsibleContent>
              </Collapsible>
              </div>

              <Separator />

              {/* Section 7: SEO Knowledge Base */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={7} isComplete={useKnowledgeBase} />
                  <span className="text-base font-medium">SEO Knowledge Base (Optional)</span>
                </div>
              <Collapsible className="space-y-2 ml-8">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-input border-2 border-input-border">
                    <span className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Click to expand
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <KnowledgeBasePanel />
                </CollapsibleContent>
              </Collapsible>
              </div>

              <Separator />
              {/* Section 8: Keywords */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={8} isComplete={keywords.length > 0} />
                  <Label className="flex items-center gap-2 text-base font-medium">
                    <Tag className="h-4 w-4" />
                    SEO Keywords (up to 10, top 5 used)
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  Paste comma-separated keywords or add one at a time
                </p>
                <div className="flex gap-2 ml-8">
                  <Input
                    placeholder="e.g., keyword1, keyword2, keyword3"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    className="bg-input border-2 border-input-border"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && keywordInput.trim()) {
                        e.preventDefault();
                        // Parse comma-separated keywords
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
                        // Parse comma-separated keywords
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
                  <div className="flex flex-wrap gap-2 ml-8">
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
                  <p className="text-xs text-muted-foreground ml-8">Maximum 10 keywords reached</p>
                )}
              </div>

              <Separator />

              {/* Section 9: Length */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={9} isComplete={true} />
                  <Label className="text-base font-medium">How long would you like the blog post to be?</Label>
                </div>
                <div className="ml-8">
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
                </div>
              </div>

              <Separator />

              {/* Section 10: Outline */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIndicator number={10} isComplete={!!formData.outline.trim()} />
                  <Label htmlFor="outline" className="text-base font-medium">What is the outline of your post?</Label>
                </div>
                <Textarea
                  id="outline"
                  placeholder="- Introduction&#10;- Main points&#10;- Conclusion"
                  className="min-h-[100px] resize-none ml-8 bg-input border-2 border-input-border"
                  value={formData.outline}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, outline: e.target.value }))
                  }
                />
              </div>

              {/* Custom Instructions */}
              <div className="space-y-2">
                <Label htmlFor="instructions">
                  Would you like to add any custom instructions?
                </Label>
                <Textarea
                  id="instructions"
                  placeholder="e.g., CTA should promote property in Bali, use casual British tone, include statistics..."
                  className="min-h-[60px] resize-none"
                  value={formData.instructions}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, instructions: e.target.value }))
                  }
                />
              </div>

              {/* Knowledge Base Toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="use-kb" className="text-base">Use SEO Knowledge Base</Label>
                  <p className="text-sm text-muted-foreground">
                    Apply rules from your uploaded SEO documents
                  </p>
                </div>
                <Switch
                  id="use-kb"
                  checked={useKnowledgeBase}
                  onCheckedChange={setUseKnowledgeBase}
                />
              </div>

              {/* CTA URL */}
              <div className="space-y-2">
                <Label htmlFor="cta-url" className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Call-to-Action URL (optional)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Add a URL to include two relevant CTA banners in the article
                </p>
                <Input
                  id="cta-url"
                  placeholder="https://your-website.com/booking"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                />
                {ctaUrl.trim() && (
                  <p className="text-xs text-primary">
                    ✓ Two CTA banners will be generated (middle + end of article)
                  </p>
                )}
              </div>

              {/* Color Palette Selector */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Color Scheme
                </Label>
                <p className="text-sm text-muted-foreground">
                  Choose a color palette for tables, TL;DR sections, and CTA banners
                </p>
                <ColorPaletteSelector
                  selectedPalette={selectedColorPalette}
                  onSelectPalette={setSelectedColorPalette}
                />
              </div>

              {/* Pre-Generation Checklist */}
              <GenerationChecklist items={checklistItems} />

              {/* Action Buttons */}
              <div className="flex gap-2 mt-auto">
                <Button
                  variant="outline"
                  onClick={handleClearForm}
                  disabled={isGenerating}
                  className="flex-shrink-0"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear Form
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !formData.topic.trim()}
                  className="flex-1"
                  size="lg"
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
              </div>
            </CardContent>
          </Card>}

          {/* Right Panel - Output */}
          <Card className={`flex flex-col ${isPreviewFullscreen ? "max-w-4xl mx-auto" : ""}`}>
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
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
              <div className="flex gap-2">
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
                {generatedContent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Convert markdown to HTML with styled content for CMS paste
                      const tempDiv = document.createElement("div");
                      const articleElement = document.querySelector("article.prose");
                      if (articleElement) {
                        tempDiv.innerHTML = articleElement.innerHTML;
                        
                        // Get colors for export
                        const navPrimary = selectedColorPalette?.primary || "#7c3aed";
                        const navBg = selectedColorPalette?.primary 
                          ? `linear-gradient(135deg, ${selectedColorPalette.primary}20 0%, ${selectedColorPalette.secondary || selectedColorPalette.primary}15 100%)`
                          : "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)";
                        const navBorder = selectedColorPalette?.primary || "#a78bfa";
                        
                        // Convert ArticleNavigationPanel to collapsible HTML using <details>/<summary>
                        const navPanels = tempDiv.querySelectorAll('[class*="rounded-lg border bg-muted"]');
                        navPanels.forEach((panel) => {
                          const h4 = panel.querySelector('h4');
                          if (h4?.textContent?.includes('In This Article')) {
                            // Extract section links and descriptions
                            const items = panel.querySelectorAll('[class*="rounded-md border"]');
                            const itemCount = items.length;
                            let tocHtml = `
<div style="background: ${navBg}; border: 2px solid ${navBorder}; border-radius: 12px; padding: 24px; margin: 24px 0;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
    <h3 style="display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.1rem; color: #333;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: ${navPrimary}; color: white; font-size: 12px; font-weight: bold;">#</span>
      In This Article
    </h3>
    <span style="font-size: 0.75rem; color: #6b7280;">${itemCount} sections</span>
  </div>
  <p style="margin: 0 0 16px 0; font-size: 0.8rem; color: #6b7280;">Quick navigation to each section of this article:</p>`;
                            
                            items.forEach((item, idx) => {
                              const titleEl = item.querySelector('[class*="font-semibold"]');
                              const title = titleEl?.textContent?.replace('★', '').trim() || '';
                              const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                              const isFirst = idx === 0;
                              // Try to get description from expanded content
                              const descEl = item.querySelector('[class*="text-sm"][class*="leading-relaxed"]');
                              const description = descEl?.textContent?.trim() || `Learn about ${title.toLowerCase()} in this section.`;
                              
                              tocHtml += `
  <details style="background: ${isFirst ? navPrimary : 'white'}; border: 1px solid ${isFirst ? navPrimary : '#e5e7eb'}; border-radius: 8px; margin-bottom: 8px; overflow: hidden;"${isFirst ? ' open' : ''}>
    <summary style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; font-size: 0.95rem; color: ${isFirst ? 'white' : '#1f2937'};">
      <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; border-radius: 50%; background: ${isFirst ? 'rgba(255,255,255,0.2)' : navPrimary + '20'}; color: ${isFirst ? 'white' : navPrimary}; font-size: 11px; font-weight: bold; flex-shrink: 0;">${idx + 1}</span>
      <span style="flex: 1;">${title}${isFirst ? ' ★' : ''}</span>
      <svg style="width: 16px; height: 16px; color: ${isFirst ? 'rgba(255,255,255,0.7)' : navPrimary}; flex-shrink: 0; transition: transform 0.2s;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
    </summary>
    <div style="padding: 0 16px 16px 52px; color: ${isFirst ? 'rgba(255,255,255,0.85)' : '#6b7280'}; font-size: 0.9rem; line-height: 1.6;">
      <p style="margin: 0 0 12px 0;">${description}</p>
      <a href="#${slug}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: ${isFirst ? 'rgba(255,255,255,0.2)' : '#f3f4f6'}; border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: ${isFirst ? 'white' : navPrimary}; text-decoration: none;">
        <svg style="width: 12px; height: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
        Jump to section
      </a>
    </div>
  </details>`;
                            });
                            
                            tocHtml += `</div>
<style>
  details[open] summary svg { transform: rotate(180deg); }
  details summary::-webkit-details-marker { display: none; }
</style>`;
                            panel.outerHTML = tocHtml;
                          }
                        });
                        
                        // Convert FAQAccordion to collapsible HTML using <details>/<summary>
                        const faqPanels = tempDiv.querySelectorAll('[class*="rounded-lg border bg-muted"]');
                        faqPanels.forEach((panel) => {
                          const h4 = panel.querySelector('h4');
                          if (h4?.textContent?.includes('Frequently Asked Questions')) {
                            const items = panel.querySelectorAll('[class*="rounded-md border"]');
                            const itemCount = items.length;
                            let faqHtml = `
<div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border: 2px solid #a78bfa; border-radius: 12px; padding: 24px; margin: 24px 0;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
    <h3 style="display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.1rem; color: #5b21b6;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: #7c3aed; color: white; font-size: 12px; font-weight: bold;">?</span>
      Frequently Asked Questions
    </h3>
    <span style="font-size: 0.75rem; color: #6b7280;">${itemCount} questions</span>
  </div>`;
                            
                            items.forEach((item, idx) => {
                              const question = item.querySelector('[class*="font-semibold"]')?.textContent?.trim() || '';
                              const answer = item.querySelector('[class*="text-muted-foreground"]')?.textContent?.trim() || '';
                              const isFirst = idx === 0;
                              faqHtml += `
  <details style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; overflow: hidden;"${isFirst ? ' open' : ''}>
    <summary style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; font-size: 0.95rem; color: #1f2937;">
      <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; border-radius: 50%; background: #ede9fe; color: #7c3aed; font-size: 11px; font-weight: bold; flex-shrink: 0;">${idx + 1}</span>
      <span style="flex: 1;">${question}</span>
      <svg style="width: 16px; height: 16px; color: #7c3aed; flex-shrink: 0; transition: transform 0.2s;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
    </summary>
    <div style="padding: 0 16px 16px 52px; color: #6b7280; font-size: 0.9rem; line-height: 1.6;">${answer}</div>
  </details>`;
                            });
                            
                            faqHtml += `</div>
<style>
  details[open] summary svg { transform: rotate(180deg); }
  details summary::-webkit-details-marker { display: none; }
</style>`;
                            panel.outerHTML = faqHtml;
                          }
                        });
                        
                        // Ensure all links are properly formatted
                        tempDiv.querySelectorAll("a").forEach((link) => {
                          const href = link.getAttribute("href") || "";
                          // Don't set target="_blank" for anchor links (in-page navigation)
                          if (!href.startsWith("#")) {
                            link.setAttribute("target", "_blank");
                            link.setAttribute("rel", "noopener noreferrer");
                          }
                          if (!link.getAttribute("style")?.includes("color")) {
                            link.setAttribute("style", (link.getAttribute("style") || "") + " color: #7c3aed; text-decoration: underline;");
                          }
                        });
                        
                        // Get colors for export (fallback to default purple)
                        const exportPrimary = selectedColorPalette?.primary || "#7c3aed";
                        const exportSecondary = selectedColorPalette?.secondary || "#a855f7";
                        const exportAccent = selectedColorPalette?.accent || "#e04060";
                        const exportGradient = `linear-gradient(135deg, ${exportPrimary} 0%, ${exportSecondary} 100%)`;
                        
                        // Style TL;DR section with brand colors
                        tempDiv.querySelectorAll("h2").forEach((h2) => {
                          const text = h2.textContent?.toLowerCase() || "";
                          if (text.includes("tl;dr") || text.includes("tldr")) {
                            h2.setAttribute("style", `background: ${exportGradient}; color: white; padding: 1rem 1.5rem; border-radius: 8px 8px 0 0; margin-bottom: 0; font-size: 1.25rem;`);
                            // Style the following ul if exists
                            const nextEl = h2.nextElementSibling;
                            if (nextEl && nextEl.tagName === "UL") {
                              nextEl.setAttribute("style", `background: ${exportGradient}; color: white; padding: 1rem 1.5rem 1.5rem 2.5rem; border-radius: 0 0 8px 8px; margin-top: 0; list-style-type: disc;`);
                              nextEl.querySelectorAll("li").forEach((li) => {
                                li.setAttribute("style", "margin: 0.5rem 0; color: white;");
                              });
                              nextEl.querySelectorAll("strong").forEach((strong) => {
                                strong.setAttribute("style", "color: white; font-weight: 700;");
                              });
                            }
                          } else {
                            // Remove border-bottom from H2s
                            h2.setAttribute("style", "font-size: 1.5rem; margin-top: 2rem; margin-bottom: 0.75rem; color: #1f2937;");
                          }
                        });
                        
                        // Style tables with brand color headers
                        tempDiv.querySelectorAll("table").forEach((table) => {
                          table.setAttribute("style", "width: 100%; border-collapse: collapse; margin: 1.5rem 0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);");
                          table.querySelectorAll("th").forEach((th) => {
                            th.setAttribute("style", `background: ${exportGradient}; color: white; padding: 0.875rem 1rem; text-align: left; font-weight: 600; border: none;`);
                          });
                          table.querySelectorAll("td").forEach((td) => {
                            td.setAttribute("style", "padding: 0.875rem 1rem; border-bottom: 1px solid #e5e7eb; color: #374151;");
                          });
                          table.querySelectorAll("tr:nth-child(even) td").forEach((td) => {
                            td.setAttribute("style", "padding: 0.875rem 1rem; border-bottom: 1px solid #e5e7eb; color: #374151; background: #f9fafb;");
                          });
                        });
                        
                        // Style other elements
                        tempDiv.querySelectorAll("h1").forEach((h1) => {
                          h1.setAttribute("style", "font-size: 2.25rem; font-weight: 700; color: #111827; margin-bottom: 1.5rem; line-height: 1.2;");
                        });
                        tempDiv.querySelectorAll("h3").forEach((h3) => {
                          h3.setAttribute("style", "font-size: 1.25rem; font-weight: 600; color: #1f2937; margin-top: 1.5rem; margin-bottom: 0.5rem;");
                        });
                        tempDiv.querySelectorAll("p").forEach((p) => {
                          if (!p.getAttribute("style")) {
                            p.setAttribute("style", "margin: 1rem 0; color: #374151; line-height: 1.7;");
                          }
                        });
                        tempDiv.querySelectorAll("ul:not([style])").forEach((ul) => {
                          ul.setAttribute("style", "padding-left: 1.5rem; margin: 1rem 0;");
                        });
                        tempDiv.querySelectorAll("ol").forEach((ol) => {
                          if (!ol.getAttribute("style")) {
                            ol.setAttribute("style", "padding-left: 1.5rem; margin: 1rem 0;");
                          }
                        });
                        tempDiv.querySelectorAll("li:not([style])").forEach((li) => {
                          li.setAttribute("style", "margin: 0.5rem 0; color: #374151;");
                        });
                        tempDiv.querySelectorAll("strong:not([style])").forEach((strong) => {
                          strong.setAttribute("style", "font-weight: 600; color: #111827;");
                        });
                        tempDiv.querySelectorAll("hr").forEach((hr) => {
                          // Remove horizontal rules
                          hr.remove();
                        });
                        
                        // Style CTA banners for export using data attributes and colors
                        const ctaBgGradient = selectedColorPalette?.primary 
                          ? `linear-gradient(135deg, ${selectedColorPalette.primary} 0%, ${selectedColorPalette.secondary || selectedColorPalette.primary} 100%)`
                          : "linear-gradient(135deg, #4a2875 0%, #5a2070 100%)";
                        const ctaButtonGradient = selectedColorPalette?.accent 
                          ? `linear-gradient(135deg, ${selectedColorPalette.accent} 0%, ${selectedColorPalette.accent} 100%)`
                          : "linear-gradient(135deg, #e04060 0%, #c04080 100%)";
                        
                        tempDiv.querySelectorAll('[data-cta-banner="true"]').forEach((cta) => {
                          cta.setAttribute("style", `background: ${ctaBgGradient}; border-radius: 12px; padding: 32px; text-align: center; margin: 32px 0; font-family: inherit;`);
                          const headline = cta.querySelector('[data-cta-headline="true"]');
                          if (headline) {
                            headline.setAttribute("style", "font-size: 1.25em; font-weight: 700; letter-spacing: 0.025em; margin-bottom: 8px; color: #e0e0e0; font-family: inherit;");
                          }
                          const description = cta.querySelector('[data-cta-description="true"]');
                          if (description) {
                            description.setAttribute("style", "font-size: 0.95em; margin-bottom: 20px; color: white; opacity: 0.95; font-family: inherit;");
                          }
                          const button = cta.querySelector('[data-cta-button="true"]');
                          if (button) {
                            button.setAttribute("style", `display: inline-block; background: ${ctaButtonGradient}; color: white; font-weight: 600; padding: 12px 32px; border-radius: 9999px; text-decoration: none; font-family: inherit;`);
                          }
                        });
                        
                        // Build clean HTML for CMS paste
                        const htmlContent = `<!-- SEO Article - Ready for Shopify/WordPress -->
<div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #374151;">
${tempDiv.innerHTML}
</div>`;
                        
                        // Copy to clipboard
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
                    <Download className="h-4 w-4 mr-1" />
                    Copy HTML
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
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
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : selectedToneProfileId ? (
                    <>
                      <Mic2 className="h-4 w-4 mr-1" />
                      Load Sample with Tone
                    </>
                  ) : (
                    "Load Sample"
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto space-y-4">
              {generatedContent ? (
                <>
                  {/* Inline Editing Toggle */}
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
                  </div>

                  {/* Generated Article - Always rendered, optionally editable */}
                  <div className={isEditMode ? "ring-1 ring-primary/20 rounded-md p-2 -m-2" : ""}>
                    {(
                    <article 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      contentEditable={isEditMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (isEditMode) {
                          // Convert edited HTML back to approximate markdown
                          const element = e.currentTarget;
                          const html = element.innerHTML;
                          
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
                          
                          setGeneratedContent(markdown);
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
                                  <ReactMarkdown 
                                    remarkPlugins={[remarkGfm]}
                                    components={{
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
                                    {part.content}
                                  </ReactMarkdown>
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
