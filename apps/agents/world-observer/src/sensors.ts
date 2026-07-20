import { execFileSync } from 'child_process';
import path from 'path';

export interface RawSignalInput {
  sensorName: string;
  externalId: string;
  payload: any;
}

export async function fetchTrends24Signals(): Promise<RawSignalInput[]> {
  try {
    const pythonCwd = path.join(process.cwd(), 'scrapers', 'trends24');
    const pythonScript = path.join(pythonCwd, 't3_scraper.py');
    
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    console.log(`[World Observer] Executing Python scraper: ${pythonCmd} ${pythonScript}`);
    // Run the python script avoiding shell ENOENT
    const stdout = execFileSync(pythonCmd, ['t3_scraper.py'], { cwd: pythonCwd, encoding: 'utf8', timeout: 15000 });
    
    // Find the JSON block
    const startIdx = stdout.indexOf('JSON_START');
    const endIdx = stdout.indexOf('JSON_END');
    
    if (startIdx === -1 || endIdx === -1) {
      throw new Error('JSON markers not found in scraper output');
    }
    
    const jsonStr = stdout.substring(startIdx + 10, endIdx).trim();
    const trendingTopics = JSON.parse(jsonStr) as Array<{
      rank: string;
      topic: string;
      position: string;
      count: string | null;
      duration: string | null;
    }>;
    
    const signals: RawSignalInput[] = [];
    let position = 1;
    for (const trend of trendingTopics) {
      signals.push({
        sensorName: 'Trends24',
        externalId: `trend24-${Date.now()}-${position}`,
        payload: {
          topic: trend.topic,
          url: `https://twitter.com/search?q=${encodeURIComponent(trend.topic)}`,
          position: parseInt(trend.position || '1', 10),
          category: 'X Trending',
          volume: trend.count || null,
        }
      });
      position++;
    }
    console.log(`[World Observer] Real Trends24 signals scraped via Python: ${signals.length}`);
    return signals;
  } catch (error) {
    console.error('[World Observer] Error running Python scraper:', error);
    return [];
  }
}

export async function fetchGoogleTrendsSignals(): Promise<RawSignalInput[]> {
  return [];
}

export async function fetchRedditSignals(): Promise<RawSignalInput[]> {
  return [];
}

export async function fetchXSignals(): Promise<RawSignalInput[]> {
  return [];
}

export async function fetchYouTubeSignals(): Promise<RawSignalInput[]> {
  return [];
}

export async function fetchRSSSignals(): Promise<RawSignalInput[]> {
  return [];
}

export async function fetchAllSignals(): Promise<RawSignalInput[]> {
  const all = await Promise.all([
    fetchTrends24Signals(),
    fetchGoogleTrendsSignals(),
    fetchRedditSignals(),
    fetchXSignals(),
    fetchYouTubeSignals(),
    fetchRSSSignals(),
  ]);
  return all.flat();
}
