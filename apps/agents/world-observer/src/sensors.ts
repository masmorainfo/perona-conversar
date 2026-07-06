import { execSync } from 'child_process';

export interface RawSignalInput {
  sensorName: string;
  externalId: string;
  payload: any;
}

export async function fetchTrends24Signals(): Promise<RawSignalInput[]> {
  try {
    const pythonScript = 'C:/AI/perona - conversar/scrapers/trends24/t3_scraper.py';
    const pythonCwd = 'C:/AI/perona - conversar/scrapers/trends24';
    
    console.log(`[World Observer] Executing Python scraper: python ${pythonScript}`);
    // Run the python script
    const stdout = execSync('python t3_scraper.py', { cwd: pythonCwd, encoding: 'utf8', timeout: 15000 });
    
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
  // Simulates Google Trends
  return [
    {
      sensorName: 'GoogleTrends',
      externalId: 'gt-1',
      payload: {
        query: 'OpenAI Advanced Voice Mode',
        searchVolume: '500k+ searches',
        trendingReason: 'New features rolling out globally',
      },
    },
  ];
}

export async function fetchRedditSignals(): Promise<RawSignalInput[]> {
  // Simulates popular Reddit posts in technology and programming subreddits
  return [
    {
      sensorName: 'Reddit',
      externalId: 'reddit-r-programming-1',
      payload: {
        subreddit: 'r/programming',
        title: 'Show HN: Building a Content Operating System in TypeScript',
        ups: 1420,
        numComments: 310,
        permalink: '/r/programming/comments/cos_in_ts',
      },
    },
  ];
}

export async function fetchXSignals(): Promise<RawSignalInput[]> {
  // Simulates viral tweets
  return [
    {
      sensorName: 'X',
      externalId: 'x-viral-1',
      payload: {
        username: 'tech_insider',
        text: 'The future of video creation is programmatic. Node + React + Remotion replaces complex video editor suites. 🚀 #webdev #videomaking',
        likes: 3500,
        retweets: 820,
      },
    },
  ];
}

export async function fetchYouTubeSignals(): Promise<RawSignalInput[]> {
  // Simulates trending videos
  return [
    {
      sensorName: 'YouTube',
      externalId: 'yt-trending-1',
      payload: {
        channelName: 'Fireship',
        title: 'Why Everyone is Moving to Remotion for Automated Video Pipelines',
        views: 250000,
        publishedHoursAgo: 4,
      },
    },
  ];
}

export async function fetchRSSSignals(): Promise<RawSignalInput[]> {
  // Simulates RSS feed items
  return [
    {
      sensorName: 'RSS',
      externalId: 'rss-feed-1',
      payload: {
        feedName: 'TechCrunch',
        title: 'The Rise of AI Agents in Content Orchestration',
        link: 'https://techcrunch.com/rise-of-ai-agents',
        pubDate: new Date().toISOString(),
      },
    },
  ];
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
