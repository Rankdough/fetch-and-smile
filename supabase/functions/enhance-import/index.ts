import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ArticleImage {
  alt: string;
  url: string;
}

interface EnhanceRequest {
  content: string;
  toneProfile?: {
    name: string;
    summary?: string;
    characteristics?: Record<string, unknown>;
    example_phrases?: string[];
  };
  ctaConfig?: {
    headline: string;
    description: string;
    buttonText: string;
    buttonUrl: string;
  };
  addCtas: boolean;
  images?: ArticleImage[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, toneProfile, ctaConfig, addCtas, images } = await req.json() as EnhanceRequest;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we actually need to call the AI
    const needsAI = toneProfile || addCtas;
    
    // If we only need to insert images, do it locally without AI
    if (!needsAI && images && images.length > 0) {
      const enhancedContent = insertImagesLocally(content, images);
      console.log("Images inserted locally without AI call");
      
      return new Response(
        JSON.stringify({ 
          content: enhancedContent,
          toneApplied: false,
          ctasAdded: false,
          imagesInserted: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If nothing to enhance, return original
    if (!needsAI && (!images || images.length === 0)) {
      return new Response(
        JSON.stringify({ 
          content,
          toneApplied: false,
          ctasAdded: false,
          imagesInserted: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Check if content already has CTAs (blockquote format with bold + link)
    const existingCtaPattern = />\s*\*\*[^*]+\*\*[\s\S]*?\[.+\]\(.+\)/;
    const hasExistingCtas = existingCtaPattern.test(content);
    
    // Don't add CTAs if content already has them
    const shouldAddCtas = addCtas && !hasExistingCtas;

    console.log("Enhancing imported content", {
      hasTone: !!toneProfile,
      addCtas,
      hasExistingCtas,
      shouldAddCtas,
      hasImages: images && images.length > 0,
      contentLength: content.length
    });

    // Build system prompt
    let systemPrompt = `You are an expert content editor. Your task is to enhance imported article content.

CRITICAL RULES:
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-) only
- NEVER add horizontal rules (---, ***, ___)
- Preserve all existing content structure, headings, tables, and lists
- Maintain all source citations and references
- Keep all links intact
- Return ONLY the enhanced content in markdown format, no explanations`;

    // Add tone instructions if provided
    if (toneProfile) {
      systemPrompt += `

TONE OF VOICE:
Apply this writing style throughout the content:
- Profile Name: ${toneProfile.name}
${toneProfile.summary ? `- Summary: ${toneProfile.summary}` : ""}
${toneProfile.example_phrases?.length ? `- Example phrases to emulate: ${toneProfile.example_phrases.join(", ")}` : ""}

Rewrite sentences to match this tone while preserving the meaning.`;
    }

    // Add CTA instructions if needed - use markdown blockquote format that our renderer understands
    // Skip if content already has CTAs
    if (shouldAddCtas && ctaConfig) {
      systemPrompt += `

CALL-TO-ACTION BANNERS:
Insert 2-3 CTA banners at natural break points in the article (after major sections).
Use this EXACT markdown blockquote format for each CTA:

> **${ctaConfig.headline.toUpperCase()}**
> ${ctaConfig.description}
> [${ctaConfig.buttonText}](${ctaConfig.buttonUrl})

IMPORTANT: Each CTA must be a blockquote (lines starting with >) with:
- Bold headline on first line
- Description on second line  
- Link on third line

Place CTAs strategically - not at the very beginning or end, but after compelling sections.`;
    } else if (shouldAddCtas) {
      systemPrompt += `

CALL-TO-ACTION BANNERS:
Insert 2-3 generic CTA banners at natural break points in the article.
Use this EXACT markdown blockquote format:

> **WANT TO LEARN MORE?**
> Get expert insights delivered to your inbox.
> [Subscribe Now](#signup)

IMPORTANT: Each CTA must be a blockquote (lines starting with >) with:
- Bold headline on first line
- Description on second line
- Link on third line

Place CTAs strategically after compelling sections.`;
    }

    // Add image instructions if provided
    if (images && images.length > 0) {
      systemPrompt += `

IMAGES TO INSERT:
Insert these images at appropriate locations in the article, using standard markdown image syntax.
Place images after relevant paragraphs that relate to the image content.

Available images:
${images.map((img, i) => `${i + 1}. ![${img.alt}](${img.url})`).join("\n")}

Insert each image on its own line after a relevant paragraph.`;
    }

    const userPrompt = `Here is the imported article content to enhance:

${content}

${toneProfile ? "Apply the tone profile to make the writing more consistent." : ""}
${addCtas ? "Add CTA banners at appropriate locations." : ""}
${images && images.length > 0 ? `Insert ${images.length} image(s) at appropriate locations.` : ""}

Return the enhanced article.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let enhancedContent = data.choices?.[0]?.message?.content;

    if (!enhancedContent) {
      throw new Error("No content returned from AI");
    }

    // Post-process: Remove any em dashes and horizontal rules
    enhancedContent = enhancedContent.replace(/—/g, "-").replace(/–/g, "-");
    enhancedContent = enhancedContent.replace(/^\s*[-*_]{3,}\s*$/gm, "");

    console.log("Content enhanced successfully");

    return new Response(
      JSON.stringify({ 
        content: enhancedContent,
        toneApplied: !!toneProfile,
        ctasAdded: shouldAddCtas,
        existingCtasPreserved: hasExistingCtas,
        imagesInserted: images && images.length > 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Enhance import error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to enhance content";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to insert images locally without AI - places images ABOVE H2 headings
function insertImagesLocally(content: string, images: ArticleImage[]): string {
  if (images.length === 0) return content;
  
  // Build a set of image URLs we're about to insert
  const imageUrls = new Set(images.map(img => img.url));
  
  // Strip any existing markdown image lines that match the images we're inserting
  // This prevents duplication when re-allocating
  const cleanedLines = content.split("\n").filter(line => {
    const imgMatch = line.trim().match(/^!\[.*?\]\((.+?)\)$/);
    if (imgMatch && imageUrls.has(imgMatch[1])) {
      return false; // Remove this line — we'll re-insert it
    }
    return true;
  });
  
  // Also clean up any resulting double-blank-lines from removal
  const lines: string[] = [];
  for (const line of cleanedLines) {
    if (line.trim() === "" && lines.length > 0 && lines[lines.length - 1].trim() === "") {
      continue; // skip consecutive blank lines
    }
    lines.push(line);
  }
  
  // Headings to skip for image placement
  const skipHeadings = [
    "tl;dr", "tldr", "in this article", "faq", "frequently asked questions",
    "references", "sources", "final thoughts", "conclusion", "summary",
    "introduction"
  ];
  
  // Find all H2 heading indices that are valid for image placement
  // Also check for bold headings like **Heading** on their own line
  const h2Indices: number[] = [];
  // Track ALL H2-style lines (including skipped ones) so we can compute the
  // forbidden ranges spanned by skipped sections (TL;DR, FAQ, References, ...).
  const allHeadingIndices: number[] = [];
  const skippedHeadingIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for markdown H2 (## Heading)
    const isH2 = line.startsWith("## ");
    // Check for bold-style heading (**Heading**) on its own line
    const isBoldHeading = /^\*\*[^*]+\*\*$/.test(line);

    if (isH2 || isBoldHeading) {
      const headingText = line
        .replace(/^## /, "")
        .replace(/^\*\*/, "")
        .replace(/\*\*$/, "")
        .toLowerCase()
        .trim();

      const shouldSkip = skipHeadings.some(skip => headingText.includes(skip));

      console.log(`Heading at line ${i}: "${headingText}" - skip: ${shouldSkip}`);

      if (isH2) {
        allHeadingIndices.push(i);
        if (shouldSkip) skippedHeadingIndices.push(i);
        else h2Indices.push(i);
      }
    }
  }

  // Build forbidden line ranges for every skipped section (heading line through
  // the next H2). Images must never be inserted inside these ranges.
  const forbiddenRanges: { start: number; end: number }[] = [];
  for (const skipIdx of skippedHeadingIndices) {
    const nextHeading = allHeadingIndices.find((h) => h > skipIdx);
    forbiddenRanges.push({ start: skipIdx, end: nextHeading ?? lines.length });
  }
  const isInForbiddenRange = (lineIdx: number) =>
    forbiddenRanges.some((r) => lineIdx >= r.start && lineIdx < r.end);

  console.log(`Found ${h2Indices.length} valid H2 headings for ${images.length} images`);
  console.log(`H2 indices: ${JSON.stringify(h2Indices)}`);
  console.log(`Forbidden ranges (skipped sections): ${JSON.stringify(forbiddenRanges)}`);
  
  // If no valid H2s found, distribute images evenly throughout the content
  if (h2Indices.length === 0) {
    console.log("No H2 headings found, distributing images evenly through content");
    
    // Find paragraph breaks (empty lines followed by content)
    const paragraphBreaks: number[] = [];
    for (let i = 1; i < lines.length - 1; i++) {
      if (lines[i].trim() === "" && lines[i + 1] && lines[i + 1].trim() && 
          !lines[i + 1].startsWith("#") && !lines[i + 1].startsWith("|") &&
          !lines[i + 1].startsWith("!") && !lines[i + 1].startsWith("-")) {
        paragraphBreaks.push(i);
      }
    }
    
    console.log(`Found ${paragraphBreaks.length} paragraph breaks`);
    
    if (paragraphBreaks.length === 0) {
      // Just append at the end
      return content + "\n\n" + images.map(img => `![${img.alt}](${img.url})`).join("\n\n");
    }
    
    // Distribute images evenly across paragraph breaks
    const step = Math.max(1, Math.floor(paragraphBreaks.length / images.length));
    const insertPoints: {index: number, image: ArticleImage}[] = [];
    
    for (let i = 0; i < images.length; i++) {
      const breakIndex = Math.min(i * step, paragraphBreaks.length - 1);
      insertPoints.push({ index: paragraphBreaks[breakIndex], image: images[i] });
    }
    
    // Sort by index descending so we insert from bottom to top (preserves indices)
    insertPoints.sort((a, b) => b.index - a.index);
    
    const result = [...lines];
    for (const point of insertPoints) {
      result.splice(point.index + 1, 0, "", `![${point.image.alt}](${point.image.url})`, "");
    }
    
    return result.join("\n");
  }
  
  // Distribute images: max ONE image per H2, extras go to paragraph breaks between H2s
  // First pass: assign one image per H2 (evenly spaced if fewer images than H2s)
  const assignedToH2: Map<number, ArticleImage> = new Map();
  
  if (images.length <= h2Indices.length) {
    // Fewer images than H2s — space them evenly
    const step = Math.max(1, Math.floor(h2Indices.length / images.length));
    for (let i = 0; i < images.length; i++) {
      const h2Idx = Math.min(i * step, h2Indices.length - 1);
      assignedToH2.set(h2Indices[h2Idx], images[i]);
    }
  } else {
    // More images than H2s — one per H2, extras go to paragraph breaks
    for (let i = 0; i < h2Indices.length && i < images.length; i++) {
      assignedToH2.set(h2Indices[i], images[i]);
    }
  }
  
  const remainingImages = images.slice(assignedToH2.size);
  
  console.log(`Assigned ${assignedToH2.size} images to H2s, ${remainingImages.length} remaining for paragraph breaks`);
  
  // Find paragraph breaks between H2s for remaining images (not near headings)
  const paragraphBreaks: number[] = [];
  for (let i = 1; i < lines.length - 1; i++) {
    // Skip lines near H2 headings (within 2 lines)
    const nearH2 = h2Indices.some(h => Math.abs(h - i) <= 2);
    if (nearH2) continue;
    
    if (lines[i].trim() === "" && lines[i + 1] && lines[i + 1].trim() &&
        !lines[i + 1].startsWith("#") && !lines[i + 1].startsWith("|") &&
        !lines[i + 1].startsWith("!") && !lines[i + 1].startsWith("-") &&
        !lines[i + 1].startsWith(">")) {
      paragraphBreaks.push(i);
    }
  }
  
  // Distribute remaining images evenly across paragraph breaks
  const breakAssignments: Map<number, ArticleImage> = new Map();
  if (remainingImages.length > 0 && paragraphBreaks.length > 0) {
    const step = Math.max(1, Math.floor(paragraphBreaks.length / remainingImages.length));
    for (let i = 0; i < remainingImages.length; i++) {
      const breakIdx = Math.min(i * step, paragraphBreaks.length - 1);
      // Only assign if this break isn't already taken
      if (!breakAssignments.has(paragraphBreaks[breakIdx])) {
        breakAssignments.set(paragraphBreaks[breakIdx], remainingImages[i]);
      }
    }
  }
  
  console.log(`Assigned ${breakAssignments.size} remaining images to paragraph breaks`);
  
  // Build result
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Insert image ABOVE H2 if assigned
    if (assignedToH2.has(i)) {
      const img = assignedToH2.get(i)!;
      result.push(`![${img.alt}](${img.url})`);
      result.push("");
    }
    
    result.push(lines[i]);
    
    // Insert image AFTER paragraph break if assigned
    if (breakAssignments.has(i)) {
      const img = breakAssignments.get(i)!;
      result.push("");
      result.push(`![${img.alt}](${img.url})`);
    }
  }
  
  return result.join("\n");
}
