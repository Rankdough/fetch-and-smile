import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Deterministic pattern lists (mirrored from humanise-quality-gate) ──

const VAGUE_PHRASES = [
  "various", "numerous", "significant", "important", "notable",
  "considerable", "substantial", "a number of", "a variety of",
  "a range of", "many people", "most people", "some people",
  "can help", "may help", "might help", "tends to",
  "in general", "generally speaking", "as a rule", "for the most part"
];

const REPETITIVE_STARTERS = [
  "this is", "this means", "this includes", "it is", "it's",
  "there are", "there is", "you can", "you should", "you need",
  "you will", "we can", "we should", "one can", "the",
  "when", "if you", "whether"
];

const AI_TRANSITIONS = [
  "moreover", "furthermore", "additionally", "in addition",
  "consequently", "therefore", "thus", "hence",
  "however", "nevertheless", "nonetheless"
];

// ── Deterministic pre-analysis ──

interface HumannessMetrics {
  vaguePhrasesCount: number;
  vaguePer1000: number;
  aiTransitionsCount: number;
  repetitiveStarterPct: number;
  topRepetitiveStarter: string | null;
  sentenceLengthStdDev: number;
  avgSentenceLength: number;
  sectionsWithoutExamples: string[];
}

// ── Strip structural/format sections so only prose is scored ──

const STRUCTURAL_HEADINGS = [
  "TL;DR",
  "Quick Tips",
  "In This Article",
  "Frequently Asked Questions",
  "FAQ",
  "Final Thoughts",
  "References",
];

function stripStructuralSections(content: string): string {
  let stripped = content;
  for (const heading of STRUCTURAL_HEADINGS) {
    // Match ## heading (case-insensitive) and everything until the next ## or end of string
    const pattern = new RegExp(
      `^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n[\\s\\S]*?(?=^## |$)`,
      "gmi"
    );
    stripped = stripped.replace(pattern, "");
  }
  return stripped.trim();
}

function analyzeHumanness(content: string): HumannessMetrics {
  const lowerContent = content.toLowerCase();
  const wordCount = content.split(/\s+/).length;

  // Sentences
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  // Vague phrases
  const vaguePhrasesCount = VAGUE_PHRASES.reduce((count, phrase) => {
    const matches = (lowerContent.match(new RegExp(`\\b${phrase}\\b`, "gi")) || []).length;
    return count + matches;
  }, 0);
  const vaguePer1000 = Math.round((vaguePhrasesCount / wordCount) * 1000);

  // AI transitions
  const aiTransitionsCount = AI_TRANSITIONS.reduce((count, word) => {
    const matches = (lowerContent.match(new RegExp(`\\b${word}\\b`, "gi")) || []).length;
    return count + matches;
  }, 0);

  // Repetitive starters
  const starterCounts: Record<string, number> = {};
  sentences.forEach(s => {
    const words = s.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    const matchedPattern = REPETITIVE_STARTERS.find(p => words.startsWith(p));
    if (matchedPattern) {
      starterCounts[matchedPattern] = (starterCounts[matchedPattern] || 0) + 1;
    }
  });

  const sorted = Object.entries(starterCounts).sort((a, b) => b[1] - a[1]);
  const topRepetitiveStarter = sorted.length > 0 ? sorted[0][0] : null;
  const repetitiveStarterPct = sorted.length > 0
    ? Math.round((sorted[0][1] / sentences.length) * 100)
    : 0;

  // Sentence length variance
  const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
  const avgLen = sentenceLengths.length > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;
  const variance = sentenceLengths.length > 0
    ? sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / sentenceLengths.length
    : 0;
  const stdDev = Math.sqrt(variance);

  // Sections without examples
  const exampleIndicators = ["for example", "for instance", "such as", "e.g.", "like", "£", "$", "%", "specifically"];
  const sections = content.split(/^## /m).filter(s => s.trim());
  const sectionsWithoutExamples: string[] = [];

  sections.slice(1).forEach(section => {
    const sectionTitle = section.split("\n")[0].trim();
    const hasExample = exampleIndicators.some(indicator =>
      section.toLowerCase().includes(indicator) || /\d+/.test(section)
    );
    if (!hasExample &&
        !sectionTitle.toLowerCase().includes("tl;dr") &&
        !sectionTitle.toLowerCase().includes("in this article") &&
        !sectionTitle.toLowerCase().includes("references")) {
      sectionsWithoutExamples.push(sectionTitle);
    }
  });

  return {
    vaguePhrasesCount,
    vaguePer1000,
    aiTransitionsCount,
    repetitiveStarterPct,
    topRepetitiveStarter,
    sentenceLengthStdDev: Math.round(stdDev * 10) / 10,
    avgSentenceLength: Math.round(avgLen),
    sectionsWithoutExamples,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, topic, valuePromise } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // ── Step 0: Strip structural sections so only prose is scored ──
    const proseContent = stripStructuralSections(content);
    console.log("Stripped prose length:", proseContent.length, "vs original:", content.length);

    // ── Step 1: Run deterministic humanness checks on prose only ──
    const metrics = analyzeHumanness(proseContent);
    console.log("Humanness metrics:", JSON.stringify(metrics));

    const systemPrompt = `You are a content quality analyst. Your job is to objectively score content on 5 dimensions.

Score fairly based on evidence. Use the full 0-100 range.

IMPORTANT CONTEXT: This article follows a mandated SEO structure (TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References, question-based headings). Structural sections have been removed from the content below — you are seeing ONLY the body prose. Judge humanness ONLY by the prose quality of the remaining content, not by the article's overall skeleton.

Scoring criteria:

1. ACTIONABILITY (0-100): Does the reader know EXACTLY what to do next?
   - 0-30: Vague advice like "consider your options"
   - 40-60: Some practical tips but missing specifics
   - 70-85: Clear steps with details
   - 86-100: Step-by-step guide with tools, resources, timelines

2. SPECIFICITY (0-100): Real data vs vague claims?
   - 0-30: "Many people believe..." "Studies show..."
   - 40-60: Some numbers but unattributed
   - 70-85: Specific stats with sources
   - 86-100: Original data, named experts, precise figures

3. UNIQUENESS (0-100): How different from typical SEO content?
   - 0-30: Generic, could be any blog
   - 40-60: Competent but predictable
   - 70-85: Fresh angle or perspective
   - 86-100: Genuinely novel insight or framing

4. ENGAGEMENT (0-100): Would someone share this?
   - 0-30: Dry, textbook style
   - 40-60: Readable but forgettable
   - 70-85: Has hooks, questions, surprises
   - 86-100: Compelling narrative, memorable moments

5. HUMANNESS (0-100): Does this prose sound like a human expert wrote it, NOT an AI?
   Evaluate ONLY by prose voice, rhythm, and personality — not article structure.
   - 0-30: Reads like a textbook or corporate memo. Uniform sentence structure, no personality, stiff transitions like "Moreover" and "Furthermore", hedging language everywhere
   - 40-60: Competent but detectable as AI. Formal transitions, vague descriptors ("various", "numerous", "significant"), predictable paragraph structure, no personal voice
   - 70-85: Mostly natural. Some personality and varied rhythm, few AI tells, occasional opinions or asides, uses contractions
   - 86-100: Indistinguishable from an expert human writer. Has a genuine voice, shares opinions, natural conversational flow, mixes short punchy sentences with longer explanations, uses rhetorical questions, includes personal observations

   Key signals to check:
   - Does it read like someone talking to a colleague, or like a textbook?
   - Are there personal observations, opinions, or asides?
   - Does the rhythm feel natural — short punchy bits mixed with longer explanations?
   - Are there contractions, rhetorical questions, or colloquial touches?
   - Do NOT penalise the article for having a mandated structure (headings, FAQ, etc.) — that is intentional SEO formatting

OVERALL SCORE WEIGHTING: Humanness counts for 30% of the overall score. The other four dimensions share the remaining 70% equally (17.5% each).
Formula: overallScore = round(humanness * 0.30 + actionability * 0.175 + specificity * 0.175 + uniqueness * 0.175 + engagement * 0.175)

When writing topStrength and criticalWeakness, ALWAYS consider humanness quality. If the content sounds robotic or AI-generated, that should be the criticalWeakness even if other scores are high.

Return ONLY valid JSON:
{
  "scores": {
    "actionability": {
      "score": 65,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    },
    "specificity": {
      "score": 45,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    },
    "uniqueness": {
      "score": 55,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    },
    "engagement": {
      "score": 50,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    },
    "humanness": {
      "score": 40,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    }
  },
  "overallScore": 48,
  "valuePromiseDelivered": true,
  "valuePromiseAnalysis": "How well the content delivers on the stated value promise",
  "topStrength": "The best thing about this content",
  "criticalWeakness": "The one thing that would most improve this content"
}`;

    const metricsContext = `
DETERMINISTIC HUMANNESS METRICS (pre-computed from the content — use these as evidence):
- Vague filler phrases: ${metrics.vaguePhrasesCount} total (${metrics.vaguePer1000} per 1,000 words)
- AI transition words (Moreover/Furthermore/etc.): ${metrics.aiTransitionsCount}
- Most repeated sentence starter: "${metrics.topRepetitiveStarter || "none"}" at ${metrics.repetitiveStarterPct}% of sentences
- Sentence length: avg ${metrics.avgSentenceLength} words, std dev ${metrics.sentenceLengthStdDev} (below 5 = too uniform/robotic)
- Sections without concrete examples or numbers: ${metrics.sectionsWithoutExamples.length > 0 ? metrics.sectionsWithoutExamples.join(", ") : "none"}
`;

    const userPrompt = `Score this content:

Topic: ${topic || "Not specified"}
Value Promise (what reader should be able to DO after reading): ${valuePromise || "Not specified"}
${metricsContext}
CONTENT (structural sections removed, prose only):
${proseContent.substring(0, 8000)}`;

    console.log("Scoring content quality for topic:", topic);

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content;

    if (!responseContent) {
      throw new Error("No content generated");
    }

    // Parse the JSON response
    const cleanedText = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const scores = JSON.parse(cleanedText);

    // Recalculate overall score with our weighting to ensure consistency
    if (scores.scores) {
      const h = scores.scores.humanness?.score ?? 50;
      const a = scores.scores.actionability?.score ?? 50;
      const s = scores.scores.specificity?.score ?? 50;
      const u = scores.scores.uniqueness?.score ?? 50;
      const e = scores.scores.engagement?.score ?? 50;
      // Apply metrics-based humanness floor: if deterministic checks pass,
      // the subjective scorer should not contradict the objective evidence
      let adjustedH = h;
      if (
        metrics.vaguePer1000 <= 5 &&
        metrics.aiTransitionsCount <= 3 &&
        metrics.sentenceLengthStdDev >= 5 &&
        metrics.repetitiveStarterPct <= 15
      ) {
        const HUMANNESS_FLOOR = 55;
        if (h < HUMANNESS_FLOOR) {
          console.log(`Humanness floor applied: AI scored ${h}, bumped to ${HUMANNESS_FLOOR} (metrics passed all thresholds)`);
          adjustedH = HUMANNESS_FLOOR;
          scores.scores.humanness.score = HUMANNESS_FLOOR;
          scores.scores.humanness.reasoning += ` (Score raised from ${h} to ${HUMANNESS_FLOOR} — deterministic metrics indicate low AI patterns)`;
        }
      }
      scores.overallScore = Math.round(adjustedH * 0.30 + a * 0.175 + s * 0.175 + u * 0.175 + e * 0.175);
    }

    console.log("Quality scores generated, overall:", scores.overallScore);

    return new Response(
      JSON.stringify(scores),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Quality scoring error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to score content quality";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
