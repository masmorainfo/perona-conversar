-- Migration 020: Resize world_knowledge.embedding from vector(1536) to vector(1024)
-- Reason: NVIDIA nv-embedqa-e5-v5 produces 1024-dimensional embeddings,
--         not 1536 (which was the OpenAI text-embedding-ada-002 / text-embedding-3-small size).
--         The column change requires drop + re-add because pgvector does not support
--         ALTER COLUMN ... TYPE for vector columns.

-- Drop the HNSW index first (recreated below)
DROP INDEX IF EXISTS idx_world_knowledge_embedding;

-- Re-create the column with correct dimensions
-- Existing rows will have NULL embedding (acceptable — they'll be re-embedded on next access)
ALTER TABLE world_knowledge DROP COLUMN IF EXISTS embedding;
ALTER TABLE world_knowledge ADD COLUMN embedding vector(1024);

-- Recreate the HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_world_knowledge_embedding
  ON world_knowledge USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
