import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const {
      existingContent,
      changedSettings,
      topic,
      keywords,
      toneProfileId,
      useKnowledgeBase,
      instructions,
      valuePromise,
      selectedAngles,
      selectedGapInsights,
      gapAnalysis,
      formatReference,
      contextFiles,
      outline,
      targetLength,
    } = await req.json();

    if (!existingContent || !changedSettings || changedSettings.length === 0) {
      return new Response(
        JSON.stringify({ error: "Existing content and at least one changed setting are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Changed settings:", changedSettings);

    // Build context for each changed setting
    const changeInstructions: string[] = [];
    const structuralChanges = new Set([
      "outline",
      "formatReference",
      "targetLength",
      "gapAnalysis",
      "selectedAngles",
      "selectedGapInsights",
      "valuePromise",
    ]);
    const hasStructuralChanges = changedSettings.some((change) => structuralChanges.has(change));

    for (const change of changedSettings) {
      switch (change) {
        case "toneProfileId": {
          if (toneProfileId) {
            const { data: profileData } = await supabase
              .from("tone_profiles")
              .select("summary, characteristics, example_phrases")
              .eq("id", toneProfileId)
              .maybeSingle();

            if (profileData) {
              const chars = Object.entries(profileData.characteristics || {})
                .map(([k, v]) => `- ${k}: ${v}`)
                .join("\n");
              const phrases = profileData.example_phrases?.slice(0, 5).join('" | "') || "";
              changeInstructions.push(
                `APPLY TONE OF VOICE: Rewrite ONLY the wording, phrasing, sentence rhythm, and voice to match this writing style:\n` +
                `Summary: ${profileData.summary || "N/A"}\n` +
                `Characteristics:\n${chars}\n` +
                `Example phrases: "${phrases}"\n` +
                `CRITICAL COMPETITOR RULE: Do NOT mention any competitor apps or platforms by name (e.g. Bumble, Bumble For Friends, Meetup, Hinge, Tinder, Eventbrite, Facebook Groups, or any other social/dating/friendship app). Replace any such mentions with generic terms like "friendship apps", "social platforms", or "event platforms". The ONLY app you may mention by name is "Meet5".\n` +
                `Keep the existing headings, H2s, H3s, section order, bullet structure, tables, links, CTAs, FAQs, and overall article layout unchanged. Do not rename headings.`
              );
            }
          } else {
            changeInstructions.push(
              "REMOVE TONE OF VOICE: Rewrite ONLY the phrasing into a neutral, professional tone while preserving headings, section order, lists, tables, links, and all structure exactly as-is."
            );
          }
          break;
        }

        case "keywords": {
          changeInstructions.push(
            `OPTIMIZE FOR KEYWORDS: Naturally incorporate these keywords throughout the existing content: ${(keywords || []).join(", ")}. ` +
            `Improve placement within the current article, but keep the existing headings, section order, lists, tables, and overall structure unchanged unless absolutely necessary.`
          );
          break;
        }

        case "useKnowledgeBase": {
          if (useKnowledgeBase) {
            const { data: knowledgeData } = await supabase
              .from("seo_knowledge")
              .select("key_rules")
              .not("key_rules", "is", null);

            if (knowledgeData) {
              const rules = knowledgeData.flatMap((item: any) => item.key_rules || []);
              if (rules.length > 0) {
                changeInstructions.push(
                  `APPLY SEO KNOWLEDGE BASE RULES: Ensure the existing content follows these rules:\n` +
                  rules.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") +
                  `\nAdjust wording and claims where needed, but preserve the existing headings, section order, lists, tables, and article layout.`
                );
              }
            }
          }
          break;
        }

        case "instructions": {
          changeInstructions.push(
            `APPLY NEW INSTRUCTIONS: Follow these additional instructions when rewriting:\n${instructions || "(none)"}\n` +
            `Apply them within the existing structure. Do not rename headings or reorganize sections unless the instructions explicitly require structural changes.`
          );
          break;
        }

        case "valuePromise": {
          changeInstructions.push(
            `UPDATE VALUE PROMISE: The reader MUST be able to: ${valuePromise}. ` +
            `Strengthen the current content to better deliver this outcome. Preserve the current headings and section order wherever possible, only making structural changes if absolutely required.`
          );
          break;
        }

        case "selectedAngles":
        case "selectedGapInsights": {
          const allAngles = [...(selectedGapInsights || []), ...(selectedAngles || [])];
          if (allAngles.length > 0) {
            changeInstructions.push(
              `INCORPORATE UNIQUE ANGLES: Weave these perspectives/insights into the existing content:\n` +
              allAngles.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n") +
              `\nPrefer enriching existing sections first. Only add or restructure sections if there is no other reasonable way to include the requested angles.`
            );
          }
          break;
        }

        case "gapAnalysis": {
          changeInstructions.push(
            `APPLY GAP ANALYSIS: Address the following content gaps identified from competitor analysis:\n${gapAnalysis}\n` +
            `Fill the gaps with the minimum structural change necessary. Prefer improving existing sections over adding new ones.`
          );
          break;
        }

        case "formatReference": {
          changeInstructions.push(
            `APPLY FORMAT REFERENCE: Restructure the content to match this format/structure:\n${formatReference}\n` +
            `This is an explicit structural change, so reorganize the article as needed while preserving the underlying information.`
          );
          break;
        }

        case "contextFiles": {
          const fileContents = (contextFiles || [])
            .map((f: { name: string; content: string }) => `--- ${f.name} ---\n${f.content}`)
            .join("\n\n");
          changeInstructions.push(
            `INCORPORATE CONTEXT FILES AS PRIMARY SOURCE OF TRUTH: Use information from these files as your AUTHORITATIVE source. ` +
            `ONLY use facts, data, statistics, and claims that appear in these files. NEVER fabricate information not found in the files. ` +
            `If the files contain specific numbers or details, use them EXACTLY as provided.\n${fileContents}\n` +
            `Preserve the existing headings and structure while replacing unsupported or inaccurate claims.`
          );
          break;
        }

        case "outline": {
          changeInstructions.push(
            `APPLY NEW OUTLINE: Restructure the content to follow this outline:\n${outline}\n` +
            `This is an explicit structural change, so reorganize headings and sections as needed while preserving the underlying information.`
          );
          break;
        }

        case "targetLength": {
          const wordCounts: Record<string, number> = {
            short: 500, medium: 1000, "medium-long": 1500, long: 2000, extended: 3000, comprehensive: 3500,
          };
          const target = wordCounts[targetLength] || 1000;
          changeInstructions.push(
            `ADJUST LENGTH: Modify the content to be approximately ${target} words. ` +
            `If expanding, add depth mostly inside the existing sections. If shortening, trim redundancy while preserving the current headings and article structure as much as possible.`
          );
          break;
        }

        default:
          console.log("Unknown changed setting:", change);
      }
    }

    if (changeInstructions.length === 0) {
      return new Response(
        JSON.stringify({ content: existingContent, message: "No applicable changes found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert SEO content editor. You will receive an existing article and specific change instructions.
Your job is to apply ONLY the requested changes while preserving everything else exactly as-is.

RERUN MODE: ${hasStructuralChanges ? "STRUCTURAL" : "NON-STRUCTURAL"}

CRITICAL RULES:
1. Preserve ALL existing headings, sections, tables, lists, and structure unless a change specifically requires modification
2. Preserve ALL existing facts, data, statistics, and citations
3. Preserve the overall markdown formatting EXACTLY - every heading level, blank line, list item, and blockquote must remain as-is
4. Do NOT add new sections unless a change specifically requires it
5. Do NOT remove content unless a change specifically requires it
6. Apply changes seamlessly - the result should read as if it was originally written this way
7. Keep the same approximate length unless a length change is requested
8. Return ONLY the modified article content in markdown format, no explanations

${hasStructuralChanges ? `STRUCTURAL RERUN RULES:
- Structural changes are allowed ONLY because one of the requested settings explicitly requires them
- Still preserve as much of the original article as possible
- Reuse existing headings and section structure wherever reasonable
- Make the minimum structural changes necessary to satisfy the request` : `NON-STRUCTURAL RERUN RULES:
- You are NOT allowed to change the heading hierarchy
- You are NOT allowed to rename H1, H2, or H3 headings
- You are NOT allowed to reorder sections
- You are NOT allowed to add sections, remove sections, or merge sections
- You are NOT allowed to convert paragraphs into lists or lists into paragraphs
- You are NOT allowed to alter table structure
- Rewrite only the prose inside the existing structure
- Think of this as an in-place edit of the existing article, not a regeneration`}

MANDATORY FORMAT PRESERVATION - these specific section formats MUST be kept exactly:
- "## TL;DR" must remain as a single dense paragraph (NOT bullet points)
- "## Quick Tips" must keep each tip on its own line as: > **Tip N:** [text]
- "## In This Article" must keep the bulleted list format with each item as: - **N. Title** - Description (each item on its own line, separated by blank lines)
- "## Frequently Asked Questions" must keep each Q&A with ### bold question headings
- "## How to Choose" must remain as a checklist/bulleted list
- All H2 headings that were phrased as questions MUST stay as questions
- Markdown tables (using |) must be preserved exactly
- Source/reference links must be preserved exactly
- Each section must be separated by blank lines
- Do NOT collapse multi-line sections into single paragraphs
- Do NOT merge separate list items into running text
- Do NOT remove blank lines between sections or list items`;

    const userPrompt = `Here is the existing article:\n\n${existingContent}\n\n---\n\nApply the following changes to this article:\n\n${changeInstructions.join("\n\n---\n\n")}`;

    console.log(`Applying ${changeInstructions.length} change(s) to existing content`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const firstChoice = data.choices?.[0];
    let content = firstChoice?.message?.content || "";
    let finishReason = firstChoice?.finish_reason;

    // If output gets cut off, continue to avoid truncated reruns
    let continuationAttempts = 0;
    while (finishReason === "length" && continuationAttempts < 2) {
      continuationAttempts += 1;
      console.warn(`Rerun output truncated. Fetching continuation (${continuationAttempts}/2)...`);

      const continuationResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.3,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
            { role: "assistant", content },
            {
              role: "user",
              content:
                "Continue exactly from where you stopped. Do not repeat prior content. Return only the remaining article text.",
            },
          ],
        }),
      });

      if (!continuationResponse.ok) {
        const errorText = await continuationResponse.text();
        console.error("Rerun continuation error:", errorText);
        break;
      }

      const continuationData = await continuationResponse.json();
      const continuationChoice = continuationData.choices?.[0];
      const continuationText = continuationChoice?.message?.content || "";
      if (!continuationText) break;

      content = `${content}\n${continuationText}`;
      finishReason = continuationChoice?.finish_reason;
    }

    // Clean up any markdown code fences
    content = content.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    console.log("Rerun complete. Output length:", content.length);

    return new Response(
      JSON.stringify({
        content,
        appliedChanges: changedSettings,
        changeCount: changeInstructions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Rerun changes error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
