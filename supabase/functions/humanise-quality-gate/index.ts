import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Patterns that indicate AI-generated content
const VAGUE_PHRASES = [
  "various",
  "numerous",
  "significant",
  "important",
  "notable",
  "considerable",
  "substantial",
  "a number of",
  "a variety of",
  "a range of",
  "many people",
  "most people",
  "some people",
  "can help",
  "may help",
  "might help",
  "tends to",
  "in general",
  "generally speaking",
  "as a rule",
  "for the most part"
];

const REPETITIVE_STARTERS = [
  "this is",
  "this means",
  "this includes",
  "it is",
  "it's",
  "there are",
  "there is",
  "you can",
  "you should",
  "you need",
  "you will",
  "we can",
  "we should",
  "one can",
  "the",
  "when",
  "if you",
  "whether"
];

const AI_TRANSITIONS = [
  "moreover",
  "furthermore",
  "additionally",
  "in addition",
  "consequently",
  "therefore",
  "thus",
  "hence",
  "however",
  "nevertheless",
  "nonetheless"
];

interface Issue {
  type: string;
  count?: number;
  percentage?: number;
  sections?: string[];
  examples?: string[];
  fix: string;
}

interface QualityResult {
  score: number;
  passed: boolean;
  issues: Issue[];
  metrics: {
    sentenceStarterVariety: number;
    vaguePhrasesCount: number;
    aiTransitionsCount: number;
    averageSentenceLength: number;
    sentenceLengthVariance: number;
    sectionsWithExamples: number;
    totalSections: number;
  };
}

function analyzeContent(content: string): QualityResult {
  const issues: Issue[] = [];
  
  // Split into sentences (rough)
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  
  // Split into sections (by H2)
  const sections = content.split(/^## /m).filter(s => s.trim());
  const totalSections = Math.max(sections.length - 1, 1); // Exclude first part before H2
  
  // Analyze sentence starters
  const starters = sentences.map(s => {
    const words = s.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    return words;
  });
  
  const starterCounts: Record<string, number> = {};
  starters.forEach(starter => {
    const matchedPattern = REPETITIVE_STARTERS.find(p => starter.startsWith(p));
    if (matchedPattern) {
      starterCounts[matchedPattern] = (starterCounts[matchedPattern] || 0) + 1;
    }
  });
  
  // Find the most repeated starter
  const repetitiveStarters = Object.entries(starterCounts)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);
  
  if (repetitiveStarters.length > 0) {
    const [pattern, count] = repetitiveStarters[0];
    const percentage = Math.round((count / sentences.length) * 100);
    if (percentage > 15) {
      issues.push({
        type: "repetitive_opener",
        count,
        percentage,
        examples: sentences.filter(s => s.toLowerCase().startsWith(pattern)).slice(0, 3),
        fix: `${percentage}% of sentences start with "${pattern}". Vary sentence starters.`
      });
    }
  }
  
  // Count vague phrases
  const lowerContent = content.toLowerCase();
  const vagueCount = VAGUE_PHRASES.reduce((count, phrase) => {
    const matches = (lowerContent.match(new RegExp(`\\b${phrase}\\b`, "gi")) || []).length;
    return count + matches;
  }, 0);
  
  const wordCount = content.split(/\s+/).length;
  const vaguePer1000 = Math.round((vagueCount / wordCount) * 1000);
  
  if (vaguePer1000 > 5) {
    issues.push({
      type: "vague_language",
      count: vagueCount,
      fix: `${vagueCount} vague phrases found (${vaguePer1000} per 1000 words). Replace with specific numbers or examples.`
    });
  }
  
  // Count AI transitions
  const transitionCount = AI_TRANSITIONS.reduce((count, word) => {
    const matches = (lowerContent.match(new RegExp(`\\b${word}\\b`, "gi")) || []).length;
    return count + matches;
  }, 0);
  
  if (transitionCount > 3) {
    issues.push({
      type: "ai_transitions",
      count: transitionCount,
      fix: `${transitionCount} formal transitions found. Replace "Moreover/Furthermore" with "But/And/Yet" or direct statements.`
    });
  }
  
  // Analyze sentence length variance
  const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
  const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
  const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / sentenceLengths.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev < 5) {
    issues.push({
      type: "uniform_sentences",
      fix: `Sentences are too uniform in length (avg ${Math.round(avgLength)} words, std dev ${Math.round(stdDev)}). Mix short (5-8) and long (20+) sentences.`
    });
  }
  
  // Check for examples in each section
  const exampleIndicators = ["for example", "for instance", "such as", "e.g.", "like", "£", "$", "%", "specifically"];
  let sectionsWithExamples = 0;
  const sectionsWithoutExamples: string[] = [];
  
  sections.slice(1).forEach(section => {
    const sectionTitle = section.split("\n")[0].trim();
    const hasExample = exampleIndicators.some(indicator => 
      section.toLowerCase().includes(indicator) || /\d+/.test(section)
    );
    if (hasExample) {
      sectionsWithExamples++;
    } else if (!sectionTitle.toLowerCase().includes("tl;dr") && 
               !sectionTitle.toLowerCase().includes("in this article") &&
               !sectionTitle.toLowerCase().includes("references")) {
      sectionsWithoutExamples.push(sectionTitle);
    }
  });
  
  if (sectionsWithoutExamples.length > 0) {
    issues.push({
      type: "missing_examples",
      sections: sectionsWithoutExamples,
      fix: `These sections lack specific examples or numbers: ${sectionsWithoutExamples.join(", ")}`
    });
  }
  
  // Calculate score (100 = perfect, 0 = very AI)
  let score = 100;
  
  // Deduct for repetitive starters
  const starterVariety = 1 - (Object.values(starterCounts).reduce((a, b) => a + b, 0) / sentences.length);
  score -= (1 - starterVariety) * 30;
  
  // Deduct for vague phrases
  score -= Math.min(vaguePer1000, 10) * 2;
  
  // Deduct for AI transitions
  score -= transitionCount * 3;
  
  // Deduct for uniform sentences
  if (stdDev < 5) score -= 15;
  
  // Deduct for missing examples
  score -= sectionsWithoutExamples.length * 5;
  
  // Ensure score is between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  return {
    score,
    passed: score >= 70 && issues.filter(i => 
      i.type === "repetitive_opener" || 
      i.type === "ai_transitions"
    ).length === 0,
    issues,
    metrics: {
      sentenceStarterVariety: Math.round(starterVariety * 100),
      vaguePhrasesCount: vagueCount,
      aiTransitionsCount: transitionCount,
      averageSentenceLength: Math.round(avgLength),
      sentenceLengthVariance: Math.round(stdDev),
      sectionsWithExamples,
      totalSections
    }
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { draft, valuePromise } = await req.json();

    if (!draft) {
      return new Response(
        JSON.stringify({ error: "Draft content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Running quality gate on draft:", draft.length, "chars");

    const result = analyzeContent(draft);

    console.log("Quality gate result:", {
      score: result.score,
      passed: result.passed,
      issueCount: result.issues.length
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Quality gate error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to run quality gate";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
