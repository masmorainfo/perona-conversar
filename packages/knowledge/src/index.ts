import type { Pool } from 'pg';
import { ChannelMemoryPgStore } from './postgres/ChannelMemoryPgStore.js';
import { WorldKnowledgePgStore } from './postgres/WorldKnowledgePgStore.js';
import { PerformanceIndexPgStore } from './postgres/PerformanceIndexPgStore.js';

export * from './interfaces.js';
export { ChannelMemoryPgStore } from './postgres/ChannelMemoryPgStore.js';
export { WorldKnowledgePgStore } from './postgres/WorldKnowledgePgStore.js';
export { PerformanceIndexPgStore } from './postgres/PerformanceIndexPgStore.js';

export function createKnowledgeStores(pool: Pool) {
  return {
    channelMemory: new ChannelMemoryPgStore(pool),
    worldKnowledge: new WorldKnowledgePgStore(pool),
    performanceIndex: new PerformanceIndexPgStore(pool),
  };
}
