import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, X, Copy, FileSpreadsheet } from "lucide-react";

interface ParsedSheet {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  keywordCol: string;
  rows: Record<string, any>[];
  workbook: XLSX.WorkBook;
}

function loadFile(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const first = wb.SheetNames[0];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[first], { defval: "" });
        const headers = json.length ? Object.keys(json[0]) : [];
        const kw = headers.find((h) => h.toLowerCase() === "keyword")
          || headers.find((h) => h.toLowerCase().includes("keyword"))
          || headers.find((h) => h.toLowerCase().includes("query"))
          || headers[0]
          || "";
        resolve({
          fileName: file.name,
          sheetNames: wb.SheetNames,
          activeSheet: first,
          headers,
          keywordCol: kw,
          rows: json,
          workbook: wb,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function reparseSheet(parsed: ParsedSheet, sheetName: string): ParsedSheet {
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(parsed.workbook.Sheets[sheetName], { defval: "" });
  const headers = json.length ? Object.keys(json[0]) : [];
  const kw = headers.find((h) => h.toLowerCase() === "keyword")
    || headers.find((h) => h.toLowerCase().includes("keyword"))
    || headers.find((h) => h.toLowerCase().includes("query"))
    || headers[0]
    || "";
  return { ...parsed, activeSheet: sheetName, headers, keywordCol: kw, rows: json };
}

const norm = (v: any) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const KeywordOverlap = () => {
  const { toast } = useToast();
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);
  const [a, setA] = useState<ParsedSheet | null>(null);
  const [b, setB] = useState<ParsedSheet | null>(null);

  const handleUpload = async (file: File, side: "a" | "b") => {
    try {
      const parsed = await loadFile(file);
      (side === "a" ? setA : setB)(parsed);
    } catch (err: any) {
      toast({ title: "Failed to read file", description: err.message, variant: "destructive" });
    }
  };

  const { overlap, onlyA, onlyB, setA: keysA, setB: keysB } = useMemo(() => {
    if (!a || !b) return { overlap: [], onlyA: [], onlyB: [], setA: new Set<string>(), setB: new Set<string>() };
    const sA = new Set(a.rows.map((r) => norm(r[a.keywordCol])).filter(Boolean));
    const sB = new Set(b.rows.map((r) => norm(r[b.keywordCol])).filter(Boolean));
    const overlap: string[] = [];
    const onlyA: string[] = [];
    const onlyB: string[] = [];
    sA.forEach((k) => (sB.has(k) ? overlap : onlyA).push(k));
    sB.forEach((k) => { if (!sA.has(k)) onlyB.push(k); });
    return { overlap: overlap.sort(), onlyA: onlyA.sort(), onlyB: onlyB.sort(), setA: sA, setB: sB };
  }, [a, b]);

  const downloadCSV = (rows: string[], name: string) => {
    const csv = "keyword\n" + rows.map((r) => `"${r.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyAll = (rows: string[]) => {
    navigator.clipboard.writeText(rows.join("\n"));
    toast({ title: "Copied", description: `${rows.length} keywords copied to clipboard` });
  };

  const renderUploader = (
    side: "a" | "b",
    parsed: ParsedSheet | null,
    setParsed: (p: ParsedSheet | null) => void,
    ref: React.RefObject<HTMLInputElement>,
    label: string,
  ) => (
    <Card className="border-muted">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{label}</div>
          {parsed && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setParsed(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <input
          ref={ref}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f, side);
            if (ref.current) ref.current.value = "";
          }}
        />
        {!parsed ? (
          <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => ref.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Upload CSV / XLSX
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="truncate">{parsed.fileName}</span>
              <Badge variant="secondary" className="text-xs">{parsed.rows.length} rows</Badge>
            </div>
            {parsed.sheetNames.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">Sheet</Label>
                <Select value={parsed.activeSheet} onValueChange={(v) => setParsed(reparseSheet(parsed, v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {parsed.sheetNames.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Keyword column</Label>
              <Select value={parsed.keywordCol} onValueChange={(v) => setParsed({ ...parsed, keywordCol: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {parsed.headers.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderList = (rows: string[], emptyMsg: string, baseName: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{rows.length} keywords</Badge>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!rows.length} onClick={() => copyAll(rows)}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!rows.length} onClick={() => downloadCSV(rows, baseName)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">{emptyMsg}</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto border rounded-md divide-y">
          {rows.map((k, i) => (
            <div key={i} className="px-3 py-1.5 text-sm">{k}</div>
          ))}
        </div>
      )}
    </div>
  );

  const ready = a && b;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload two spreadsheets (CSV or XLSX) to compare keyword columns. See which keywords overlap and which are unique to each file — useful for finding gaps (e.g. keywords in your master list that you don't yet have a page for).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderUploader("a", a, setA, inputARef, "File A (e.g. master keyword list)")}
        {renderUploader("b", b, setB, inputBRef, "File B (e.g. existing pages)")}
      </div>

      {ready && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">File A: {keysA.size} unique</Badge>
              <Badge variant="outline">File B: {keysB.size} unique</Badge>
              <Badge variant="secondary">Overlap: {overlap.length}</Badge>
              <Badge variant="secondary">Only in A: {onlyA.length}</Badge>
              <Badge variant="secondary">Only in B: {onlyB.length}</Badge>
            </div>

            <Tabs defaultValue="onlyA">
              <TabsList>
                <TabsTrigger value="onlyA" className="text-xs">Only in A (gaps)</TabsTrigger>
                <TabsTrigger value="overlap" className="text-xs">Overlap</TabsTrigger>
                <TabsTrigger value="onlyB" className="text-xs">Only in B</TabsTrigger>
              </TabsList>
              <TabsContent value="onlyA">
                {renderList(onlyA, "No keywords unique to File A.", "only-in-A")}
              </TabsContent>
              <TabsContent value="overlap">
                {renderList(overlap, "No overlapping keywords.", "overlap")}
              </TabsContent>
              <TabsContent value="onlyB">
                {renderList(onlyB, "No keywords unique to File B.", "only-in-B")}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default KeywordOverlap;
