import type { Pool } from 'pg';
import type { WorldKnowledgeStore } from '../interfaces.js';

export class WorldKnowledgePgStore implements WorldKnowledgeStore {
  constructor(private pool: Pool) {}

  async upsertEntity(params: {
    entityType: string;
    entityName: string;
    facts: Record<string, any>;
    sources: any[];
    embedding?: number[];
    expiresAt?: Date;
  }): Promise<void> {
    const query = `
      INSERT INTO world_knowledge (entity_type, entity_name, facts, sources, embedding, expires_at, last_verified_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (entity_type, entity_name) DO UPDATE SET
        facts = EXCLUDED.facts,
        sources = EXCLUDED.sources,
        embedding = COALESCE(EXCLUDED.embedding, world_knowledge.embedding),
        expires_at = EXCLUDED.expires_at,
        last_verified_at = NOW()
    `;
    const values = [
      params.entityType,
      params.entityName,
      JSON.stringify(params.facts),
      JSON.stringify(params.sources),
      params.embedding ? JSON.stringify(params.embedding) : null,
      params.expiresAt || null,
    ];
    await this.pool.query(query, values);
  }

  async searchSimilar(embedding: number[], threshold: number, limit: number = 10): Promise<Array<{
    id: string;
    entityType: string;
    entityName: string;
    facts: Record<string, any>;
    sources: any[];
    similarity: number;
    lastVerifiedAt: Date;
  }>> {
    // 1 - (embedding <=> query_embedding) as similarity for cosine similarity
    const query = `
      SELECT id, entity_type, entity_name, facts, sources, last_verified_at,
             1 - (embedding <=> $1::vector) AS similarity
      FROM world_knowledge
      WHERE 1 - (embedding <=> $1::vector) >= $2
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $3
    `;
    const values = [JSON.stringify(embedding), threshold, limit];
    const { rows } = await this.pool.query(query, values);

    return rows.map(row => ({
      id: row.id,
      entityType: row.entity_type,
      entityName: row.entity_name,
      facts: row.facts,
      sources: row.sources,
      similarity: row.similarity,
      lastVerifiedAt: row.last_verified_at,
    }));
  }

  async getEntity(entityType: string, entityName: string): Promise<{
    id: string;
    facts: Record<string, any>;
    sources: any[];
    lastVerifiedAt: Date;
  } | null> {
    const query = `
      SELECT id, facts, sources, last_verified_at
      FROM world_knowledge
      WHERE entity_type = $1 AND entity_name = $2
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const { rows } = await this.pool.query(query, [entityType, entityName]);
    if (rows.length === 0) return null;

    return {
      id: rows[0].id,
      facts: rows[0].facts,
      sources: rows[0].sources,
      lastVerifiedAt: rows[0].last_verified_at,
    };
  }
}
