import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Upload, Download, Loader2, CheckCircle2, XCircle, ArrowLeft, FileSpreadsheet, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ProductRow = {
  id: number;
  url: string;
  collection: string;
  title: string;
  productInfo: string;
  description: string;
  status: "pending" | "generating" | "done" | "error";
  selected: boolean;
};

const parseCSV = (text: string): ProductRow[] => {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));

  // Find column indices - flexible matching
  const urlIdx = header.findIndex((h) => h.includes("url") || h.includes("link"));
  const collectionIdx = header.findIndex((h) => h.includes("collection") || h.includes("category") || h.includes("type"));
  const titleIdx = header.findIndex((h) => h.includes("title") || h.includes("name") || h.includes("product"));
  const infoIdx = header.findIndex((h) => h.includes("info") || h.includes("description") || h.includes("detail") || h.includes("material"));

  return lines.slice(1).map((line, i) => {
    // Simple CSV parse (handles basic quoted fields)
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    return {
      id: i,
      url: urlIdx >= 0 ? cols[urlIdx] || "" : "",
      collection: collectionIdx >= 0 ? cols[collectionIdx] || "" : "",
      title: titleIdx >= 0 ? cols[titleIdx] || "" : cols[0] || "",
      productInfo: infoIdx >= 0 ? cols[infoIdx] || "" : "",
      description: "",
      status: "pending" as const,
      selected: false,
    };
  }).filter((r) => r.title || r.url);
};

const ProductDescriptions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [wordCount, setWordCount] = useState("200");
  const [isGenerating, setIsGenerating] = useState(false);
  const [fileName, setFileName] = useState("");

  const selectedCount = products.filter((p) => p.selected).length;
  const doneCount = products.filter((p) => p.status === "done").length;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast({ title: "No data found", description: "Could not parse any product rows from the CSV.", variant: "destructive" });
        return;
      }
      setProducts(parsed);
      toast({ title: "CSV loaded", description: `Found ${parsed.length} products.` });
    };
    reader.readAsText(file);
    // Reset so same file can be re-uploaded
    e.target.value = "";
  };

  const toggleAll = (checked: boolean) => {
    setProducts((prev) => prev.map((p) => ({ ...p, selected: checked })));
  };

  const toggleRow = (id: number) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  };

  const handleGenerate = async () => {
    const selected = products.filter((p) => p.selected && p.status !== "done");
    if (selected.length === 0) {
      toast({ title: "No products selected", description: "Select products to generate descriptions for.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    const targetWords = parseInt(wordCount) || 200;

    for (const product of selected) {
      // Mark as generating
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "generating" } : p)));

      try {
        const { data, error } = await supabase.functions.invoke("generate-product-description", {
          body: {
            url: product.url,
            title: product.title,
            collection: product.collection,
            productInfo: product.productInfo,
            wordCount: targetWords,
          },
        });

        if (error) throw error;

        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, description: data.description || "", status: "done" } : p
          )
        );
      } catch (err) {
        console.error("Generation error for", product.title, err);
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "error" } : p)));
      }
    }

    setIsGenerating(false);
    toast({ title: "Generation complete", description: `Processed ${selected.length} products.` });
  };

  const handleDownload = () => {
    const csvHeader = "URL,Collection,Title,Product Info,Generated Description";
    const csvRows = products.map((p) => {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [escape(p.url), escape(p.collection), escape(p.title), escape(p.productInfo), escape(p.description)].join(",");
    });
    const csvContent = [csvHeader, ...csvRows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-descriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
              {/* Upload */}
              <div className="space-y-1.5">
                <Label className="text-xs">Upload CSV</Label>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />
                  {fileName || "Choose CSV file"}
                </Button>
              </div>

              {/* Word Count */}
              <div className="space-y-1.5">
                <Label className="text-xs">Words per description</Label>
                <Select value={wordCount} onValueChange={setWordCount}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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

              {/* Actions */}
              <div className="flex gap-2 ml-auto">
                <Button onClick={handleGenerate} disabled={isGenerating || selectedCount === 0} className="gap-2">
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate ({selectedCount})
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleDownload} disabled={doneCount === 0} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download CSV
                </Button>
                {products.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setProducts([]);
                      setFileName("");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        {products.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Upload a CSV spreadsheet</h3>
              <p className="text-muted-foreground max-w-md mb-1">
                Your CSV should have columns for: <strong>URL</strong>, <strong>Collection</strong> (category), <strong>Title</strong>, and optionally <strong>Product Info</strong> (materials, features, etc.)
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
          /* Product Table */
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {products.length} products {doneCount > 0 && <Badge variant="secondary" className="ml-2">{doneCount} done</Badge>}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[calc(100vh-320px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={products.length > 0 && products.every((p) => p.selected)}
                          onCheckedChange={(checked) => toggleAll(!!checked)}
                        />
                      </TableHead>
                      <TableHead className="min-w-[200px]">Title</TableHead>
                      <TableHead className="min-w-[120px]">Collection</TableHead>
                      <TableHead className="min-w-[180px]">URL</TableHead>
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead className="min-w-[300px]">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id} className={product.selected ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox checked={product.selected} onCheckedChange={() => toggleRow(product.id)} />
                        </TableCell>
                        <TableCell className="font-medium text-sm">{product.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{product.collection}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {product.url && (
                            <a href={product.url.startsWith("http") ? product.url : `https://${product.url}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                              {product.url.replace(/https?:\/\//, "").substring(0, 40)}...
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.status === "pending" && <Badge variant="outline" className="text-xs">Pending</Badge>}
                          {product.status === "generating" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {product.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                          {product.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                        </TableCell>
                        <TableCell className="text-xs leading-relaxed max-w-[300px]">
                          {product.description ? (
                            <ScrollArea className="max-h-24">
                              <p className="pr-2">{product.description}</p>
                            </ScrollArea>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ProductDescriptions;
