import { PlatformAdapter } from './types.js';
import { YouTubeAdapter } from './youtube.js';
import { TikTokAdapter } from './tiktok.js';
import { InstagramAdapter } from './instagram.js';

export * from './types.js';
export * from './youtube.js';
export * from './tiktok.js';
export * from './instagram.js';

export function getPlatformAdapter(platform: string): PlatformAdapter {
  switch (platform.toLowerCase()) {
    case 'youtube':
      return new YouTubeAdapter();
    case 'tiktok':
      return new TikTokAdapter();
    case 'instagram':
      return new InstagramAdapter();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
