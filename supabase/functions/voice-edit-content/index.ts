import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PARAGRAPH_WORDS = 55;
const MAX_PARAGRAPH_SENTENCES = 3;

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
}

function splitLongSentence(sentence: string): string[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_PARAGRAPH_WORDS) return [sentence];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += MAX_PARAGRAPH_WORDS) {
    chunks.push(words.slice(i, i + MAX_PARAGRAPH_WORDS).join(" "));
  }
  return chunks;
}

function shouldSkipParagraphBlock(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed) return true;
  if (trimmed.includes("```")) return true;
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => /^#{1,6}\s+/.test(line))) return true;
  if (lines.some((line) => /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line))) return true;
  if (lines.some((line) => /^>\s*/.test(line) || /^\|/.test(line))) return true;
  if (/<\/?(?:table|thead|tbody|tr|td|th|ul|ol|li|pre|code|figure|aside|nav|script|style)\b/i.test(trimmed)) return true;
  return false;
}

function splitDenseParagraph(block: string): string {
  if (shouldSkipParagraphBlock(block)) return block;
  const paragraph = block.replace(/\s+/g, " ").trim();
  const sentences = splitSentences(paragraph).flatMap(splitLongSentence);
  if (countWords(paragraph) <= MAX_PARAGRAPH_WORDS && sentences.length <= MAX_PARAGRAPH_SENTENCES) return paragraph;

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const sentence of sentences) {
    const words = countWords(sentence);
    if (current.length > 0 && (currentWords + words > MAX_PARAGRAPH_WORDS || current.length >= MAX_PARAGRAPH_SENTENCES)) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += words;
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks.join("\n\n");
}

function enforceParagraphDensity(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map(splitDenseParagraph)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractMaxWordLimit(instruction: string): number | null {
  const patterns = [
    /\bmax(?:imum)?\s*(?:of\s*)?(\d{3,5})\s*words?\b/i,
    /\b(\d{3,5})\s*words?\s*(?:max|maximum|or less|at most)\b/i,
    /\b(?:reduce|shorten|trim|cut|limit)\b[\s\S]{0,60}?\bto\s+(\d{3,5})\s*words?\b/i,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 100 && value <= 10000) {
        return value;
      }
    }
  }

  return null;
}

function trimToMaxWords(content: string, maxWords: number): string {
  const tokens = content.match(/\S+\s*/g) || [];
  if (tokens.length <= maxWords) return content;
  return tokens.slice(0, maxWords).join("").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, instruction, useFirstPerson = false } = await req.json();

    if (!content || !instruction) {
      return new Response(
        JSON.stringify({ error: "content and instruction are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Processing voice edit instruction:", instruction);
    const maxWordLimit = extractMaxWordLimit(instruction);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert content editor. The user will provide an article and a voice instruction to edit it.

CRITICAL RULES:
- Apply ONLY the specific edit requested - do not change anything else
- Maintain the original formatting (markdown headers, lists, tables, etc.)
- Keep the same tone and style unless explicitly asked to change it
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-) only
- NEVER add horizontal rules (---, ***, ___)
- Preserve all source citations and references
- Return ONLY the edited content, no explanations
- PARAGRAPH DENSITY (GLOBAL): No paragraph may exceed 60 words or 3 sentences. If the edit produces or leaves any longer paragraph, split it into multiple shorter paragraphs at logical pivots so the reader can jump easily between them. Never create walls of text.
${maxWordLimit ? `- HARD CONSTRAINT: Final output must be ${maxWordLimit} words maximum` : ""}

PERSPECTIVE RULE (NON-NEGOTIABLE — do NOT change this regardless of the instruction):
${useFirstPerson
  ? `- Write in FIRST PERSON. Use "we", "our", "I" naturally throughout.`
  : `- Write in THIRD PERSON ONLY. Do NOT use first-person pronouns: "I", "we", "our", "my", "us". Write as an objective, authoritative narrator.`
}

Common voice commands:
- "Shorten the introduction" - make intro more concise
- "Expand the section about X" - add more detail to that section
- "Make it more conversational" - adjust tone
- "Add a TL;DR" - add a summary section
- "Fix the formatting" - clean up markdown
- "Remove the section about X" - delete that section
- "Move X before Y" - reorder sections
- "Add more examples" - include practical examples
- "Make it simpler" - reduce complexity`
          },
          {
            role: "user",
            content: `Here is the article to edit:

${content}

---

Voice instruction: "${instruction}"

Apply this edit and return the updated article.${maxWordLimit ? ` Keep the final output at ${maxWordLimit} words maximum.` : ""}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let editedContent = data.choices?.[0]?.message?.content;

    if (!editedContent) {
      throw new Error("No content returned from AI");
    }

    // Post-process: Remove any em dashes and horizontal rules
    editedContent = editedContent.replace(/—/g, "-").replace(/–/g, "-");
    editedContent = editedContent.replace(/^\s*[-*_]{3,}\s*$/gm, "");
    editedContent = enforceParagraphDensity(editedContent);

    // Deterministic max-word enforcement when user explicitly asks for a max limit
    if (maxWordLimit) {
      const currentWords = countWords(editedContent);
      if (currentWords > maxWordLimit) {
        console.warn(`Word limit exceeded (${currentWords} > ${maxWordLimit}), trimming to max`);
        editedContent = trimToMaxWords(editedContent, maxWordLimit);
        editedContent = enforceParagraphDensity(editedContent);
      }
    }

    console.log("Content edited successfully");

    return new Response(
      JSON.stringify({ content: editedContent, instruction }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Voice edit error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to edit content";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
