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

      // ── Step 1: Upload vídeo via Zernio Presigned URL (streaming) ──
      const stats = fs.statSync(videoFilePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      const fileSize = stats.size;
      console.log(`[TikTokAdapter] Solicitando URL de upload para Zernio... (Tamanho do vídeo: ${fileSizeMB} MB)`);
      
      const filename = videoFilePath.split(/[/\\]/).pop() || 'video.mp4';
      
      const presignRes = await zernio.media.getMediaPresignedUrl({
        body: {
          filename,
          contentType: 'video/mp4'
        }
      });
      
      const uploadUrl = (presignRes.data as any)?.uploadUrl;
      const mediaUrl = (presignRes.data as any)?.publicUrl;
      
      if (!uploadUrl || !mediaUrl) {
        throw new Error(`Falha ao obter URLs de upload: ${JSON.stringify(presignRes.data)}`);
      }
      
      // ── Upload via stream para não carregar o vídeo inteiro em memória ──
      // Node fetch aceita ReadableStream como body; passamos o stream nativo do fs.
      console.log(`[TikTokAdapter] URL de upload obtida. Enviando vídeo via stream (${fileSizeMB} MB)...`);
      
      // Importar dinamicamente para suporte ao Node 18+
      const { createReadStream } = fs;
      const { Readable } = await import('stream');
      
      // Node's native fetch requer um ReadableStream web (não Node.js stream).
      // Convertemos via Readable.toWeb()
      const nodeStream = createReadStream(videoFilePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(fileSize),
        },
        body: webStream,
        // @ts-ignore — duplex necessário para streaming body no Node 18+
        duplex: 'half',
      });
      
      if (!s3Res.ok) {
        let s3ErrText = '';
        try { s3ErrText = await s3Res.text(); } catch (e) {}
        throw new Error(`Falha no upload S3: ${s3Res.status} ${s3Res.statusText} - ${s3ErrText}`);
      }

      console.log(`[TikTokAdapter] Upload OK: ${mediaUrl}`);

      // ── Step 2: Montar conteúdo (título + descrição + hashtags) ─────
      const title = metadata.title || 'COS Video';
      const description = metadata.description || '';
      const tags: string[] = metadata.tags || [];
      const hashtags = tags.map((t: string) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
      const content = [title, description, hashtags].filter(Boolean).join('\n\n');

      // ── Step 3: createPost com mediaUrls + tiktokSettings ─────────
      console.log('[TikTokAdapter] Criando post no TikTok...');

      const postRes = await zernio.posts.createPost({
        body: {
          content,
          mediaUrls: [mediaUrl],
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
      console.error('[TikTokAdapter] ❌ Erro na publicação via Zernio:');
      console.error(err);
      if (err.statusCode) console.error('   Status:', err.statusCode);
      if (err.body) console.error('   Body:', JSON.stringify(err.body));
      if (err.response) {
        console.error('   Response Status:', err.response.status);
        console.error('   Response Data:', JSON.stringify(err.response.data));
      }
      
      let errorMsg = err.message || String(err);
      
      // Prefix with statusCode if available, as 'Unknown error' hides important HTTP codes like 413
      const status = err.statusCode || (err.response && err.response.status) || err.status;
      if (status) {
        errorMsg = `[Status ${status}] ${errorMsg}`;
        if (status === 413) {
          errorMsg += ' (Vídeo excedeu o limite de tamanho da API do TikTok/Zernio)';
        }
      }

      const bodyData = err.body || (err.response && err.response.data) || err.data;
      if (bodyData) {
        try {
          errorMsg += ` | API Response: ${typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData)}`;
        } catch (e) {
          errorMsg += ` | API Response: [unstringifiable]`;
        }
      }
      
      try {
        errorMsg += ` | RAW_ERR: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`;
      } catch (e) {
        // Ignora erro de stringify
      }
      
      return { success: false, error: errorMsg };
    }
  }
}
