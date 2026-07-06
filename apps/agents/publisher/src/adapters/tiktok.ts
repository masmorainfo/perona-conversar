import { PlatformAdapter } from './types.js';
import fs from 'fs';

/**
 * TikTokAdapter — Publicação real via Zernio API
 * 
 * Payload validado na Missão 1 (Primeiro Voo do COS).
 * 
 * Fluxo:
 *   1. messages.uploadMediaDirect(file) → URL pública
 *   2. posts.createPost com mediaItems + tiktokSettings
 * 
 * Campos obrigatórios do TikTok (requisito legal):
 *   - privacy_level, allow_comment, allow_duet, allow_stitch
 *   - content_preview_confirmed, express_consent_given
 * 
 * Ref: https://docs.zernio.com (TikTok section)
 * 
 * Fallback: Quando ZERNIO_API_KEY não está definida, roda em modo MOCK.
 */
export class TikTokAdapter implements PlatformAdapter {
  async upload(
    videoFilePath: string,
    metadata: any,
  ): Promise<{ success: boolean; platformUrl?: string; error?: string }> {
    const apiKey = process.env.ZERNIO_API_KEY;
    const tiktokAccountId = process.env.ZERNIO_TIKTOK_ACCOUNT_ID;

    if (!apiKey || !tiktokAccountId) {
      console.log('[TikTokAdapter] Credenciais Zernio ausentes. Rodando em modo MOCK...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return {
        success: true,
        platformUrl: `https://mock-tiktok.com/video/mock_${Date.now()}`,
      };
    }

    try {
      const { Zernio } = await import('@zernio/node');
      const zernio = new Zernio({ apiKey });

      // ── Step 1: Upload vídeo via messages.uploadMediaDirect ─────────
      console.log('[TikTokAdapter] Upload do vídeo via Zernio...');
      const videoBuffer = fs.readFileSync(videoFilePath);
      const blob = new Blob([videoBuffer], { type: 'video/mp4' });

      const uploadRes = await zernio.messages.uploadMediaDirect({
        body: {
          file: blob,
          contentType: 'video/mp4',
        },
      });

      const mediaUrl = (uploadRes.data as any)?.url;
      if (!mediaUrl) {
        throw new Error(`Upload retornou sem URL: ${JSON.stringify(uploadRes.data)}`);
      }
      console.log(`[TikTokAdapter] Upload OK: ${mediaUrl}`);

      // ── Step 2: Montar conteúdo (título + descrição + hashtags) ─────
      const title = metadata.title || 'COS Video';
      const description = metadata.description || '';
      const tags: string[] = metadata.tags || [];
      const hashtags = tags.map((t: string) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
      const content = [title, description, hashtags].filter(Boolean).join('\n\n');

      // ── Step 3: createPost com mediaItems + tiktokSettings ─────────
      console.log('[TikTokAdapter] Criando post no TikTok...');

      const postRes = await zernio.posts.createPost({
        body: {
          content,
          mediaItems: [
            { type: 'video', url: mediaUrl },
          ],
          platforms: [
            { platform: 'tiktok' as any, accountId: tiktokAccountId },
          ],
          tiktokSettings: {
            privacy_level: 'PUBLIC_TO_EVERYONE',
            allow_comment: true,
            allow_duet: true,
            allow_stitch: true,
            content_preview_confirmed: true,
            express_consent_given: true,
          },
          publishNow: true,
        },
      });

      // ── Extrair informações do post criado ──────────────────────────
      const postData = postRes.data as any;
      const postId = postData?.post?._id || postData?._id || 'unknown';
      const tiktokUsername = postData?.post?.platforms?.[0]?.platformSpecificData?.tiktokUsername;
      const platformUrl = tiktokUsername
        ? `https://tiktok.com/@${tiktokUsername}`
        : `https://tiktok.com/video/${postId}`;

      console.log(`[TikTokAdapter] ✅ Publicação concluída (postId: ${postId})`);

      return { success: true, platformUrl };
    } catch (err: any) {
      console.error('[TikTokAdapter] ❌ Erro na publicação via Zernio:', err.message);
      if (err.statusCode) console.error('   Status:', err.statusCode);
      if (err.body) console.error('   Body:', JSON.stringify(err.body));
      return { success: false, error: err.message };
    }
  }
}
