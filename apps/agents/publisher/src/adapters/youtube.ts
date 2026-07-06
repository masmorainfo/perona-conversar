import { PlatformAdapter } from './types.js';
import { google } from 'googleapis';
import fs from 'fs';

export class YouTubeAdapter implements PlatformAdapter {
  async upload(videoFilePath: string, metadata: any): Promise<{ success: boolean; platformUrl?: string; error?: string }> {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.log('[YouTubeAdapter] Credentials missing. Running in simulated (MOCK) mode...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return {
        success: true,
        platformUrl: `https://mock-youtube.com/watch?v=mock_${Date.now()}`,
      };
    }

    try {
      console.log('[YouTubeAdapter] Uploading video to YouTube API...');
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: metadata.title,
            description: metadata.description || 'Vídeo gerado automaticamente pelo COS.',
            tags: metadata.tags || [],
            categoryId: '28', // Tech & Science
          },
          status: {
            privacyStatus: 'unlisted',
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(videoFilePath),
        },
      });

      if (response.data.id) {
        return {
          success: true,
          platformUrl: `https://www.youtube.com/watch?v=${response.data.id}`,
        };
      } else {
        throw new Error('Upload complete but video ID is missing');
      }
    } catch (err: any) {
      console.error('[YouTubeAdapter] Error uploading:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  }
}
