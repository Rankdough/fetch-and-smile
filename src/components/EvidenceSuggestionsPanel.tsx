import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, ExternalLink, Plus } from "lucide-react";

interface EvidenceCard {
  fact: string;
  insertText: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  origin: "web" | "first-party";
  matchHeading?: string;
}

interface Props {
  article: string;
  ctaUrl?: string;
  topic?: string;
  onInsert: (newArticle: string) => void;
}

/**
 * Suggests first-hand / citable evidence based on the FINISHED article.
 * Uses Firecrawl Search (web) + Firecrawl Scrape (CTA domain) + Gemini to
 * extract 3 concrete, source-backed insertable sentences. The user clicks
 * Insert to drop the sentence into the best-matching H2 section.
 */
export function EvidenceSuggestionsPanel({ article, ctaUrl, topic, onInsert }: Props) {
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [insertedIdx, setInsertedIdx] = useState<Set<number>>(new Set());
  const [warning, setWarning] = useState<string>("");
  const { toast } = useToast();

  const fetchSuggestions = async () => {
    if (!article || article.trim().length < 100) {
      toast({
        title: "Generate the article first",
        description: "Evidence is suggested based on the finished article.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setWarning("");
    try {
      const { data, error } = await supabase.functions.invoke("suggest-evidence", {
        body: { article, ctaUrl, topic },
      });
      if (error) throw error;
      setCards(data?.cards || []);
      setInsertedIdx(new Set());
      if (data?.warning) setWarning(data.warning);
      if (!data?.cards?.length && !data?.warning) {
        setWarning("No strong evidence could be extracted. Try regenerating.");
      }
    } catch (e: any) {
      toast({
        title: "Failed to fetch evidence",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = (card: EvidenceCard, idx: number) => {
    const lines = article.split("\n");
    const sentence = card.insertText.trim();
    let inserted = false;

    if (card.matchHeading) {
      // Find the H2 line that matches, then insert at the end of that section
      const headingNeedle = card.matchHeading.trim().toLowerCase();
      let h2Idx = -1;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^##\s+(.+?)\s*$/);
        if (m && m[1].trim().toLowerCase() === headingNeedle) { h2Idx = i; break; }
      }
      if (h2Idx >= 0) {
        // Find the next H2 (or end of doc) — insert just before it
        let nextH2 = lines.length;
        for (let i = h2Idx + 1; i < lines.length; i++) {
          if (/^##\s+/.test(lines[i])) { nextH2 = i; break; }
        }
        // Insert as a new paragraph just before the next H2 (skip trailing blank lines)
        let insertAt = nextH2;
        while (insertAt > h2Idx + 1 && lines[insertAt - 1].trim() === "") insertAt--;
        lines.splice(insertAt, 0, "", sentence);
        inserted = true;
      }
    }

    if (!inserted) {
      // Fallback: append before final H2 if exists, otherwise at end
      lines.push("", sentence);
    }

    onInsert(lines.join("\n"));
    setInsertedIdx((prev) => new Set(prev).add(idx));
    toast({
      title: "Evidence inserted",
      description: card.matchHeading ? `Added to "${card.matchHeading}"` : "Added at end of article",
    });
  };

  return (
    <div className="space-y-3 mt-3 border-t border-input-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Or auto-suggest evidence from the web + your CTA site, then insert with one click.
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={fetchSuggestions}
          disabled={loading || !article}
          className="shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
          {loading ? "Searching..." : (cards.length ? "Refresh" : "Suggest evidence")}
        </Button>
      </div>

      {warning && (
        <div className="text-xs text-muted-foreground italic">{warning}</div>
      )}

      {cards.length > 0 && (
        <div className="space-y-2">
          {cards.map((c, i) => (
            <Card key={i} className="p-3 space-y-2 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <Badge variant={c.origin === "first-party" ? "default" : "secondary"} className="text-[10px] uppercase">
                  {c.origin === "first-party" ? "Your site" : "Web"}
                </Badge>
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 truncate max-w-[60%]"
                  title={c.sourceTitle}
                >
                  <span className="truncate">{c.sourceDomain}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <div className="text-sm font-medium leading-snug">{c.fact}</div>
              <div className="text-xs text-muted-foreground italic leading-snug">
                "{c.insertText}"
              </div>
              {c.matchHeading && (
                <div className="text-[11px] text-muted-foreground">
                  Will insert into: <span className="font-medium text-foreground">{c.matchHeading}</span>
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant={insertedIdx.has(i) ? "secondary" : "default"}
                onClick={() => handleInsert(c, i)}
                disabled={insertedIdx.has(i)}
                className="w-full h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                {insertedIdx.has(i) ? "Inserted" : "Insert into article"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
