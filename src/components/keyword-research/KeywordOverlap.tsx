import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, X, Copy, FileSpreadsheet } from "lucide-react";

interface LoadedFile {
  fileName: string;
  workbook: XLSX.WorkBook;
  sheetNames: string[];
}

interface SidePick {
  sheet: string;
  headers: string[];
  keywordCol: string;
  rows: Record<string, any>[];
}

function loadFile(file: File): Promise<LoadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        resolve({ fileName: file.name, workbook: wb, sheetNames: wb.SheetNames });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function pickFromSheet(wb: XLSX.WorkBook, sheet: string): SidePick {
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheet], { defval: "" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const kw = headers.find((h) => h.toLowerCase() === "keyword")
    || headers.find((h) => h.toLowerCase().includes("keyword"))
    || headers.find((h) => h.toLowerCase().includes("query"))
    || headers[0]
    || "";
  return { sheet, headers, keywordCol: kw, rows };
}

const norm = (v: any) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

type Mode = "two-files" | "one-file";

const KeywordOverlap = () => {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("two-files");

  // Two-files mode state
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);
  const [fileA, setFileA] = useState<LoadedFile | null>(null);
  const [fileB, setFileB] = useState<LoadedFile | null>(null);
  const [pickA, setPickA] = useState<SidePick | null>(null);
  const [pickB, setPickB] = useState<SidePick | null>(null);

  // One-file mode state
  const inputOneRef = useRef<HTMLInputElement>(null);
  const [fileOne, setFileOne] = useState<LoadedFile | null>(null);
  const [pickOneA, setPickOneA] = useState<SidePick | null>(null);
  const [pickOneB, setPickOneB] = useState<SidePick | null>(null);

  const handleUploadTwo = async (file: File, side: "a" | "b") => {
    try {
      const lf = await loadFile(file);
      const first = lf.sheetNames[0];
      const pick = pickFromSheet(lf.workbook, first);
      if (side === "a") { setFileA(lf); setPickA(pick); }
      else { setFileB(lf); setPickB(pick); }
    } catch (err: any) {
      toast({ title: "Failed to read file", description: err.message, variant: "destructive" });
    }
  };

  const handleUploadOne = async (file: File) => {
    try {
      const lf = await loadFile(file);
      if (lf.sheetNames.length < 2) {
        toast({ title: "Only one sheet found", description: "This file has a single sheet. Use Two files mode or upload a multi-sheet workbook.", variant: "destructive" });
        return;
      }
      setFileOne(lf);
      setPickOneA(pickFromSheet(lf.workbook, lf.sheetNames[0]));
      setPickOneB(pickFromSheet(lf.workbook, lf.sheetNames[1]));
    } catch (err: any) {
      toast({ title: "Failed to read file", description: err.message, variant: "destructive" });
    }
  };

  const a = mode === "two-files" ? pickA : pickOneA;
  const b = mode === "two-files" ? pickB : pickOneB;

  const { overlap, onlyA, onlyB, sizeA, sizeB } = useMemo(() => {
    if (!a || !b) return { overlap: [] as string[], onlyA: [] as string[], onlyB: [] as string[], sizeA: 0, sizeB: 0 };
    const sA = new Set(a.rows.map((r) => norm(r[a.keywordCol])).filter(Boolean));
    const sB = new Set(b.rows.map((r) => norm(r[b.keywordCol])).filter(Boolean));
    const overlap: string[] = [];
    const onlyA: string[] = [];
    const onlyB: string[] = [];
    sA.forEach((k) => (sB.has(k) ? overlap : onlyA).push(k));
    sB.forEach((k) => { if (!sA.has(k)) onlyB.push(k); });
    return { overlap: overlap.sort(), onlyA: onlyA.sort(), onlyB: onlyB.sort(), sizeA: sA.size, sizeB: sB.size };
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

  // ---------- Renderers ----------

  const renderFileUploader = (
    side: "a" | "b",
    lf: LoadedFile | null,
    pick: SidePick | null,
    setLf: (v: LoadedFile | null) => void,
    setPick: (v: SidePick | null) => void,
    ref: React.RefObject<HTMLInputElement>,
    label: string,
  ) => (
    <Card className="border-muted">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{label}</div>
          {lf && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setLf(null); setPick(null); }}>
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
            if (f) handleUploadTwo(f, side);
            if (ref.current) ref.current.value = "";
          }}
        />
        {!lf || !pick ? (
          <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => ref.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Upload CSV / XLSX
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="truncate">{lf.fileName}</span>
              <Badge variant="secondary" className="text-xs">{pick.rows.length} rows</Badge>
            </div>
            {lf.sheetNames.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">Sheet</Label>
                <Select value={pick.sheet} onValueChange={(v) => setPick(pickFromSheet(lf.workbook, v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {lf.sheetNames.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Keyword column</Label>
              <Select value={pick.keywordCol} onValueChange={(v) => setPick({ ...pick, keywordCol: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pick.headers.map((h) => (
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

  const renderSideFromOneFile = (
    label: string,
    lf: LoadedFile,
    pick: SidePick,
    setPick: (v: SidePick) => void,
  ) => (
    <Card className="border-muted">
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-semibold">{label}</div>
        <div className="space-y-1">
          <Label className="text-xs">Sheet (tab)</Label>
          <Select value={pick.sheet} onValueChange={(v) => setPick(pickFromSheet(lf.workbook, v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {lf.sheetNames.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Keyword column</Label>
          <Select value={pick.keywordCol} onValueChange={(v) => setPick({ ...pick, keywordCol: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {pick.headers.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">{pick.rows.length} rows</div>
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

  const ready = !!(a && b);
  const labelA = mode === "one-file" ? `Side A · ${pickOneA?.sheet ?? ""}` : "File A";
  const labelB = mode === "one-file" ? `Side B · ${pickOneB?.sheet ?? ""}` : "File B";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Compare keyword columns between two spreadsheets, or between two tabs of the same spreadsheet. See overlap and keywords unique to each side — useful for finding gaps (e.g. master list keywords you don't yet have a page for).
      </p>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="two-files" className="text-xs">Two files</TabsTrigger>
          <TabsTrigger value="one-file" className="text-xs">Two tabs (same file)</TabsTrigger>
        </TabsList>

        <TabsContent value="two-files" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderFileUploader("a", fileA, pickA, setFileA, setPickA, inputARef, "File A (e.g. master keyword list)")}
            {renderFileUploader("b", fileB, pickB, setFileB, setPickB, inputBRef, "File B (e.g. existing pages)")}
          </div>
        </TabsContent>

        <TabsContent value="one-file" className="mt-3 space-y-3">
          <Card className="border-muted">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Spreadsheet</div>
                {fileOne && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setFileOne(null); setPickOneA(null); setPickOneB(null); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <input
                ref={inputOneRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadOne(f);
                  if (inputOneRef.current) inputOneRef.current.value = "";
                }}
              />
              {!fileOne ? (
                <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => inputOneRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Upload XLSX (multi-sheet)
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="truncate">{fileOne.fileName}</span>
                  <Badge variant="secondary" className="text-xs">{fileOne.sheetNames.length} sheets</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {fileOne && pickOneA && pickOneB && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {renderSideFromOneFile("Side A", fileOne, pickOneA, setPickOneA)}
              {renderSideFromOneFile("Side B", fileOne, pickOneB, setPickOneB)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {ready && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{labelA}: {sizeA} unique</Badge>
              <Badge variant="outline">{labelB}: {sizeB} unique</Badge>
              <Badge variant="secondary">Overlap: {overlap.length}</Badge>
              <Badge variant="secondary">Only in A: {onlyA.length}</Badge>
              <Badge variant="secondary">Only in B: {onlyB.length}</Badge>
            </div>

            <Tabs defaultValue="onlyA">
              <TabsList>
                <TabsTrigger value="onlyA" className="text-xs">Only in A</TabsTrigger>
                <TabsTrigger value="overlap" className="text-xs">Overlap</TabsTrigger>
                <TabsTrigger value="onlyB" className="text-xs">Only in B</TabsTrigger>
              </TabsList>
              <TabsContent value="onlyA">
                {renderList(onlyA, "No keywords unique to Side A.", "only-in-A")}
              </TabsContent>
              <TabsContent value="overlap">
                {renderList(overlap, "No overlapping keywords.", "overlap")}
              </TabsContent>
              <TabsContent value="onlyB">
                {renderList(onlyB, "No keywords unique to Side B.", "only-in-B")}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default KeywordOverlap;
