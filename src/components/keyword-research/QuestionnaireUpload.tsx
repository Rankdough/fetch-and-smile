import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, CheckCircle2, X } from "lucide-react";

export interface BrandAnalysis {
  brand: string;
  industry: string;
  target_audience: string;
  products_services: string;
  goals: string;
  competitors: string[];
  key_insights: string[];
  suggested_topic: string;
}

interface QuestionnaireUploadProps {
  onAnalysisComplete: (analysis: BrandAnalysis, rawText: string) => void;
  analysis: BrandAnalysis | null;
  onClear: () => void;
}

const QuestionnaireUpload = ({ onAnalysisComplete, analysis, onClear }: QuestionnaireUploadProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsAnalyzing(true);

    try {
      // Step 1: Parse the file using existing parse-context-file function
      const formData = new FormData();
      formData.append("file", file);

      const { data: parseData, error: parseError } = await supabase.functions.invoke(
        "parse-context-file",
        { body: formData }
      );

      if (parseError) throw parseError;
      if (!parseData?.content || parseData.content.length < 20) {
        throw new Error("Could not extract text from file. Try a .docx, .pdf, or .txt file.");
      }

      // Step 2: Analyze the extracted text
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        "analyze-questionnaire",
        { body: { textContent: parseData.content } }
      );

      if (analysisError) throw analysisError;
      if (analysisData?.error) throw new Error(analysisData.error);

      onAnalysisComplete(analysisData.analysis, parseData.content);
      toast({ title: "Questionnaire analyzed!", description: `Brand: ${analysisData.analysis.brand}` });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Analysis failed",
        description: err.message || "Please try again",
        variant: "destructive",
      });
      setFileName(null);
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (analysis) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Extracted from Questionnaire
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4">
            <span className="text-primary font-medium">Brand</span>
            <span className="text-right font-semibold">{analysis.brand}</span>

            <span className="text-primary font-medium">Industry</span>
            <span className="text-right">{analysis.industry}</span>

            <span className="text-primary font-medium">Target Audience</span>
            <span className="text-right">{analysis.target_audience}</span>

            <span className="text-primary font-medium">Products/Services</span>
            <span className="text-right">{analysis.products_services}</span>

            <span className="text-primary font-medium">Goals</span>
            <span className="text-right">{analysis.goals}</span>
          </div>

          {analysis.competitors.length > 0 && (
            <div>
              <span className="text-primary font-medium text-xs block mb-1.5">Competitors found</span>
              <div className="flex flex-wrap gap-1.5">
                {analysis.competitors.map((c, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                ))}
              </div>
            </div>
          )}

          {analysis.key_insights.length > 0 && (
            <div>
              <span className="text-primary font-medium text-xs block mb-1.5">Key Insights</span>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {analysis.key_insights.map((insight, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf,.txt,.md,.json"
        className="hidden"
        onChange={handleFileUpload}
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing {fileName}...
          </>
        ) : (
          <>
            <FileText className="h-3.5 w-3.5" />
            Upload Questionnaire
          </>
        )}
      </Button>
    </div>
  );
};

export default QuestionnaireUpload;
