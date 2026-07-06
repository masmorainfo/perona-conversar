import type { Pool } from 'pg';
import type { ChannelMemoryStore } from '../interfaces.js';

export class ChannelMemoryPgStore implements ChannelMemoryStore {
  constructor(private pool: Pool) {}

  async saveMemory(params: {
    channelId: string;
    topic: string;
    angle?: string;
    contentId?: string;
    expiresAt?: Date;
  }): Promise<void> {
    const query = `
      INSERT INTO channel_memory (channel_id, topic, angle, content_id, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `;
    const values = [
      params.channelId,
      params.topic,
      params.angle || null,
      params.contentId || null,
      params.expiresAt || null,
    ];
    await this.pool.query(query, values);
  }

  async searchMemory(channelId: string, topicQuery: string): Promise<Array<{
    id: string;
    topic: string;
    angle: string | null;
    contentId: string | null;
    coveredAt: Date;
    expiresAt: Date | null;
  }>> {
    // We use the GIN index created on to_tsvector('portuguese', topic)
    const query = `
      SELECT id, topic, angle, content_id, covered_at, expires_at
      FROM channel_memory
      WHERE channel_id = $1
        AND to_tsvector('portuguese', topic) @@ plainto_tsquery('portuguese', $2)
      ORDER BY covered_at DESC
      LIMIT 50
    `;
    const { rows } = await this.pool.query(query, [channelId, topicQuery]);

    return rows.map(row => ({
      id: row.id,
      topic: row.topic,
      angle: row.angle,
      contentId: row.content_id,
      coveredAt: row.covered_at,
      expiresAt: row.expires_at,
    }));
  }
}
