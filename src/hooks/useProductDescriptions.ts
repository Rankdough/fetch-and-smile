import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type ProductRow = {
  id: string;
  localId: number;
  url: string;
  collection: string;
  title: string;
  productInfo: string;
  description: string;
  status: "pending" | "generating" | "done" | "error";
  selected: boolean;
};

export type BatchSummary = {
  id: string;
  file_name: string | null;
  word_count: string;
  created_at: string;
  updated_at: string;
  product_count?: number;
  done_count?: number;
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
  const [allBatches, setAllBatches] = useState<BatchSummary[]>([]);
  const abortRef = useRef(false);

  useEffect(() => {
    loadAllBatches();
  }, []);

  const loadAllBatches = async () => {
    setIsLoading(true);
    try {
      const { data: batches } = await supabase
        .from("product_description_batches")
        .select("*")
        .order("updated_at", { ascending: false });

      if (batches && batches.length > 0) {
        // Get row counts for each batch
        const batchSummaries: BatchSummary[] = [];
        for (const batch of batches) {
          const { count: totalCount } = await supabase
            .from("product_description_rows")
            .select("*", { count: "exact", head: true })
            .eq("batch_id", batch.id);

          const { count: doneCount } = await supabase
            .from("product_description_rows")
            .select("*", { count: "exact", head: true })
            .eq("batch_id", batch.id)
            .eq("status", "done");

          batchSummaries.push({
            id: batch.id,
            file_name: batch.file_name,
            word_count: batch.word_count || "200",
            created_at: batch.created_at,
            updated_at: batch.updated_at,
            product_count: totalCount || 0,
            done_count: doneCount || 0,
          });
        }
        setAllBatches(batchSummaries);

        // Load the most recent batch
        await loadBatch(batches[0].id);
      }
    } catch (err) {
      console.error("Failed to load batches:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBatch = async (id: string) => {
    try {
      const { data: batch } = await supabase
        .from("product_description_batches")
        .select("*")
        .eq("id", id)
        .single();

      if (!batch) return;

      setBatchId(batch.id);
      setWordCount(batch.word_count || "200");
      setFileName(batch.file_name || "");
      setCustomInstructions(batch.custom_instructions || "");

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
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.error("Failed to load batch:", err);
    }
  };

  const saveBatch = async (
    parsedProducts: Omit<ProductRow, "id" | "selected">[],
    name: string,
    wc: string
  ): Promise<string | null> => {
    try {
      const { data: batch, error: batchErr } = await supabase
        .from("product_description_batches")
        .insert({ file_name: name, word_count: wc, custom_instructions: customInstructions })
        .select()
        .single();

      if (batchErr || !batch) throw batchErr;

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

      const { error: rowErr } = await supabase
        .from("product_description_rows")
        .insert(rowInserts)
        .select();

      if (rowErr) throw rowErr;

      setBatchId(batch.id);

      // Update allBatches list
      setAllBatches((prev) => [
        {
          id: batch.id,
          file_name: name,
          word_count: wc,
          created_at: batch.created_at,
          updated_at: batch.updated_at,
          product_count: parsedProducts.length,
          done_count: 0,
        },
        ...prev,
      ]);

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

  const saveCustomInstructions = useCallback(async (instructions: string) => {
    if (batchId) {
      await supabase
        .from("product_description_batches")
        .update({ custom_instructions: instructions })
        .eq("id", batchId);
    }
  }, [batchId]);

  const clearBatch = async () => {
    if (batchId) {
      await supabase.from("product_description_batches").delete().eq("id", batchId);
      setAllBatches((prev) => prev.filter((b) => b.id !== batchId));
    }
    setBatchId(null);
    setProducts([]);
    setFileName("");
    setCustomInstructions("");
  };

  const startNewJob = () => {
    setBatchId(null);
    setProducts([]);
    setFileName("");
    setCustomInstructions("");
    setWordCount("200");
  };

  const handleGenerate = async () => {
    const selected = products.filter((p) => p.selected && p.status !== "done");
    if (selected.length === 0) {
      toast({ title: "No products selected", description: "Select products to generate descriptions for.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    abortRef.current = false;
    const targetWords = parseInt(wordCount) || 200;

    for (const product of selected) {
      if (abortRef.current) break;

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

        if (abortRef.current) {
          setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "pending" } : p)));
          await updateRow(product.id, { status: "pending" });
          break;
        }

        if (error) throw error;

        const desc = data.description || "";
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, description: desc, status: "done" } : p))
        );
        await updateRow(product.id, { description: desc, status: "done" });

        // Update batch summary done count
        setAllBatches((prev) =>
          prev.map((b) =>
            b.id === batchId ? { ...b, done_count: (b.done_count || 0) + 1 } : b
          )
        );
      } catch (err) {
        if (abortRef.current) break;
        console.error("Generation error for", product.title, err);
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "error" } : p)));
        await updateRow(product.id, { status: "error" });
      }
    }

    setIsGenerating(false);
    if (abortRef.current) {
      setProducts((prev) => prev.map((p) => (p.status === "generating" ? { ...p, status: "pending" } : p)));
      toast({ title: "Generation stopped", description: "Remaining products were not processed." });
    } else {
      toast({ title: "Generation complete", description: `Processed ${selected.length} products.` });
    }
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
    allBatches,
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
    startNewJob,
    loadBatch,
    handleGenerate,
    stopGeneration: () => { abortRef.current = true; },
    resetRow,
  };
};
