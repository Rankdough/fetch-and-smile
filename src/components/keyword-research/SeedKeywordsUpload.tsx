import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, X, Database, ChevronDown, ChevronRight, Type, Plus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface SeedFile {
  name: string;
  type: "gsc" | "organic" | "content-gap" | "generic";
  keywords: string[];
  dbId?: string;
}

interface SeedKeywordsUploadProps {
  seedFiles: SeedFile[];
  onSeedFilesChange: (files: SeedFile[]) => void;
}

function detectFileType(headers: string[]): SeedFile["type"] {
  const joined = headers.join(",").toLowerCase();
  if (joined.includes("top queries") && joined.includes("clicks") && joined.includes("impressions")) return "gsc";
  if (joined.includes("content-gap") || (joined.includes("keyword") && headers.filter(h => h.includes("/: Organic Position")).length > 1)) return "content-gap";
  if (joined.includes("keyword") && joined.includes("country") && joined.includes("current position")) return "organic";
  return "generic";
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current || row.length) {
        row.push(current.trim());
        rows.push(row);
        row = [];
        current = "";
      }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      current += ch;
    }
  }
  if (current || row.length) {
    row.push(current.trim());
    rows.push(row);
  }
  return rows;
}

function extractKeywords(rows: string[][], headers: string[], fileType: SeedFile["type"]): string[] {
  const keywords = new Set<string>();

  let keywordColIndex = -1;

  if (fileType === "gsc") {
    keywordColIndex = headers.findIndex(h => h.toLowerCase().includes("top queries"));
  } else {
    keywordColIndex = headers.findIndex(h => h.toLowerCase() === "keyword");
    if (keywordColIndex === -1) keywordColIndex = headers.findIndex(h => h.toLowerCase().includes("keyword"));
  }

  if (keywordColIndex === -1) keywordColIndex = 0;

  for (let i = 1; i < rows.length; i++) {
    const val = rows[i][keywordColIndex]?.trim();
    if (val && val.length > 1 && val.length < 200) {
      keywords.add(val.toLowerCase());
    }
  }

  return Array.from(keywords);
}

const fileTypeLabels: Record<SeedFile["type"], string> = {
  gsc: "Google Search Console",
  organic: "Organic Keywords",
  "content-gap": "Content Gap",
  generic: "Keyword List",
};

const SeedKeywordsUpload = ({ seedFiles, onSeedFilesChange }: SeedKeywordsUploadProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const rows = parseCSV(text);
          if (rows.length < 2) throw new Error("File has no data rows");

          const headers = rows[0];
          const fileType = detectFileType(headers);
          const keywords = extractKeywords(rows, headers, fileType);

          if (keywords.length === 0) throw new Error("No keywords found in file");

          const seedFile: SeedFile = {
            name: file.name,
            type: fileType,
            keywords,
          };

          onSeedFilesChange([...seedFiles, seedFile]);
          toast({
            title: `${fileTypeLabels[fileType]} loaded`,
            description: `${keywords.length} keywords from ${file.name}`,
          });
        } catch (err: any) {
          toast({
            title: "Failed to parse CSV",
            description: err.message,
            variant: "destructive",
          });
        }
      };
      reader.readAsText(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    onSeedFilesChange(seedFiles.filter((_, i) => i !== index));
  };

  const totalKeywords = seedFiles.reduce((sum, f) => sum + f.keywords.length, 0);
  const uniqueKeywords = new Set(seedFiles.flatMap((f) => f.keywords)).size;

  const toggleExpanded = (name: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleAddManualKeywords = () => {
    const keywords = manualInput
      .split(/[\n,]+/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 1 && k.length < 200);

    const unique = Array.from(new Set(keywords));
    if (unique.length === 0) {
      toast({ title: "No valid keywords found", description: "Enter keywords separated by commas or new lines.", variant: "destructive" });
      return;
    }

    const seedFile: SeedFile = {
      name: `Manual keywords (${unique.length})`,
      type: "generic",
      keywords: unique,
    };
    onSeedFilesChange([...seedFiles, seedFile]);
    setManualInput("");
    setShowManualInput(false);
    toast({ title: "Keywords added", description: `${unique.length} keywords added manually` });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Database className="h-3.5 w-3.5" />
          Upload Seed CSVs
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setShowManualInput(!showManualInput)}
        >
          <Type className="h-3.5 w-3.5" />
          Paste Keywords
        </Button>
        {totalKeywords > 0 && (
          <Badge variant="secondary" className="text-xs">
            {uniqueKeywords} unique seed keywords from {seedFiles.length} file{seedFiles.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {showManualInput && (
        <div className="space-y-2">
          <Textarea
            placeholder={"Paste your seed keywords here, one per line or comma-separated...\n\ne.g.:\nbest hiking boots\nhiking gear for beginners\nwaterproof hiking shoes"}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            className="min-h-[100px] text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddManualKeywords} disabled={!manualInput.trim()} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Keywords
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowManualInput(false); setManualInput(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {seedFiles.length > 0 && (
        <div className="space-y-2">
          {seedFiles.map((file, idx) => (
            <Card key={`${file.name}-${idx}`} className="border-muted">
              <Collapsible open={expandedFiles.has(file.name)} onOpenChange={() => toggleExpanded(file.name)}>
                <div className="flex items-center justify-between px-3 py-2">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm flex-1 text-left">
                    {expandedFiles.has(file.name) ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium truncate">{file.name}</span>
                    <Badge variant="outline" className="text-xs ml-1">
                      {fileTypeLabels[file.type]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{file.keywords.length} keywords</span>
                  </CollapsibleTrigger>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(idx)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-3 px-3">
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {file.keywords.slice(0, 50).map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                      ))}
                      {file.keywords.length > 50 && (
                        <Badge variant="outline" className="text-xs">+{file.keywords.length - 50} more</Badge>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SeedKeywordsUpload;
