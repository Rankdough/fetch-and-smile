import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Apply this edit and return the updated article.`
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
