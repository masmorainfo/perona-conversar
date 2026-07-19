import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { execSync } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CanonArchetype, RenderManifest } from '@cos/types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const execAsync = promisify(exec);

function getAudioDuration(audioPath: string): number {
  try {
    const stats = fs.statSync(audioPath);
    if (stats.size <= 10) {
      return 5;
    }
    const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
    const output = execSync(command, { encoding: 'utf-8' }).trim();
    const durationSeconds = parseFloat(output);
    if (isNaN(durationSeconds)) {
      return 5;
    }
    return durationSeconds;
  } catch (err) {
    return 5;
  }
}



export async function compositeVideo(
  contentId: string,
  script: any,
  assetUrls: Record<string, string>,
  outputVideoPath: string,
  canonArchetype?: CanonArchetype
): Promise<void> {
  console.log(`[Video Compositor] Iniciando render: ${contentId} [arquétipo: ${canonArchetype ?? 'nenhum'}]`);

  if (process.env.FORCE_FFMPEG === 'true' || process.env.DISABLE_REMOTION === 'true') {
    console.log(`[Video Compositor] FORCE_FFMPEG ou DISABLE_REMOTION ativado. Renderizando diretamente via FFmpeg...`);
    await renderWithFFmpeg(contentId, script, assetUrls, outputVideoPath);
    return;
  }

  // --- LOCAL ASSET SERVER ---
  // Starts a local HTTP server to serve absolute files directly to the Chromium instance.
  // This avoids file:/// CORS and net::ERR_UNKNOWN_URL_SCHEME issues on Windows.
  let localServer: http.Server | null = null;
  let localServerPort = 0;

  await new Promise<void>((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      try {
        const urlParsed = new URL(req.url || '/', `http://${req.headers.host}`);
        const filePath = urlParsed.searchParams.get('path');

        if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav', '.mp4': 'video/mp4'
          };
          res.writeHead(200, {
             'Content-Type': mimeTypes[ext] || 'application/octet-stream',
             'Access-Control-Allow-Origin': '*'
          });
          fs.createReadStream(filePath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (e) {
        res.writeHead(500);
        res.end('Server Error');
      }
    });

    localServer.on('error', reject);
    localServer.listen(0, '127.0.0.1', () => {
      localServerPort = (localServer?.address() as any).port;
      console.log(`[Video Compositor] Local asset server started on port ${localServerPort}`);
      resolve();
    });
  });

  function toLocalUrl(filePath: string): string {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.warn(`[Video Compositor] Warning: File not found: ${resolved}`);
      return filePath;
    }
    return `http://127.0.0.1:${localServerPort}/?path=${encodeURIComponent(resolved)}`;
  }

  const fps = 30;
  let remotionInputProps: any = null;
  let totalFrames = 0;

  // 1. Tentar ler do Story Manifest se disponível
  if (assetUrls && assetUrls.storyManifest && fs.existsSync(assetUrls.storyManifest)) {
    try {
      console.log(`[Video Compositor] Carregando Story Manifest de: ${assetUrls.storyManifest}`);
      const manifestRaw = fs.readFileSync(assetUrls.storyManifest, 'utf-8');
      const manifest: RenderManifest = JSON.parse(manifestRaw);

      const memoriesDir = path.join(process.cwd(), 'packages/knowledge/memories');
      
      // Resolução do caminho absoluto da trilha sonora (BGM) para que o Remotion a renderize nativamente
      if (manifest.audioContext.bgmUrl) {
        const bgmPath = path.isAbsolute(manifest.audioContext.bgmUrl)
          ? manifest.audioContext.bgmUrl
          : path.join(memoriesDir, manifest.audioContext.bgmUrl);

        if (fs.existsSync(bgmPath)) {
          manifest.audioContext.bgmUrl = toLocalUrl(bgmPath);
        } else {
          console.warn(`[Video Compositor] ⚠️ Trilha sonora não encontrada no disco: ${bgmPath}. Renderizando sem música de fundo.`);
          manifest.audioContext.bgmUrl = '';
        }
      }

      // Converter cada cena (imagem e locução) para usar protocolo http
      for (const scene of manifest.scenes) {
        if (scene.layout.mediaUrl && fs.existsSync(scene.layout.mediaUrl)) {
          scene.layout.mediaUrl = toLocalUrl(scene.layout.mediaUrl);
        }
        
        const narrationPath = (scene.layout as any).narrationPath;
        if (narrationPath && fs.existsSync(narrationPath)) {
          (scene.layout as any).narrationUrl = toLocalUrl(narrationPath);
        }

        const durationInFrames = Math.ceil((scene.durationMs / 1000) * fps);
        (scene as any).durationInFrames = durationInFrames;
        totalFrames += durationInFrames;
      }

      remotionInputProps = { ...manifest, canonArchetype };
      console.log(`[Video Compositor] Story Manifest carregado com sucesso! Total de frames: ${totalFrames}`);
    } catch (manifestError) {
      console.error(`[Video Compositor] Falha ao parsear/processar Story Manifest. Usando fallback linear:`, manifestError);
      remotionInputProps = null;
    }
  }

  // Fallback para a lógica linear antiga se não houver manifest
  if (!remotionInputProps) {
    const sections: any[] = [];
    for (let idx = 0; idx < script.body.length; idx++) {
      const section = script.body[idx];
      let audioPath = assetUrls[`voiceover_sec_${idx}`] || assetUrls[`voiceover_scene_${idx}`];
      let imagePath = assetUrls[`visual_sec_${idx}`] || assetUrls[`visual_scene_${idx}`];

      if (!audioPath || !imagePath) {
        if (localServer) { (localServer as any).close(); }
        throw new Error(`Missing audio or image for section ${idx}`);
      }

      const durationSeconds = getAudioDuration(audioPath);
      const durationInFrames = Math.ceil(durationSeconds * fps);

      const imageUrl = toLocalUrl(imagePath);
      const audioUrl = toLocalUrl(audioPath);

      sections.push({
        text: section.content,
        imageUrl,
        audioUrl,
        durationInFrames,
      });
    }

    totalFrames = sections.reduce((acc, s) => acc + s.durationInFrames, 0);
    remotionInputProps = { sections, canonArchetype };
  }

  try {
    console.log(`[Video Compositor] Bundling Remotion composition...`);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Resolve entrypoint to the raw .tsx file in 'src' directory, as Remotion's bundler needs the source file.
    const entryPoint = __dirname.endsWith('dist')
      ? path.resolve(__dirname, '../src/video-composition/index.tsx')
      : path.resolve(__dirname, './video-composition/index.tsx');

    const bundleLocation = await bundle({
      entryPoint,
    });

    const chromiumPath = process.env.REMOTION_CHROMIUM_PATH || undefined;
    if (chromiumPath) {
      console.log(`[Video Compositor] Using Chromium at: ${chromiumPath}`);
    }

    console.log(`[Video Compositor] Retrieving compositions...`);
    const comps = await getCompositions(bundleLocation, {
      inputProps: remotionInputProps,
      browserExecutable: chromiumPath,
      chromiumOptions: {
        disableWebSecurity: true,
        gl: 'angle',
      },
      timeoutInMilliseconds: 120000,
    });

    const composition = comps.find((c) => c.id === 'MainVideo');
    if (!composition) {
      throw new Error('Composition "MainVideo" not found in entryPoint');
    }

    // Override composition settings dynamically
    composition.durationInFrames = totalFrames;

    console.log(`[Video Compositor] Renderizando com Remotion (tema/arquétipo: ${canonArchetype ?? 'default'})...`);
    const videoBitrate = process.env.REMOTION_VIDEO_BITRATE;
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputVideoPath,
      inputProps: remotionInputProps,
      browserExecutable: chromiumPath,
      // Se REMOTION_VIDEO_BITRATE está definido, usa VBR com bitrate fixo; caso contrário usa CRF 23
      ...(videoBitrate ? { videoBitrate } : { crf: 23 }),
      chromiumOptions: {
        disableWebSecurity: true,
        gl: 'angle',
      },
      timeoutInMilliseconds: 120000,
    });

    console.log(`[Video Compositor] Remotion render concluído com sucesso!`);

  } catch (remotionError) {
    console.warn(`[Video Compositor] Remotion rendering failed. Falling back to FFmpeg compositor:`, remotionError);
    
    // Fallback to FFmpeg compositor
    await renderWithFFmpeg(contentId, script, assetUrls, outputVideoPath);
  } finally {
    if (localServer) {
       (localServer as any).close();
       console.log(`[Video Compositor] Local asset server stopped.`);
    }
  }
}

async function renderWithFFmpeg(
  contentId: string,
  script: any,
  assetUrls: Record<string, string>,
  outputVideoPath: string
): Promise<void> {
  const assetsDir = path.dirname(outputVideoPath);
  const tempDir = path.join(assetsDir, `temp_${contentId}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const sectionVideos: string[] = [];

  try {
    // 1. Generate video for each section
    for (let idx = 0; idx < script.body.length; idx++) {
      const audioPath = assetUrls[`voiceover_sec_${idx}`] || assetUrls[`voiceover_scene_${idx}`];
      const imagePath = assetUrls[`visual_sec_${idx}`] || assetUrls[`visual_scene_${idx}`];
      const sectionVideoPath = path.join(tempDir, `section_${idx}.mp4`);

      console.log(`[FFmpeg Compositor] Rendering section ${idx} to ${sectionVideoPath}`);
      const ffmpegCmd = `ffmpeg -nostdin -y -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -preset ultrafast -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${sectionVideoPath}"`;
      
      await execAsync(ffmpegCmd);
      sectionVideos.push(sectionVideoPath);
    }

    // 2. Concatenate all section videos
    const listFilePath = path.join(tempDir, 'files.txt');
    const listContent = sectionVideos.map(v => `file '${v.replace(/\\/g, '/')}'`).join('\n');
    await fs.promises.writeFile(listFilePath, listContent);

    console.log(`[FFmpeg Compositor] Concatenating all sections into: ${outputVideoPath}`);
    const concatCmd = `ffmpeg -nostdin -y -f concat -safe 0 -i "${listFilePath}" -c copy "${outputVideoPath}"`;
    await execAsync(concatCmd);

    console.log(`[FFmpeg Compositor] Render completed successfully!`);
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn(`[FFmpeg Compositor] Temporary cleanup failed:`, cleanupErr);
    }
  }
}

/**
 * Aplica um fade-out no áudio final (master) de um vídeo que já possui 
 * narração e BGM combinados.
 *
 * @param inputVideoPath Path to the video file (must contain the combined audio)
 * @param outputVideoPath Path where the final video with faded audio will be saved
 * @param totalDurationMs Total duration of the video in milliseconds
 */
export async function masterAudio(
  inputVideoPath: string,
  outputVideoPath: string,
  totalDurationMs: number
): Promise<void> {
  const defaultFadeDurationMs = Math.min(2000, totalDurationMs * 0.05);
  const envFadeDuration = process.env.BGM_FADE_DURATION_MS 
    ? parseInt(process.env.BGM_FADE_DURATION_MS, 10) 
    : NaN;
    
  const fadeDurationMs = !isNaN(envFadeDuration) ? envFadeDuration : defaultFadeDurationMs;
  const fadeStartMs = Math.max(0, totalDurationMs - fadeDurationMs);
  
  const fadeStartSec = fadeStartMs / 1000;
  const fadeDurationSec = fadeDurationMs / 1000;

  console.log(`[Video Compositor] masterAudio: Applying master fade-out. Start: ${fadeStartSec}s, Duration: ${fadeDurationSec}s`);

  // ffmpeg command to apply audio fade-out (afade) to the existing audio stream.
  const ffmpegCmd = `ffmpeg -nostdin -y -i "${inputVideoPath}" -af "afade=t=out:st=${fadeStartSec}:d=${fadeDurationSec}" -c:v copy -c:a aac -b:a 192k "${outputVideoPath}"`;

  try {
    await execAsync(ffmpegCmd);
    console.log(`[Video Compositor] masterAudio completed successfully!`);
  } catch (error) {
    console.error(`[Video Compositor] masterAudio failed:`, error);
    throw error;
  }
}
