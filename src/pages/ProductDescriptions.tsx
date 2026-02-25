import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Upload, Download, Loader2, CheckCircle2, XCircle, ArrowLeft, FileSpreadsheet, Trash2, StopCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProductDescriptions, ProductRow } from "@/hooks/useProductDescriptions";
import InstructionPresetsDropdown from "@/components/InstructionPresetsDropdown";
import { GenerationChecklist } from "@/components/GenerationChecklist";

const parseCSV = (text: string): Omit<ProductRow, "id" | "selected">[] => {
  const records: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        current.push(field.trim());
        field = "";
      } else if (char === "\n" || (char === "\r" && next === "\n")) {
        current.push(field.trim());
        field = "";
        if (current.some((c) => c)) records.push(current);
        current = [];
        if (char === "\r") i++;
      } else {
        field += char;
      }
    }
  }
  current.push(field.trim());
  if (current.some((c) => c)) records.push(current);

  if (records.length < 2) return [];

  const header = records[0].map((h) => h.toLowerCase());
  const urlIdx = header.findIndex((h) => h === "url" || h === "link");
  const collectionIdx = header.findIndex((h) => h.includes("collection") || h.includes("category"));
  const titleIdx = header.findIndex((h) => h === "title" || h === "name");
  const infoIdx = header.findIndex((h) => h.includes("product description data") || h.includes("info") || h.includes("detail") || h.includes("material"));

  return records.slice(1).map((cols, i) => ({
    localId: i,
    url: urlIdx >= 0 ? cols[urlIdx] || "" : "",
    collection: collectionIdx >= 0 ? cols[collectionIdx] || "" : "",
    title: titleIdx >= 0 ? cols[titleIdx] || "" : cols[0] || "",
    productInfo: infoIdx >= 0 ? cols[infoIdx] || "" : "",
    description: "",
    status: "pending" as const,
  })).filter((r) => r.title || r.url);
};

const ProductDescriptions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    products,
    setProducts,
    wordCount,
    setWordCount,
    fileName,
    setFileName,
    customInstructions,
    setCustomInstructions,
    saveCustomInstructions,
    isGenerating,
    isLoading,
    saveBatch,
    clearBatch,
    handleGenerate,
    stopGeneration,
    resetRow,
  } = useProductDescriptions();

  const selectedCount = products.filter((p) => p.selected).length;
  const doneCount = products.filter((p) => p.status === "done").length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name;
    setFileName(name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast({ title: "No data found", description: "Could not parse any product rows from the CSV.", variant: "destructive" });
        return;
      }
      // Save to DB
      const newBatchId = await saveBatch(parsed, name, wordCount);
      if (!newBatchId) return;

      // Reload from DB to get proper UUIDs
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: rows } = await supabase
        .from("product_description_rows")
        .select("*")
        .eq("batch_id", newBatchId)
        .order("row_index", { ascending: true });

      if (rows) {
        setProducts(
          rows.map((r: any) => ({
            id: r.id,
            localId: r.row_index,
            url: r.url || "",
            collection: r.collection || "",
            title: r.title || "",
            productInfo: r.product_info || "",
            description: r.description || "",
            status: r.status as ProductRow["status"],
            selected: false,
          }))
        );
      }
      toast({ title: "CSV loaded & saved", description: `Found ${parsed.length} products.` });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const toggleAll = (checked: boolean) => {
    setProducts((prev) => prev.map((p) => ({ ...p, selected: checked })));
  };

  const toggleRow = (id: string) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  };

  const handleDownload = () => {
    const csvHeader = "URL,Collection,Title,Product Info,Generated Description";
    const csvRows = products.map((p) => {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [escape(p.url), escape(p.collection), escape(p.title), escape(p.productInfo), escape(p.description)].join(",");
    });
    const csvContent = [csvHeader, ...csvRows].join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-descriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              SEO Content Generator
            </Button>
            <Button variant="default" size="sm" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Product Descriptions
            </Button>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-[1400px]">
        {/* Settings Bar */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Upload CSV</Label>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />
                  {fileName || "Choose CSV file"}
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Words per description</Label>
                <Select value={wordCount} onValueChange={setWordCount}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">~50 words</SelectItem>
                    <SelectItem value="75">~75 words</SelectItem>
                    <SelectItem value="100">~100 words</SelectItem>
                    <SelectItem value="150">~150 words</SelectItem>
                    <SelectItem value="200">~200 words</SelectItem>
                    <SelectItem value="250">~250 words</SelectItem>
                    <SelectItem value="300">~300 words</SelectItem>
                    <SelectItem value="400">~400 words</SelectItem>
                    <SelectItem value="500">~500 words</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Custom Instructions (applied to all descriptions)</Label>
                  <InstructionPresetsDropdown
                    currentInstructions={customInstructions}
                    onLoad={(instructions) => {
                      setCustomInstructions(instructions);
                      saveCustomInstructions(instructions);
                    }}
                  />
                </div>
                <Textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  onBlur={() => saveCustomInstructions(customInstructions)}
                  placeholder="e.g. Full team orders available, no minimums, 20 business-day guarantee, price match guarantee..."
                  className="min-h-[60px] text-sm"
                />
              </div>

              <div className="flex items-end gap-4 ml-auto">
                <GenerationChecklist
                  items={[
                    {
                      id: "products-selected",
                      label: "Select products to generate",
                      completed: selectedCount > 0,
                      required: true,
                    },
                    {
                      id: "word-count",
                      label: `Word count set (${wordCount} words)`,
                      completed: !!wordCount && wordCount !== "",
                      required: true,
                    },
                    {
                      id: "custom-instructions",
                      label: "Custom instructions provided",
                      completed: customInstructions.trim().length > 0,
                      required: true,
                    },
                  ]}
                />
                <div className="flex gap-2">
                  {isGenerating ? (
                    <Button onClick={stopGeneration} variant="destructive" className="gap-2">
                      <StopCircle className="h-4 w-4" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      onClick={handleGenerate}
                      disabled={selectedCount === 0 || !customInstructions.trim()}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate ({selectedCount})
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleDownload} disabled={doneCount === 0} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download CSV
                  </Button>
                  {products.length > 0 && (
                    <Button variant="ghost" size="icon" onClick={clearBatch}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {products.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Upload a CSV spreadsheet</h3>
              <p className="text-muted-foreground max-w-md mb-1">
                Your CSV should have columns for: <strong>URL</strong>, <strong>Collection</strong> (category), <strong>Title</strong>, and optionally <strong>Product Info</strong>
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Column headers are matched flexibly — "name" works for title, "category" works for collection, etc.
              </p>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                Upload CSV
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {products.length} products {doneCount > 0 && <Badge variant="secondary" className="ml-2">{doneCount} done</Badge>}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[calc(100vh-300px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 sticky top-0 bg-card z-10">
                      <Checkbox
                        checked={products.length > 0 && products.every((p) => p.selected)}
                        onCheckedChange={(checked) => toggleAll(!!checked)}
                      />
                    </TableHead>
                    <TableHead className="w-[200px] sticky top-0 bg-card z-10">Title</TableHead>
                    <TableHead className="w-[100px] sticky top-0 bg-card z-10">Collection</TableHead>
                    <TableHead className="w-[200px] sticky top-0 bg-card z-10">Product Info</TableHead>
                    <TableHead className="w-[160px] sticky top-0 bg-card z-10">URL</TableHead>
                    <TableHead className="w-[70px] sticky top-0 bg-card z-10">Status</TableHead>
                    <TableHead className="w-[300px] sticky top-0 bg-card z-10">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id} className={product.selected ? "bg-primary/5" : ""}>
                      <TableCell className="align-top">
                        <Checkbox checked={product.selected} onCheckedChange={() => toggleRow(product.id)} />
                      </TableCell>
                      <TableCell className="align-top font-medium text-sm truncate max-w-[200px]">{product.title}</TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">{product.collection}</TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground max-w-[200px]">
                        <p className="line-clamp-3">{product.productInfo || "—"}</p>
                      </TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground truncate max-w-[160px]">
                        {product.url && (
                          <a href={product.url.startsWith("http") ? product.url : `https://${product.url}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                            {product.url.replace(/https?:\/\//, "").substring(0, 35)}…
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {product.status === "pending" && <Badge variant="outline" className="text-xs">Pending</Badge>}
                        {product.status === "generating" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        {product.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {product.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                      </TableCell>
                      <TableCell className="align-top text-sm leading-relaxed min-w-[400px]">
                        {product.description ? (
                          <div className="flex gap-2">
                            <p className="whitespace-pre-wrap flex-1">{product.description}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-6 w-6 mt-0.5"
                              onClick={() => resetRow(product.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ProductDescriptions;
