import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, X } from "lucide-react";

interface ContextFile {
  name: string;
  content: string;
}

interface ContextFileUploadProps {
  files: ContextFile[];
  onFilesChange: (files: ContextFile[]) => void;
}

const ContextFileUpload = ({ files, onFilesChange }: ContextFileUploadProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check for duplicate
    if (files.some((f) => f.name === file.name)) {
      toast({ title: "File already added", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("parse-context-file", {
        body: formData,
      });

      if (error) throw error;
      if (!data?.content || data.content.length < 10) {
        throw new Error("Could not extract text from file.");
      }

      onFilesChange([...files, { name: file.name, content: data.content }]);
      toast({ title: "Context file added", description: file.name });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          <Badge key={f.name} variant="secondary" className="gap-1 pr-1">
            {f.name}
            <button
              onClick={() => removeFile(f.name)}
              className="ml-1 rounded-full hover:bg-muted p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
};

export type { ContextFile };
export default ContextFileUpload;
