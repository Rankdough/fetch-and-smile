// Shared helper: chunk a document into overlapping word windows,
// embed each chunk via Lovable AI (google/gemini-embedding-001 at 1536 dims
// to match the brain_chunks.embedding column / pgvector HNSW index),
// and insert into brain_chunks.
//
// Source can be either a brain_files row or a context_documents row.

const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 1536;
const CHUNK_WORDS = 600;
const OVERLAP_WORDS = 100;

export interface ChunkSource {
  brain_file_id?: string;
  context_document_id?: string;
}

export function chunkText(text: string, size = CHUNK_WORDS, overlap = OVERLAP_WORDS): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const step = Math.max(1, size - overlap);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + size);
    if (slice.length === 0) break;
    out.push(slice.join(" "));
    if (i + size >= words.length) break;
  }
  return out;
}

export async function embedOne(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: text,
      dimensions: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Embedding response missing data[0].embedding");
  return vec as number[];
}

// deno-lint-ignore no-explicit-any
export async function chunkAndEmbed(
  supabase: any,
  source: ChunkSource,
  content: string,
  apiKey: string,
): Promise<{ inserted: number; chunks: number }> {
  const chunks = chunkText(content);
  if (chunks.length === 0) return { inserted: 0, chunks: 0 };

  // Wipe previous chunks for this source so reprocessing is idempotent.
  if (source.brain_file_id) {
    await supabase.from("brain_chunks").delete().eq("brain_file_id", source.brain_file_id);
  }
  if (source.context_document_id) {
    await supabase.from("brain_chunks").delete().eq("context_document_id", source.context_document_id);
  }

  let inserted = 0;
  // Sequential to stay well under rate limits for large docs; small batches OK.
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    let embedding: number[];
    try {
      embedding = await embedOne(text, apiKey);
    } catch (e) {
      console.warn(`embed chunk ${i} failed:`, e);
      continue;
    }
    const row = {
      brain_file_id: source.brain_file_id ?? null,
      context_document_id: source.context_document_id ?? null,
      content: text,
      chunk_index: i,
      embedding: embedding as unknown as string, // supabase-js stringifies via pgvector serializer
    };
    const { error } = await supabase.from("brain_chunks").insert(row);
    if (error) {
      console.warn(`insert chunk ${i} failed:`, error.message);
      continue;
    }
    inserted++;
  }
  return { inserted, chunks: chunks.length };
}
