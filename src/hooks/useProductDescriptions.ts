import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type ProductRow = {
  id: string; // uuid from DB
  localId: number; // row index
  url: string;
  collection: string;
  title: string;
  productInfo: string;
  description: string;
  status: "pending" | "generating" | "done" | "error";
  selected: boolean;
};

export const useProductDescriptions = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState("200");
  const [fileName, setFileName] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load the most recent batch on mount
  useEffect(() => {
    loadLatestBatch();
  }, []);

  const loadLatestBatch = async () => {
    setIsLoading(true);
    try {
      const { data: batch } = await supabase
        .from("product_description_batches")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (batch) {
        setBatchId(batch.id);
        setWordCount(batch.word_count || "200");
        setFileName(batch.file_name || "");
        setCustomInstructions((batch as any).custom_instructions || "");

        const { data: rows } = await supabase
          .from("product_description_rows")
          .select("*")
          .eq("batch_id", batch.id)
          .order("row_index", { ascending: true });

        if (rows && rows.length > 0) {
          setProducts(
            rows.map((r) => ({
              id: r.id,
              localId: r.row_index,
              url: r.url || "",
              collection: r.collection || "",
              title: r.title || "",
              productInfo: r.product_info || "",
              description: r.description || "",
              status: (r.status as ProductRow["status"]) || "pending",
              selected: false,
            }))
          );
        }
      }
    } catch (err) {
      console.error("Failed to load batch:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveBatch = async (
    parsedProducts: Omit<ProductRow, "id" | "selected">[],
    name: string,
    wc: string
  ): Promise<string | null> => {
    try {
      // Create batch
      const { data: batch, error: batchErr } = await supabase
        .from("product_description_batches")
        .insert({ file_name: name, word_count: wc, custom_instructions: customInstructions } as any)
        .select()
        .single();

      if (batchErr || !batch) throw batchErr;

      // Insert rows
      const rowInserts = parsedProducts.map((p, i) => ({
        batch_id: batch.id,
        row_index: i,
        url: p.url,
        collection: p.collection,
        title: p.title,
        product_info: p.productInfo,
        description: p.description,
        status: p.status,
      }));

      const { data: rows, error: rowErr } = await supabase
        .from("product_description_rows")
        .insert(rowInserts)
        .select();

      if (rowErr) throw rowErr;

      setBatchId(batch.id);
      return batch.id;
    } catch (err) {
      console.error("Failed to save batch:", err);
      toast({ title: "Save failed", description: "Could not save to database.", variant: "destructive" });
      return null;
    }
  };

  const updateRow = useCallback(
    async (rowId: string, updates: { description?: string; status?: string }) => {
      try {
        await supabase
          .from("product_description_rows")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", rowId);
      } catch (err) {
        console.error("Failed to update row:", err);
      }
    },
    []
  );

  // Save custom instructions to DB when they change
  const saveCustomInstructions = useCallback(async (instructions: string) => {
    if (batchId) {
      await supabase
        .from("product_description_batches")
        .update({ custom_instructions: instructions } as any)
        .eq("id", batchId);
    }
  }, [batchId]);

  const clearBatch = async () => {
    if (batchId) {
      await supabase.from("product_description_batches").delete().eq("id", batchId);
    }
    setBatchId(null);
    setProducts([]);
    setFileName("");
    setCustomInstructions("");
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
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "generating" } : p)));

      try {
        const { data, error } = await supabase.functions.invoke("generate-product-description", {
          body: {
            url: product.url,
            title: product.title,
            collection: product.collection,
            productInfo: product.productInfo,
            wordCount: targetWords,
            customInstructions,
          },
        });

        if (error) throw error;

        const desc = data.description || "";
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, description: desc, status: "done" } : p))
        );
        // Persist to DB
        await updateRow(product.id, { description: desc, status: "done" });
      } catch (err) {
        console.error("Generation error for", product.title, err);
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "error" } : p)));
        await updateRow(product.id, { status: "error" });
      }
    }

    setIsGenerating(false);
    toast({ title: "Generation complete", description: `Processed ${selected.length} products.` });
  };

  const resetRow = async (productId: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, description: "", status: "pending" } : p))
    );
    await updateRow(productId, { description: "", status: "pending" });
  };

  return {
    products,
    setProducts,
    batchId,
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
    resetRow,
  };
};
