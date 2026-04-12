import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link2, Upload, Loader2, X, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LinkEntry {
  url: string;
  title: string;
}

interface InternalLinkFile {
  id: string;
  name: string;
  urls: LinkEntry[];
  created_at: string;
}

interface InternalLinkFileManagerProps {
  selectedFileId: string | null;
  onFileSelected: (fileId: string | null, urls: LinkEntry[]) => void;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

const InternalLinkFileManager = ({ selectedFileId, onFileSelected }: InternalLinkFileManagerProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<InternalLinkFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  // When files load and we have a saved selection, emit the URLs
  useEffect(() => {
    if (selectedFileId && files.length > 0) {
      const file = files.find(f => f.id === selectedFileId);
      if (file) {
        onFileSelected(file.id, file.urls as LinkEntry[]);
      }
    }
  }, [files, selectedFileId]);

  const loadFiles = async () => {
    const { data } = await supabase
      .from("internal_link_files")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setFiles(data as unknown as InternalLinkFile[]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

      const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^\uFEFF/, ""));
      const addressIdx = headers.findIndex(h => /^address$/i.test(h));
      const titleIdx = headers.findIndex(h => /^title\s*1$/i.test(h) || /^title$/i.test(h));
      const h1Idx = headers.findIndex(h => /^h1-1$/i.test(h) || /^h1$/i.test(h));
      const statusCodeIdx = headers.findIndex(h => /^status\s*code$/i.test(h));
      const indexabilityIdx = headers.findIndex(h => /^indexability$/i.test(h));

      if (addressIdx === -1) throw new Error("CSV must have an 'Address' column");

      const entries: LinkEntry[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const url = cols[addressIdx]?.trim();
        if (!url || !url.startsWith("http")) continue;

        // Filter: only indexable 200 pages
        if (statusCodeIdx !== -1) {
          const code = cols[statusCodeIdx]?.trim();
          if (code && code !== "200") continue;
        }
        if (indexabilityIdx !== -1) {
          const idx = cols[indexabilityIdx]?.trim().toLowerCase();
          if (idx && idx !== "indexable") continue;
        }

        const title = (titleIdx !== -1 ? cols[titleIdx]?.trim() : "") ||
                       (h1Idx !== -1 ? cols[h1Idx]?.trim() : "") ||
                       url;
        entries.push({ url, title });
      }

      if (entries.length === 0) throw new Error("No valid URLs found in CSV");

      const name = file.name.replace(/\.csv$/i, "");
      const { data, error } = await supabase
        .from("internal_link_files")
        .insert({ name, urls: entries as any })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Link file uploaded", description: `${entries.length} URLs from ${file.name}` });
      await loadFiles();
      
      // Auto-select the newly uploaded file
      if (data) {
        onFileSelected(data.id, entries);
        localStorage.setItem("migration-internal-link-file", data.id);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteFile = async (id: string) => {
    await supabase.from("internal_link_files").delete().eq("id", id);
    if (selectedFileId === id) {
      onFileSelected(null, []);
      localStorage.removeItem("migration-internal-link-file");
    }
    await loadFiles();
    toast({ title: "Link file removed" });
  };

  const selectedFile = files.find(f => f.id === selectedFileId);

  return (
    <div className="rounded-lg border bg-card px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Internal Links
        </Label>
        {selectedFile && (
          <Badge variant="secondary" className="text-xs">
            {(selectedFile.urls as LinkEntry[]).length} URLs
          </Badge>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleUpload}
      />

      <div className="flex gap-2">
        <Select
          value={selectedFileId || "none"}
          onValueChange={(v) => {
            const id = v === "none" ? null : v;
            const file = files.find(f => f.id === id);
            onFileSelected(id, file ? file.urls as LinkEntry[] : []);
            if (id) {
              localStorage.setItem("migration-internal-link-file", id);
            } else {
              localStorage.removeItem("migration-internal-link-file");
            }
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="No link file" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No internal links</SelectItem>
            {files.map(f => (
              <SelectItem key={f.id} value={f.id}>
                {f.name} ({(f.urls as LinkEntry[]).length} URLs)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          title="Upload CSV"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
      </div>

      {selectedFile && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {selectedFile.name}
          </span>
          <button
            onClick={() => deleteFile(selectedFile.id)}
            className="text-destructive hover:underline text-xs"
          >
            Remove
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Upload a Screaming Frog CSV. AI will use as many relevant internal links as fit naturally, with links distributed across the article.
      </p>
    </div>
  );
};

export type { LinkEntry, InternalLinkFile };
export default InternalLinkFileManager;
