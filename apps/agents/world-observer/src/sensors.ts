import { execSync } from 'child_process';
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
    
    console.log(`[World Observer] Executing Python scraper: python3 ${pythonScript}`);
    // Run the python script using python3
    const stdout = execSync(`python3 t3_scraper.py`, { cwd: pythonCwd, encoding: 'utf8', timeout: 15000 });
    
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
  // Simula Google Trends de Futebol
  return [
    {
      sensorName: 'GoogleTrends',
      externalId: 'gt-soccer-1',
      payload: {
        query: 'Zinedine Zidane 2006',
        searchVolume: '2M+ searches',
        trendingReason: 'Documentário e retrospectivas sobre a final da Copa do Mundo',
      },
    },
  ];
}

export async function fetchRedditSignals(): Promise<RawSignalInput[]> {
  // Simula posts populares do Reddit sobre histórias lendárias do futebol
  return [
    {
      sensorName: 'Reddit',
      externalId: 'reddit-r-soccer-1',
      payload: {
        subreddit: 'r/soccer',
        title: 'A solidão silenciosa de Roberto Baggio após perder o pênalti na final da Copa do Mundo de 1994',
        ups: 8420,
        numComments: 1310,
        permalink: '/r/soccer/comments/baggio_1994_silence',
      },
    },
  ];
}

export async function fetchXSignals(): Promise<RawSignalInput[]> {
  // Simula tweets virais sobre futebol
  return [
    {
      sensorName: 'X',
      externalId: 'x-soccer-viral-1',
      payload: {
        username: 'football_classics',
        text: 'Nenhum jogador na história carregou tanto o peso de um erro quanto Roberto Baggio em Pasadena. O silêncio e a dignidade trágica daquele momento ecoam para sempre na história da Copa do Mundo. ⚽🇮🇹 #futebol #baggio #kairo',
        likes: 18500,
        retweets: 4820,
      },
    },
  ];
}

export async function fetchYouTubeSignals(): Promise<RawSignalInput[]> {
  // Simula vídeos em alta sobre futebol
  return [
    {
      sensorName: 'YouTube',
      externalId: 'yt-soccer-trending-1',
      payload: {
        channelName: 'KAIRO Football',
        title: 'O exílio e o retorno de Ronaldo Fenômeno: Como o joelho destruído deu vida ao maior milagre de 2002',
        views: 890000,
        publishedHoursAgo: 2,
      },
    },
  ];
}

export async function fetchRSSSignals(): Promise<RawSignalInput[]> {
  // Simula notícias ou artigos clássicos de futebol
  return [
    {
      sensorName: 'RSS',
      externalId: 'rss-soccer-feed-1',
      payload: {
        feedName: 'El País Esportes',
        title: 'A redenção dramática de Adriano Imperador na final da Copa América de 2004 contra a Argentina',
        link: 'https://elpais.com/esportes/adriano-imperador-2004',
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
