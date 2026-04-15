import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Lightbulb, Check, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface InformationGainGap {
  gap: string;
  whatsOverPublished: string;
}

interface UniqueAngle {
  title: string;
  description: string;
  informationGainGap: string;
  whyItWorks: string;
  exampleHook: string;
}

interface UniqueAnglesPanelProps {
  topic: string;
  gapAnalysis: string;
  selectedAngles: string[];
  onAnglesChange: (angles: string[]) => void;
  toneProfileId: string | null;
}

export const UniqueAnglesPanel = ({ 
  topic, 
  gapAnalysis, 
  selectedAngles, 
  onAnglesChange,
  toneProfileId,
}: UniqueAnglesPanelProps) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [angles, setAngles] = useState<UniqueAngle[]>([]);
  const [gaps, setGaps] = useState<InformationGainGap[]>([]);
  const [expandedAngle, setExpandedAngle] = useState<number | null>(null);
  const [showGaps, setShowGaps] = useState(false);

  const handleGenerateAngles = async () => {
    if (!topic.trim()) {
      toast({ title: "Topic required", description: "Enter a topic first to generate unique angles.", variant: "destructive" });
      return;
    }
    if (!gapAnalysis.trim()) {
      toast({ title: "Gap analysis required", description: "Run gap analysis on competitor URLs first to generate unique angles.", variant: "destructive" });
      return;
    }
    
    setIsGenerating(true);
    try {
      let toneProfile = null;
      if (toneProfileId) {
        const { data: profileData } = await supabase
          .from("tone_profiles")
          .select("summary, characteristics, example_phrases")
          .eq("id", toneProfileId)
          .maybeSingle();
        if (profileData) toneProfile = profileData;
      }

      const { data, error } = await supabase.functions.invoke("generate-unique-angles", {
        body: { topic, gapAnalysis, toneProfile },
      });

      if (error) throw error;
      
      setAngles(data.angles || []);
      setGaps(data.gaps || []);
      setShowGaps(true);
      toast({
        title: "Unique angles generated!",
        description: `${data.gaps?.length || 0} information gaps identified, ${data.angles?.length || 0} angles to fill them.`,
      });
    } catch (error) {
      console.error("Angle generation error:", error);
      toast({ title: "Generation failed", description: error instanceof Error ? error.message : "Failed to generate angles", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleAngle = (angleTitle: string) => {
    if (selectedAngles.includes(angleTitle)) {
      onAnglesChange(selectedAngles.filter(a => a !== angleTitle));
    } else {
      onAnglesChange([...selectedAngles, angleTitle]);
    }
  };

  const hasGapAnalysis = gapAnalysis.trim().length > 0;

  if (angles.length === 0) {
    return (
      <div className={cn(
        "rounded-lg border p-4",
        hasGapAnalysis ? "bg-gradient-to-r from-amber-500/5 to-orange-500/10" : "bg-muted/30"
      )}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className={cn("h-4 w-4", hasGapAnalysis ? "text-amber-500" : "text-muted-foreground")} />
              Unique Angle Generator
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {hasGapAnalysis 
                ? "Identify information gain gaps & generate angles to fill them" 
                : "Run gap analysis first to generate unique angles"}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleGenerateAngles} disabled={isGenerating || !topic.trim() || !hasGapAnalysis}>
            {isGenerating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>) : (<><Lightbulb className="h-4 w-4 mr-2" />Generate Angles</>)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Unique Angles
          {selectedAngles.length > 0 && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
              {selectedAngles.length} selected
            </span>
          )}
        </h4>
        <Button size="sm" variant="ghost" onClick={handleGenerateAngles} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Regenerate"}
        </Button>
      </div>

      {/* Information Gain Gaps Summary */}
      {gaps.length > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setShowGaps(!showGaps)}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {gaps.length} Information Gain Gaps Identified
            </span>
            {showGaps ? <ChevronUp className="h-3 w-3 ml-auto text-amber-600" /> : <ChevronDown className="h-3 w-3 ml-auto text-amber-600" />}
          </button>
          {showGaps && (
            <div className="mt-2 space-y-2">
              {gaps.map((g, i) => (
                <div key={i} className="text-xs pl-5 space-y-0.5">
                  <p className="font-medium">{g.gap}</p>
                  <p className="text-muted-foreground italic">Over-published: {g.whatsOverPublished}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Select one or more angles to incorporate into your article:
      </p>

      <div className="space-y-2">
        {angles.map((angle, index) => (
          <div
            key={index}
            className={cn(
              "rounded-lg border p-3 transition-all cursor-pointer",
              selectedAngles.includes(angle.title) 
                ? "border-primary bg-primary/5 ring-1 ring-primary" 
                : "hover:border-muted-foreground/50"
            )}
          >
            <div className="flex items-start gap-3" onClick={() => toggleAngle(angle.title)}>
              <div className={cn(
                "flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center mt-0.5",
                selectedAngles.includes(angle.title) 
                  ? "bg-primary border-primary text-primary-foreground" 
                  : "border-muted-foreground/30"
              )}>
                {selectedAngles.includes(angle.title) && <Check className="h-3 w-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{angle.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{angle.description}</p>
              </div>
              <Button
                variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); setExpandedAngle(expandedAngle === index ? null : index); }}
              >
                {expandedAngle === index ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
            
            {expandedAngle === index && (
              <div className="mt-3 pl-8 space-y-2 border-t pt-3">
                <div>
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Information gain gap:</p>
                  <p className="text-xs">{angle.informationGainGap}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Why it works:</p>
                  <p className="text-xs">{angle.whyItWorks}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Example hook:</p>
                  <p className="text-xs italic">"{angle.exampleHook}"</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
