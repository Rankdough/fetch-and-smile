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
  // Collect headers across all rows (some rows may have additional keys)
  const headerSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);
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

  const { overlapRows, onlyARows, onlyBRows, sizeA, sizeB, overlapHeaders, onlyAHeaders, onlyBHeaders } = useMemo(() => {
    const empty = {
      overlapRows: [] as Record<string, any>[],
      onlyARows: [] as Record<string, any>[],
      onlyBRows: [] as Record<string, any>[],
      sizeA: 0, sizeB: 0,
      overlapHeaders: [] as string[],
      onlyAHeaders: [] as string[],
      onlyBHeaders: [] as string[],
    };
    if (!a || !b) return empty;

    // Build keyword -> first matching row map for each side (dedup by normalized keyword)
    const mapA = new Map<string, Record<string, any>>();
    for (const r of a.rows) {
      const k = norm(r[a.keywordCol]);
      if (k && !mapA.has(k)) mapA.set(k, r);
    }
    const mapB = new Map<string, Record<string, any>>();
    for (const r of b.rows) {
      const k = norm(r[b.keywordCol]);
      if (k && !mapB.has(k)) mapB.set(k, r);
    }

    const onlyAHeaders = ["keyword", ...a.headers.filter((h) => h !== a.keywordCol)];
    const onlyBHeaders = ["keyword", ...b.headers.filter((h) => h !== b.keywordCol)];
    // Overlap: keyword + A_* cols + B_* cols
    const overlapHeaders = [
      "keyword",
      ...a.headers.filter((h) => h !== a.keywordCol).map((h) => `A_${h}`),
      ...b.headers.filter((h) => h !== b.keywordCol).map((h) => `B_${h}`),
    ];

    const onlyARows: Record<string, any>[] = [];
    const onlyBRows: Record<string, any>[] = [];
    const overlapRows: Record<string, any>[] = [];

    mapA.forEach((rowA, k) => {
      if (mapB.has(k)) {
        const rowB = mapB.get(k)!;
        const merged: Record<string, any> = { keyword: rowA[a.keywordCol] };
        a.headers.forEach((h) => { if (h !== a.keywordCol) merged[`A_${h}`] = rowA[h]; });
        b.headers.forEach((h) => { if (h !== b.keywordCol) merged[`B_${h}`] = rowB[h]; });
        overlapRows.push(merged);
      } else {
        const row: Record<string, any> = { keyword: rowA[a.keywordCol] };
        a.headers.forEach((h) => { if (h !== a.keywordCol) row[h] = rowA[h]; });
        onlyARows.push(row);
      }
    });
    mapB.forEach((rowB, k) => {
      if (!mapA.has(k)) {
        const row: Record<string, any> = { keyword: rowB[b.keywordCol] };
        b.headers.forEach((h) => { if (h !== b.keywordCol) row[h] = rowB[h]; });
        onlyBRows.push(row);
      }
    });

    const byKw = (x: Record<string, any>, y: Record<string, any>) =>
      String(x.keyword ?? "").localeCompare(String(y.keyword ?? ""));
    onlyARows.sort(byKw); onlyBRows.sort(byKw); overlapRows.sort(byKw);

    return {
      overlapRows, onlyARows, onlyBRows,
      sizeA: mapA.size, sizeB: mapB.size,
      overlapHeaders, onlyAHeaders, onlyBHeaders,
    };
  }, [a, b]);

  const csvCell = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const downloadCSV = (rows: Record<string, any>[], headers: string[], name: string) => {
    const csv = [
      headers.map(csvCell).join(","),
      ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyAll = (rows: Record<string, any>[], headers: string[]) => {
    // TSV so it pastes nicely into Sheets/Excel
    const tsv = [
      headers.join("\t"),
      ...rows.map((r) => headers.map((h) => String(r[h] ?? "").replace(/\t/g, " ").replace(/\n/g, " ")).join("\t")),
    ].join("\n");
    navigator.clipboard.writeText(tsv);
    toast({ title: "Copied", description: `${rows.length} rows copied (with all columns) — paste into Sheets/Excel` });
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
            {pick.headers.length > 1 && (
              <div className="text-[11px] text-muted-foreground">
                Carrying over {pick.headers.length} columns: {pick.headers.join(", ")}
              </div>
            )}
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
        {pick.headers.length > 1 && (
          <div className="text-[11px] text-muted-foreground">
            Carrying over {pick.headers.length} columns: {pick.headers.join(", ")}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderTable = (rows: Record<string, any>[], headers: string[], emptyMsg: string, baseName: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{rows.length} rows · {headers.length} columns</Badge>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!rows.length} onClick={() => copyAll(rows, headers)}>
            <Copy className="h-3.5 w-3.5" /> Copy (TSV)
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!rows.length} onClick={() => downloadCSV(rows, headers, baseName)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">{emptyMsg}</p>
      ) : (
        <div className="max-h-[480px] overflow-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="text-left font-semibold px-2 py-1.5 whitespace-nowrap border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30">
                  {headers.map((h) => (
                    <td key={h} className="px-2 py-1 align-top whitespace-nowrap">
                      {String(r[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
        Compare keyword columns between two spreadsheets, or between two tabs of the same spreadsheet. All original columns (volume, difficulty, category, etc.) are carried through into the results and exports.
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
              <Badge variant="secondary">Overlap: {overlapRows.length}</Badge>
              <Badge variant="secondary">Only in A: {onlyARows.length}</Badge>
              <Badge variant="secondary">Only in B: {onlyBRows.length}</Badge>
            </div>

            <Tabs defaultValue="onlyA">
              <TabsList>
                <TabsTrigger value="onlyA" className="text-xs">Only in A</TabsTrigger>
                <TabsTrigger value="overlap" className="text-xs">Overlap</TabsTrigger>
                <TabsTrigger value="onlyB" className="text-xs">Only in B</TabsTrigger>
              </TabsList>
              <TabsContent value="onlyA">
                {renderTable(onlyARows, onlyAHeaders, "No keywords unique to Side A.", "only-in-A")}
              </TabsContent>
              <TabsContent value="overlap">
                {renderTable(overlapRows, overlapHeaders, "No overlapping keywords.", "overlap")}
              </TabsContent>
              <TabsContent value="onlyB">
                {renderTable(onlyBRows, onlyBHeaders, "No keywords unique to Side B.", "only-in-B")}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default KeywordOverlap;
