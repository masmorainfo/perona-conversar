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

      // ── Step 1: Obter URL pública do vídeo ──────────────────────────
      // Prioridade: videoUrl já disponível no metadata (upload feito pelo Render)
      // Fallback: fazer upload do arquivo local (só funciona se o arquivo existe neste container)
      let mediaUrl: string;

      const preExistingVideoUrl = metadata.videoUrl as string | undefined;

      if (preExistingVideoUrl) {
        // URL já disponível — pula o upload, vai direto para createPost
        console.log(`[TikTokAdapter] videoUrl pré-existente encontrada no metadata. Pulando upload S3.`);
        console.log(`[TikTokAdapter] URL: ${preExistingVideoUrl}`);
        mediaUrl = preExistingVideoUrl;
      } else {
        // Fallback: tentar upload do arquivo local
        if (!fs.existsSync(videoFilePath)) {
          throw new Error(`Arquivo de vídeo não encontrado: ${videoFilePath}. Use videoUrl no metadata para evitar dependência de filesystem cross-container.`);
        }
        const stats = fs.statSync(videoFilePath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        const fileSize = stats.size;
        console.log(`[TikTokAdapter] Solicitando URL de upload para Zernio... (Tamanho do vídeo: ${fileSizeMB} MB)`);
        
        const filename = videoFilePath.split(/[/\\]/).pop() || 'video.mp4';
        
        const presignRes = await zernio.media.getMediaPresignedUrl({
          body: {
            filename,
            contentType: 'video/mp4',
            size: fileSize,
          }
        });
        
        const uploadUrl = (presignRes.data as any)?.uploadUrl;
        const publicUrl = (presignRes.data as any)?.publicUrl;
        
        if (!uploadUrl || !publicUrl) {
          throw new Error(`Falha ao obter URLs de upload: ${JSON.stringify(presignRes.data)}`);
        }
        
        // Upload via https.request nativo (garante Content-Length + pipe stream)
        console.log(`[TikTokAdapter] URL de upload obtida. Enviando vídeo via https.request (${fileSizeMB} MB)...`);
        
        const { https: httpsModule, http: httpModule } = await (async () => {
          const https = await import('https');
          const http = await import('http');
          return { https, http };
        })();
        
        await new Promise<void>((resolve, reject) => {
          const parsedUrl = new URL(uploadUrl);
          const isHttps = parsedUrl.protocol === 'https:';
          const reqModule = isHttps ? httpsModule : httpModule;
          
          const req = (reqModule as typeof httpsModule).request(
            {
              hostname: parsedUrl.hostname,
              port: parsedUrl.port || (isHttps ? 443 : 80),
              path: parsedUrl.pathname + parsedUrl.search,
              method: 'PUT',
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': fileSize,
              },
            },
            (res) => {
              res.resume();
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
              } else {
                reject(new Error(`Falha no upload S3: ${res.statusCode} ${res.statusMessage}`));
              }
            }
          );
          
          req.on('error', (err) => reject(new Error(`Erro de rede no upload S3: ${err.message}`)));
          
          const readStream = fs.createReadStream(videoFilePath);
          readStream.on('error', (err) => reject(new Error(`Erro ao ler arquivo: ${err.message}`)));
          readStream.pipe(req);
        });

        console.log(`[TikTokAdapter] Upload S3 OK: ${publicUrl}`);
        mediaUrl = publicUrl;
      }

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
          mediaItems: [
            {
              type: 'video',
              url: mediaUrl,
            },
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
        ? `https://tiktok.com/@${tiktokUsername}?zernio_post_id=${postId}`
        : `https://tiktok.com/video/${postId}?zernio_post_id=${postId}`;

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
