import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, X, CheckCircle2, Brain } from "lucide-react";
import type { BrandAnalysis } from "./QuestionnaireUpload";

interface ContextFile {
  name: string;
  content: string;
  analysis?: BrandAnalysis | null;
  fileBase64?: string;
  fileMimeType?: string;
}

interface ContextFileUploadProps {
  files: ContextFile[];
  onFilesChange: (files: ContextFile[]) => void;
  onAnalysisExtracted?: (analysis: BrandAnalysis) => void;
}

const ContextFileUpload = ({ files, onFilesChange, onAnalysisExtracted }: ContextFileUploadProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (files.some((f) => f.name === file.name)) {
      toast({ title: "File already added", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsParsing(true);
    try {
      // Read raw file as base64 for PDF fallback
      let fileBase64: string | undefined;
      let fileMimeType: string | undefined;
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        fileBase64 = btoa(binary);
        fileMimeType = "application/pdf";
      }

      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("parse-context-file", {
        body: formData,
      });

      if (error) throw error;

      const textContent = data?.content || "";
      const textTooShort = textContent.length < 50;

      if (textTooShort && !isPdf) {
        throw new Error("Could not extract text from file.");
      }

      const newFile: ContextFile = {
        name: file.name,
        content: textTooShort ? `[PDF file: ${file.name} — sent as document to AI for analysis]` : textContent,
        fileBase64: textTooShort ? fileBase64 : undefined,
        fileMimeType: textTooShort ? fileMimeType : undefined,
      };
      const newFiles = [...files, newFile];
      onFilesChange(newFiles);
      toast({ title: "Context file added", description: file.name });

      // Auto-analyze
      analyzeFile(newFile, newFiles);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const analyzeFile = async (file: ContextFile, currentFiles: ContextFile[]) => {
    setAnalyzingFile(file.name);
    try {
      const body: any = { textContent: file.content };
      if (file.fileBase64) {
        body.fileBase64 = file.fileBase64;
        body.fileMimeType = file.fileMimeType;
      }
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        "analyze-questionnaire",
        { body }
      );

      if (analysisError) throw analysisError;
      if (analysisData?.error) throw new Error(analysisData.error);

      const analysis = analysisData.analysis as BrandAnalysis;
      const updated = currentFiles.map((f) =>
        f.name === file.name ? { ...f, analysis } : f
      );
      onFilesChange(updated);
      onAnalysisExtracted?.(analysis);
      toast({ title: "Context analyzed!", description: `Brand: ${analysis.brand}` });
    } catch (err: any) {
      console.error("Context analysis failed:", err);
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzingFile(null);
    }
  };

  const removeFile = (name: string) => {
    onFilesChange(files.filter((f) => f.name !== name));
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf,.txt,.md,.json"
        className="hidden"
        onChange={handleFileUpload}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing}
        >
          {isParsing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <FileText className="h-3.5 w-3.5" />
              Add Context File
            </>
          )}
        </Button>
        {files.map((f) => (
          <div key={f.name} className="flex items-center gap-1">
            <Badge variant="secondary" className="gap-1 pr-1">
              {f.analysis && <CheckCircle2 className="h-3 w-3 text-primary" />}
              {analyzingFile === f.name && <Loader2 className="h-3 w-3 animate-spin" />}
              {f.name}
              <button
                onClick={() => removeFile(f.name)}
                className="ml-1 rounded-full hover:bg-muted p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
            {!f.analysis && analyzingFile !== f.name && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Analyze this file"
                onClick={() => analyzeFile(f, files)}
              >
                <Brain className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Show analysis cards for analyzed files */}
      {files.filter((f) => f.analysis).map((f) => (
        <Card key={f.name} className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Analysis: {f.name}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4">
              <span className="text-primary font-medium">Brand</span>
              <span className="text-right font-semibold">{f.analysis!.brand}</span>
              <span className="text-primary font-medium">Industry</span>
              <span className="text-right">{f.analysis!.industry}</span>
              <span className="text-primary font-medium">Target Audience</span>
              <span className="text-right">{f.analysis!.target_audience}</span>
              <span className="text-primary font-medium">Products/Services</span>
              <span className="text-right">{f.analysis!.products_services}</span>
              <span className="text-primary font-medium">Goals</span>
              <span className="text-right">{f.analysis!.goals}</span>
            </div>
            {f.analysis!.competitors.length > 0 && (
              <div>
                <span className="text-primary font-medium text-xs block mb-1.5">Competitors</span>
                <div className="flex flex-wrap gap-1.5">
                  {f.analysis!.competitors.map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
            {f.analysis!.key_insights.length > 0 && (
              <div>
                <span className="text-primary font-medium text-xs block mb-1.5">Key Insights</span>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {f.analysis!.key_insights.map((insight, i) => (
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
      ))}
    </div>
  );
};

export type { ContextFile };
export default ContextFileUpload;
