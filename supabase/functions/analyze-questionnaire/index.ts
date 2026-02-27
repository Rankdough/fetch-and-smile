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
    const { textContent, fileBase64, fileMimeType } = await req.json();

    const hasText = textContent && textContent.trim().length >= 20;
    const hasFile = fileBase64 && fileMimeType;

    if (!hasText && !hasFile) {
      return new Response(
        JSON.stringify({ error: "Not enough content to analyze. Provide text or a file." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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
            content: `You are a brand analyst and SEO strategist. You receive documents that may be questionnaires, brand briefs, email conversations, strategy documents, or any mix of these.

Your job is to extract key brand information about THE CLIENT BRAND — the company whose SEO/marketing is being discussed or worked on.

CRITICAL RULES FOR IDENTIFYING THE CORRECT BRAND:
- The document may be an email thread between an agency/consultant and their client. The CLIENT is the brand you should analyze, NOT the agency/consultant sending the email.
- Look for clues: Who is answering questionnaire questions? Whose products, audience, and competitors are being discussed? That is the client brand.
- If a company is described as providing SEO services, digital marketing, or consulting TO another company, the OTHER company is the client brand.
- If someone says "our app", "our product", "our users" — that person's company is the client brand.
- Extract real data from the document — do not make up information that isn't present.
- Be concise but comprehensive.
- You must also suggest a keyword research topic that captures the core niche/industry the brand operates in — NOT the brand name itself, but the broader topic area their customers would search for.
- Also extract any additional strategic context, SEO plans, content ideas, or action items mentioned in the document as key_insights.`,
          },
          {
            role: "user",
            content: hasFile
              ? [
                  {
                    type: "text",
                    text: `Analyze this document and extract the key brand information about the CLIENT BRAND being discussed.${hasText ? `\n\nAdditional extracted text:\n${textContent}` : ""}`,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${fileMimeType};base64,${fileBase64}`,
                    },
                  },
                ]
              : `Analyze this document and extract the key brand information about the CLIENT BRAND being discussed:\n\n${textContent}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_brand_analysis",
              description: "Extract structured brand analysis from a questionnaire",
              parameters: {
                type: "object",
                properties: {
                  brand: { type: "string", description: "Brand/company name" },
                  industry: { type: "string", description: "Industry or sector" },
                  target_audience: { type: "string", description: "Description of target audience/customer avatar" },
                  products_services: { type: "string", description: "Main products or services offered" },
                  goals: { type: "string", description: "Key business/marketing goals" },
                  competitors: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of competitor names or URLs",
                  },
                  key_insights: {
                    type: "array",
                    items: { type: "string" },
                    description: "5-8 key strategic insights extracted from the document",
                  },
                  suggested_topic: {
                    type: "string",
                    description: "A broad, SEO-relevant topic for keyword research based on the brand's niche. NOT the brand name. Examples: 'social networking apps for making friends', 'group activities and events for adults over 40', 'meeting new people and reducing loneliness'. Should be what the target audience would search for.",
                  },
                },
                required: ["brand", "industry", "target_audience", "products_services", "goals", "competitors", "key_insights", "suggested_topic"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_brand_analysis" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("No structured output returned from AI");
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log("Brand analysis extracted:", analysis.brand);

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analyze questionnaire error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to analyze questionnaire";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
