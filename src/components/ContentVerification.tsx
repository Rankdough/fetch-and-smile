import { CheckCircle2, XCircle, AlertCircle, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

interface AppliedRules {
  gapAnalysisUsed: boolean;
  formatReferenceUsed: boolean;
  contextFilesUsed: boolean;
  contextFileNames: string[];
  keywordsUsed: boolean;
  keywords: string[];
  targetWordCount: number;
  outlineProvided: boolean;
  outlineText?: string;
  customInstructionsProvided: boolean;
  knowledgeBaseUsed?: boolean;
  knowledgeRulesCount?: number;
  toneProfileUsed?: boolean;
}

interface CTAData {
  middle?: { headline: string; description: string; buttonText: string };
  end?: { headline: string; description: string; buttonText: string };
}

interface ContentVerificationProps {
  content: string;
  appliedRules: AppliedRules | null;
  onFixEmDashes?: () => void;
  onFixHorizontalLines?: () => void;
  onRegenerateForWordCount?: () => void;
  onRegenerateSection?: (sectionTitle: string) => Promise<void> | void;
  regeneratingSectionTitle?: string | null;
  ctaUrl?: string;
  generatedCTAs?: CTAData | null;
  internalLinks?: string[];
  selectedGapInsights?: string[];
  valuePromiseClaims?: string[];
}

interface VerificationItem {
  id: string;
  label: string;
  status: "passed" | "failed" | "warning";
  details?: string;
  fixable?: boolean;
  fixType?: "em-dash" | "word-count" | "horizontal-line";
  failingSections?: string[];
}

export const ContentVerification = ({ 
  content, 
  appliedRules, 
  onFixEmDashes,
  onFixHorizontalLines,
  onRegenerateForWordCount,
  onRegenerateSection,
  regeneratingSectionTitle,
  ctaUrl,
  generatedCTAs,
  internalLinks,
  selectedGapInsights,
  valuePromiseClaims
}: ContentVerificationProps) => {
  const verificationResults = useMemo(() => {
    const results: VerificationItem[] = [];

    // Count words - excluding FAQ and References sections
    let contentForWordCount = content;
    
    // Find and remove FAQ section (## FAQ or ## Frequently Asked Questions)
    const faqMatch = contentForWordCount.match(/^## .*(?:FAQ|Frequently Asked Questions)/im);
    if (faqMatch && faqMatch.index !== undefined) {
      // Find next H2 after FAQ or end of content
      const afterFaq = contentForWordCount.substring(faqMatch.index + faqMatch[0].length);
      const nextH2Match = afterFaq.match(/^## /m);
      if (nextH2Match && nextH2Match.index !== undefined) {
        // Remove just the FAQ section
        const faqEndIndex = faqMatch.index + faqMatch[0].length + nextH2Match.index;
        contentForWordCount = contentForWordCount.substring(0, faqMatch.index) + contentForWordCount.substring(faqEndIndex);
      } else {
        // FAQ goes to end, check for References before it
        contentForWordCount = contentForWordCount.substring(0, faqMatch.index);
      }
    }
    
    // Find and remove References section
    const referencesMatch = contentForWordCount.match(/^## .*(?:References|Sources|Bibliography)/im);
    if (referencesMatch && referencesMatch.index !== undefined) {
      contentForWordCount = contentForWordCount.substring(0, referencesMatch.index);
    }
    
    const wordCount = contentForWordCount.trim().split(/\s+/).filter(Boolean).length;
    const totalWordCount = content.trim().split(/\s+/).filter(Boolean).length;
    const targetWords = appliedRules?.targetWordCount || 1000;
    const wordCountPercentage = (wordCount / targetWords) * 100;

    results.push({
      id: "word-count",
      label: "Word count (excl. FAQ/References)",
      status: wordCountPercentage >= 100 ? "passed" : wordCountPercentage >= 80 ? "warning" : "failed",
      details: `${wordCount} words (target: ${targetWords}) — total: ${totalWordCount}`,
      fixable: wordCountPercentage < 100,
      fixType: "word-count",
    });


    // Check for TL;DR as H2
    const hasTldrH2 = /^## TL;?DR/im.test(content);
    results.push({
      id: "tldr-h2",
      label: "TL;DR as H2 heading",
      status: hasTldrH2 ? "passed" : "failed",
      details: hasTldrH2 ? "Found ## TL;DR heading" : "Missing TL;DR H2 section",
    });

    const clickableReferencesMatch = content.match(/^##\s+References:?\s*\n([\s\S]*?)(?=\n##\s+|$)/im);
    if (clickableReferencesMatch) {
      const referenceLines = clickableReferencesMatch[1].split("\n").map((line) => line.trim()).filter(Boolean);
      const nonClickableReferenceLines = referenceLines.filter((line) => !/\[[^\]]+\]\(https?:\/\/[^)\s]+\)/i.test(line));
      results.push({
        id: "clickable-references",
        label: "References are clickable",
        status: nonClickableReferenceLines.length === 0 ? "passed" : "failed",
        details: nonClickableReferenceLines.length === 0
          ? `${referenceLines.length} reference link${referenceLines.length === 1 ? "" : "s"} verified`
          : `${nonClickableReferenceLines.length} non-clickable reference line(s) found`,
      });
    }


    // Atomic sections check: every body H2 must have exactly three bullets, avoid dependency phrases,
    // and have any "Sources:" line rendered as clickable markdown links.
    {
      const lines = content.split("\n");
      const skipPattern = /tl;?\s?dr|quick\s*tips|in\s*this\s*article|frequently\s*asked|faq|final\s*thoughts|conclusion|references|sources/i;
      const bannedRegex = /\b(as\s+(mentioned|we\s+(saw|discussed|noted))\s+(above|earlier|previously)|continuing\s+from\s+(earlier|above)|in\s+the\s+previous\s+section|the\s+following\s+point|building\s+on\s+(what\s+we\s+covered|the\s+above|the\s+previous))\b/i;
      const failingTitles: string[] = [];
      const failingFull: string[] = []; // full heading text for regen lookup
      let totalBody = 0;
      let bannedHits = 0;
      let brokenSourceHits = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i]) && !skipPattern.test(lines[i])) {
          totalBody++;
          let endIdx = lines.length;
          for (let j = i + 1; j < lines.length; j++) {
            if (/^##\s+/.test(lines[j])) { endIdx = j; break; }
          }
          const body = lines.slice(i + 1, endIdx).join("\n");
          const bulletCount = body.split("\n").filter((line) => /^\s*-\s+/.test(line)).length;
          const banned = bannedRegex.test(body);
          // Detect any "Sources: ..." line that is not clickable on that exact line
          const sourceLines = body.split("\n").filter((line) => /^\s*\*?\*?Sources?:\*?\*?/i.test(line));
          const brokenSource = sourceLines.some((line) => !/\[[^\]]+\]\(https?:\/\/[^)\s]+\)/i.test(line));
          const fullTitle = lines[i].replace(/^##\s+/, "").trim();
          if (bulletCount !== 3 || banned || brokenSource) {
            failingTitles.push(fullTitle.slice(0, 60));
            failingFull.push(fullTitle);
          }
          if (banned) bannedHits++;
          if (brokenSource) brokenSourceHits++;
        }
      }
      const failedCount = failingFull.length;
      const reasons: string[] = [];
      if (failingTitles.length > 0) reasons.push(`${failingTitles.length} section(s) need exactly 3 bullets/clickable sources`);
      if (bannedHits > 0) reasons.push(`${bannedHits} dependency phrase(s)`);
      if (brokenSourceHits > 0) reasons.push(`${brokenSourceHits} non-clickable Sources line(s)`);
      results.push({
        id: "atomic-sections",
        label: "Atomic sections (exactly 3 bullets + standalone answer + clickable sources)",
        status: failedCount === 0 ? "passed" : "failed",
        details: totalBody === 0
          ? "No body H2 sections detected"
          : failedCount === 0
            ? `All ${totalBody} body sections are atomic`
            : reasons.join(" • "),
        failingSections: failingFull,
      });
    }

    // Check for tables - count them based on word count requirements
    const tableMatches = content.match(/\n\|[^\n]+\|[^\n]+\|\n\|[-:| ]+\|/g) || [];
    const tableCount = tableMatches.length;
    
    // Determine required table count based on word count
    let requiredTables = 1;
    let tableLabel = "Comparison table included";
    if (targetWords >= 3000) {
      requiredTables = 4;
      tableLabel = `Tables included (${requiredTables} required for ${targetWords}+ words)`;
    } else if (targetWords >= 2000) {
      requiredTables = 3;
      tableLabel = `Tables included (${requiredTables} required for ${targetWords}+ words)`;
    }
    
    const hasEnoughTables = tableCount >= requiredTables;
    results.push({
      id: "tables",
      label: tableLabel,
      status: hasEnoughTables ? "passed" : tableCount > 0 ? "warning" : "failed",
      details: `${tableCount} table${tableCount !== 1 ? "s" : ""} found (minimum: ${requiredTables})`,
    });


    // Check keywords were used
    if (appliedRules?.keywordsUsed && appliedRules.keywords.length > 0) {
      const contentLower = content.toLowerCase();
      const keywordsFound = appliedRules.keywords.filter((kw) => 
        contentLower.includes(kw.toLowerCase())
      );
      const keywordPercentage = (keywordsFound.length / appliedRules.keywords.length) * 100;
      
      results.push({
        id: "keywords",
        label: "SEO keywords incorporated",
        status: keywordPercentage >= 80 ? "passed" : keywordPercentage >= 50 ? "warning" : "failed",
        details: `${keywordsFound.length}/${appliedRules.keywords.length} keywords found: ${keywordsFound.join(", ") || "none"}`,
      });
    }

    // ALWAYS show tone profile check - flag as incomplete if not used
    // For imported content (no appliedRules), show as "not applied" since it wasn't generated with tone
    const toneApplied = appliedRules?.toneProfileUsed === true;
    results.push({
      id: "tone-profile",
      label: "Tone of voice applied",
      status: toneApplied ? "passed" : "failed",
      details: toneApplied 
        ? "Content generated with selected tone profile" 
        : appliedRules === null 
          ? "Imported content - use 'Enhance Import' to apply tone profile"
          : "No tone profile selected - content uses default tone",
    });

    // ALWAYS show knowledge base check - flag as incomplete if not used
    const kbApplied = appliedRules?.knowledgeBaseUsed === true;
    results.push({
      id: "knowledge-base",
      label: "SEO knowledge base applied",
      status: kbApplied ? "passed" : "failed",
      details: kbApplied 
        ? `${appliedRules?.knowledgeRulesCount || 0} SEO rules from knowledge base applied` 
        : appliedRules === null
          ? "Imported content - regenerate to apply SEO knowledge base"
          : "No SEO knowledge base rules applied - upload documents to knowledge base",
    });

    // ALWAYS show competition/gap analysis check - flag as incomplete if not used
    const gapApplied = appliedRules?.gapAnalysisUsed === true;
    results.push({
      id: "gap-analysis",
      label: "Competition analysis applied",
      status: gapApplied ? "passed" : "failed",
      details: gapApplied 
        ? "Content gaps from competitor analysis were addressed" 
        : appliedRules === null
          ? "Imported content - regenerate to apply competition analysis"
          : "No competitor analysis applied - add competitor URLs to analyze gaps",
    });

    // Check if selected gap insights are addressed in the content
    if (selectedGapInsights && selectedGapInsights.length > 0) {
      const contentLower = content.toLowerCase();
      const addressedInsights: string[] = [];
      const missingInsights: string[] = [];
      
      selectedGapInsights.forEach(insight => {
        // Extract key terms from the insight (first few meaningful words)
        const keyTerms = insight
          .toLowerCase()
          .replace(/["""'']/g, "")
          .split(/\s+/)
          .filter(w => w.length > 3 && !["the", "and", "for", "that", "this", "with", "from", "have", "been", "they", "their", "there", "about", "which", "would", "could", "should", "into", "also", "most", "very", "while", "articles", "article"].includes(w))
          .slice(0, 5);
        
        // Check if enough key terms appear in the content
        const matchedTerms = keyTerms.filter(term => contentLower.includes(term));
        const matchRate = keyTerms.length > 0 ? matchedTerms.length / keyTerms.length : 0;
        
        // Get a short label for the insight (first ~40 chars)
        const shortLabel = insight.length > 40 ? insight.slice(0, 40).trim() + "..." : insight;
        
        if (matchRate >= 0.4) {
          addressedInsights.push(shortLabel);
        } else {
          missingInsights.push(shortLabel);
        }
      });
      
      const allAddressed = missingInsights.length === 0;
      const someAddressed = addressedInsights.length > 0;
      
      results.push({
        id: "gap-insights-addressed",
        label: `Selected gap insights addressed (${addressedInsights.length}/${selectedGapInsights.length})`,
        status: allAddressed ? "passed" : someAddressed ? "warning" : "failed",
        details: allAddressed
          ? `All ${selectedGapInsights.length} selected gap insights are covered in the content`
          : missingInsights.length > 0
            ? `Missing: ${missingInsights.join("; ")}`
            : "Selected gap insights not found in content",
      });
    }

    if (appliedRules?.contextFilesUsed && appliedRules.contextFileNames.length > 0) {
      // Check if any content from context files is likely referenced
      // Look for source citations or references section
      const hasReferencesSection = /## References/im.test(content);
      const hasSourceLinksCheck = /\*\*Sources?:\*\*.*\[.+\]\(.+\)/im.test(content);
      const hasCitations = hasReferencesSection || hasSourceLinksCheck;
      
      results.push({
        id: "context-files",
        label: "Context files provided",
        status: "passed",
        details: `Sources: ${appliedRules.contextFileNames.join(", ")}`,
      });

      // Check content is written based on context files
      results.push({
        id: "context-based-content",
        label: "Content based on context files",
        status: hasCitations ? "passed" : "warning",
        details: hasCitations 
          ? "Content draws from provided context files" 
          : "Verify content uses information from context files",
      });

      results.push({
        id: "context-references-cited",
        label: "Context file sources cited",
        status: hasCitations ? "passed" : "warning",
        details: hasCitations 
          ? "Source citations from context files found" 
          : "No explicit citations from context files detected",
      });
    } else if (appliedRules && !appliedRules.contextFilesUsed) {
      // Show as info that no context files were provided
      results.push({
        id: "context-files",
        label: "Context files for sources",
        status: "warning",
        details: "No context files uploaded - content uses general knowledge only",
      });
    }

    // Check for FAQ section
    const hasFAQ = /## .*(?:FAQ|Frequently Asked Questions)/im.test(content);
    results.push({
      id: "faq",
      label: "FAQ section",
      status: hasFAQ ? "passed" : "warning",
      details: hasFAQ ? "FAQ section found" : "No FAQ section detected",
    });

    // Check outline was provided
    const outlineProvided = appliedRules?.outlineProvided === true;
    results.push({
      id: "outline-provided",
      label: "Outline provided",
      status: outlineProvided ? "passed" : "failed",
      details: outlineProvided
        ? "Content generated with a provided outline"
        : appliedRules === null
          ? "Imported content - no outline was used"
          : "No outline provided - generate or write an outline before generating content",
    });

    // Check outline compliance
    if (appliedRules?.outlineProvided && appliedRules.outlineText) {
      // Extract section headers from outline (look for numbered items or bullet points)
      const outlineLines = appliedRules.outlineText.split('\n').filter(line => 
        /^\d+[\.\)]\s*/.test(line.trim()) || /^[-•*]\s*/.test(line.trim())
      );
      
      // Extract H2 headings from content
      const contentH2s = content.match(/^## .+$/gm) || [];
      const contentH2Lower = contentH2s.map(h => h.replace(/^## /, '').toLowerCase().trim());
      
      // Check how many outline sections are represented in the content
      let matchedSections = 0;
      const outlineSections: string[] = [];
      
      outlineLines.forEach(line => {
        // Clean the line to get the section name
        const sectionName = line.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•*]\s*/, '').replace(/\([^)]*\)/g, '').trim();
        if (sectionName.length > 3) {
          outlineSections.push(sectionName);
          // Check if any H2 contains key words from this section
          const sectionWords = sectionName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const hasMatch = contentH2Lower.some(h2 => 
            sectionWords.some(word => h2.includes(word))
          );
          if (hasMatch) matchedSections++;
        }
      });
      
      const complianceRate = outlineSections.length > 0 
        ? (matchedSections / outlineSections.length) * 100 
        : 100;
      
      results.push({
        id: "outline-compliance",
        label: "Outline structure followed",
        status: complianceRate >= 70 ? "passed" : complianceRate >= 40 ? "warning" : "failed",
        details: outlineSections.length > 0
          ? `${matchedSections}/${outlineSections.length} outline sections found in content (${Math.round(complianceRate)}%)`
          : "Outline provided - verify structure matches",
      });
    } else if (appliedRules?.outlineProvided) {
      results.push({
        id: "outline-compliance",
        label: "Outline structure followed",
        status: "passed",
        details: "Outline was provided for content generation",
      });
    } else {
      results.push({
        id: "outline-compliance",
        label: "Outline structure followed",
        status: "warning",
        details: appliedRules === null
          ? "Imported content - no outline to verify"
          : "No outline provided - content uses AI-generated structure",
      });
    }

    // Check for no em dashes
    const hasEmDash = content.includes("—");
    results.push({
      id: "no-em-dash",
      label: "No em dashes used",
      status: hasEmDash ? "failed" : "passed",
      details: hasEmDash ? "Em dash (—) found in content" : "Clean - no em dashes",
      fixable: hasEmDash,
      fixType: "em-dash",
    });

    // Check for no horizontal lines
    const hasHorizontalLine = /^\s*[-*_]{3,}\s*$/m.test(content);
    results.push({
      id: "no-hr",
      label: "No horizontal lines used",
      status: hasHorizontalLine ? "failed" : "passed",
      details: hasHorizontalLine ? "Horizontal line (---) found in content" : "Clean - no horizontal lines",
      fixable: hasHorizontalLine,
      fixType: "horizontal-line",
    });

    // Check for internal links insertion
    const validInternalLinks = (internalLinks || []).filter(u => u.trim());
    if (validInternalLinks.length > 0) {
      // Check how many of the provided URLs actually appear as links in the content
      const contentLower = content.toLowerCase();
      const insertedLinks = validInternalLinks.filter(url => {
        const urlLower = url.trim().toLowerCase();
        // Check for markdown link syntax containing this URL
        return contentLower.includes(`(${urlLower})`);
      });

      results.push({
        id: "internal-links",
        label: "Internal links inserted",
        status: insertedLinks.length === validInternalLinks.length
          ? "passed"
          : insertedLinks.length > 0
          ? "warning"
          : "failed",
        details: insertedLinks.length > 0
          ? `${insertedLinks.length}/${validInternalLinks.length} internal links placed in content`
          : "Internal links configured but not yet inserted — click 'Insert Links' in settings",
      });
    } else {
      results.push({
        id: "internal-links",
        label: "Internal links inserted",
        status: "warning",
        details: "No internal links configured — add URLs in Section 13 to improve SEO",
      });
    }

    // Check for CTA banners - also check for CTA content in imported markdown
    const hasCTABannerHtml = content.includes('class="cta-banner"') || content.includes("cta-banner");
    const hasCTABlockquote = />\s*\*\*[^*]+\*\*.*\[.+\]\(.+\)/s.test(content);
    const hasInlineCTA = hasCTABannerHtml || hasCTABlockquote;
    
    if (ctaUrl && ctaUrl.trim()) {
      const hasBothCTAs = generatedCTAs?.middle && generatedCTAs?.end;
      const hasAnyCTA = generatedCTAs?.middle || generatedCTAs?.end || hasInlineCTA;
      results.push({
        id: "cta-banners",
        label: "Call-to-action banners",
        status: hasBothCTAs ? "passed" : hasAnyCTA ? "warning" : "failed",
        details: hasBothCTAs 
          ? "Middle and end CTA banners generated" 
          : hasInlineCTA
            ? "CTA found in content - verify placement"
            : hasAnyCTA 
              ? "Only one CTA banner generated" 
              : appliedRules === null
                ? "No CTA banners - use 'Enhance Import' to add CTAs"
                : "No CTA banners generated - regenerate content",
      });
    } else {
      // Show as info that CTA URL is not set
      results.push({
        id: "cta-banners",
        label: "Call-to-action banners",
        status: "warning",
        details: "No CTA URL configured - set a URL to enable CTA banners",
      });
    }

    // Value Promise Claims — point-by-point verification
    const filledClaims = (valuePromiseClaims || []).filter(c => c.trim());
    if (filledClaims.length > 0) {
      const contentLower = content.toLowerCase();
      let claimsPassed = 0;

      filledClaims.forEach((claim, index) => {
        // Extract meaningful keywords from the claim (words > 3 chars, excluding common words)
        const stopWords = ["the", "and", "for", "that", "this", "with", "from", "have", "been", "they", "their", "there", "about", "which", "would", "could", "should", "into", "also", "most", "very", "while", "will", "does", "make", "like", "more", "than", "some", "what", "when", "how"];
        const keyTerms = claim
          .toLowerCase()
          .replace(/["""''.,!?;:()]/g, "")
          .split(/\s+/)
          .filter(w => w.length > 3 && !stopWords.includes(w));
        
        const matchedTerms = keyTerms.filter(term => contentLower.includes(term));
        const matchRate = keyTerms.length > 0 ? matchedTerms.length / keyTerms.length : 0;
        const passed = matchRate >= 0.4;
        if (passed) claimsPassed++;

        results.push({
          id: `value-claim-${index}`,
          label: `VP ${index + 1}: ${claim.length > 50 ? claim.slice(0, 50).trim() + "..." : claim}`,
          status: passed ? "passed" : "failed",
          details: passed
            ? `Claim addressed (${matchedTerms.length}/${keyTerms.length} key terms found)`
            : `Claim NOT addressed — missing terms: ${keyTerms.filter(t => !contentLower.includes(t)).slice(0, 5).join(", ")}`,
        });
      });

      // Overall value promise summary
      results.push({
        id: "value-promise-overall",
        label: `Value promise delivery (${claimsPassed}/${filledClaims.length})`,
        status: claimsPassed === filledClaims.length ? "passed" : claimsPassed > 0 ? "warning" : "failed",
        details: claimsPassed === filledClaims.length
          ? "All value promise claims are addressed in the content"
          : `${filledClaims.length - claimsPassed} claim(s) not adequately covered`,
      });
    } else {
      results.push({
        id: "value-promise-overall",
        label: "Value promise claims",
        status: "warning",
        details: "No value promise claims defined — add claims in Section 7 to verify delivery",
      });
    }

    return results;
  }, [content, appliedRules, ctaUrl, generatedCTAs, internalLinks, selectedGapInsights, valuePromiseClaims]);

  const passedCount = verificationResults.filter((r) => r.status === "passed").length;
  const totalCount = verificationResults.length;

  const getStatusIcon = (status: "passed" | "failed" | "warning") => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
    }
  };

  const handleFix = (item: VerificationItem) => {
    if (item.fixType === "em-dash" && onFixEmDashes) {
      onFixEmDashes();
    } else if (item.fixType === "horizontal-line" && onFixHorizontalLines) {
      onFixHorizontalLines();
    } else if (item.fixType === "word-count" && onRegenerateForWordCount) {
      onRegenerateForWordCount();
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Content Verification</h4>
        <span
          className={cn(
            "text-xs font-medium px-2 py-1 rounded-full",
            passedCount === totalCount
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : passedCount >= totalCount * 0.7
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}
        >
          {passedCount}/{totalCount} Passed
        </span>
      </div>

      <div className="space-y-2">
        {verificationResults.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 text-sm"
          >
            {getStatusIcon(item.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "font-medium",
                  item.status === "passed" && "text-foreground",
                  item.status === "failed" && "text-red-600 dark:text-red-400",
                  item.status === "warning" && "text-amber-600 dark:text-amber-400"
                )}>
                  {item.label}
                </span>
                {item.fixable && item.status !== "passed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleFix(item)}
                  >
                    <Wand2 className="h-3 w-3 mr-1" />
                    {item.fixType === "em-dash" ? "Fix" : "Expand"}
                  </Button>
                )}
              </div>
              {item.details && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {item.details}
                </p>
              )}
              {item.id === "atomic-sections" && item.failingSections && item.failingSections.length > 0 && onRegenerateSection && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.failingSections.map((title) => {
                    const busy = regeneratingSectionTitle === title;
                    return (
                      <Button
                        key={title}
                        variant="outline"
                        size="sm"
                        disabled={!!regeneratingSectionTitle}
                        className="h-6 px-2 text-xs max-w-full"
                        onClick={() => onRegenerateSection(title)}
                        title={`Regenerate section: ${title}`}
                      >
                        <Wand2 className="h-3 w-3 mr-1 flex-shrink-0" />
                        <span className="truncate">{busy ? "Regenerating…" : title}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
