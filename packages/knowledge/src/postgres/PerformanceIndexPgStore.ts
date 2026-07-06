import type { Pool } from 'pg';
import type { PerformanceIndexStore, SignalTier } from '../interfaces.js';

export class PerformanceIndexPgStore implements PerformanceIndexStore {
  constructor(private pool: Pool) {}

  async recordMetric(params: {
    channelId: string;
    platform: string;
    metricType: string;
    value: number;
    signalTier: SignalTier;
    contentId?: string;
  }): Promise<void> {
    const query = `
      INSERT INTO performance_index (channel_id, platform, metric_type, value, signal_tier, content_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const values = [
      params.channelId,
      params.platform,
      params.metricType,
      params.value,
      params.signalTier,
      params.contentId || null,
    ];
    await this.pool.query(query, values);
  }

  async getMetrics(params: {
    channelId: string;
    platform: string;
    metricType: string;
    timeRangeStart: Date;
    timeRangeEnd?: Date;
  }): Promise<Array<{
    id: string;
    value: number;
    signalTier: SignalTier;
    contentId: string | null;
    recordedAt: Date;
  }>> {
    const query = `
      SELECT id, value, signal_tier, content_id, recorded_at
      FROM performance_index
      WHERE channel_id = $1
        AND platform = $2
        AND metric_type = $3
        AND recorded_at >= $4
        ${params.timeRangeEnd ? 'AND recorded_at <= $5' : ''}
      ORDER BY recorded_at ASC
    `;
    
    const values: any[] = [
      params.channelId,
      params.platform,
      params.metricType,
      params.timeRangeStart,
    ];
    
    if (params.timeRangeEnd) {
      values.push(params.timeRangeEnd);
    }

    const { rows } = await this.pool.query(query, values);

    return rows.map(row => ({
      id: row.id,
      value: row.value,
      signalTier: row.signal_tier,
      contentId: row.content_id,
      recordedAt: row.recorded_at,
    }));
  }
}
