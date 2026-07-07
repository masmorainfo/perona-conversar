import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { execSync } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CanonArchetype, RenderManifest } from '@cos/types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function fileToDataURL(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.warn(`[Video Compositor] Warning: File not found: ${resolved}`);
    return filePath;
  }
  const ext = path.extname(resolved).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.mp3') mimeType = 'audio/mp3';
  else if (ext === '.wav') mimeType = 'audio/wav';
  else if (ext === '.ogg') mimeType = 'audio/ogg';

  const base64 = fs.readFileSync(resolved).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

export async function compositeVideo(
  contentId: string,
  script: any,
  assetUrls: Record<string, string>,
  outputVideoPath: string,
  canonArchetype?: CanonArchetype
): Promise<void> {
  console.log(`[Video Compositor] Iniciando render: ${contentId} [arquétipo: ${canonArchetype ?? 'nenhum'}]`);

  const fps = 30;
  let remotionInputProps: any = null;
  let totalFrames = 0;

  // 1. Tentar ler do Story Manifest se disponível
  if (assetUrls && assetUrls.storyManifest && fs.existsSync(assetUrls.storyManifest)) {
    try {
      console.log(`[Video Compositor] Carregando Story Manifest de: ${assetUrls.storyManifest}`);
      const manifestRaw = fs.readFileSync(assetUrls.storyManifest, 'utf-8');
      const manifest: RenderManifest = JSON.parse(manifestRaw);

      // Converter todos os caminhos locais do manifest para Base64 data URLs
      const memoriesDir = path.join(process.cwd(), 'packages/knowledge/memories');
      
      // Converter trilha sonora (BGM) se informada
      if (manifest.audioContext.bgmUrl) {
        const bgmPath = path.isAbsolute(manifest.audioContext.bgmUrl)
          ? manifest.audioContext.bgmUrl
          : path.join(memoriesDir, manifest.audioContext.bgmUrl);

        if (fs.existsSync(bgmPath)) {
          console.log(`[Video Compositor] 🎵 Convertendo trilha sonora: ${bgmPath}`);
          manifest.audioContext.bgmUrl = fileToDataURL(bgmPath);
        } else {
          console.warn(`[Video Compositor] ⚠️ Trilha sonora não encontrada no disco: ${bgmPath}. Renderizando sem música de fundo.`);
          manifest.audioContext.bgmUrl = '';
        }
      }

      // Converter cada cena (imagem e locução)
      for (const scene of manifest.scenes) {
        if (scene.layout.mediaUrl && fs.existsSync(scene.layout.mediaUrl)) {
          scene.layout.mediaUrl = fileToDataURL(scene.layout.mediaUrl);
        }
        
        const narrationPath = (scene.layout as any).narrationPath;
        if (narrationPath && fs.existsSync(narrationPath)) {
          (scene.layout as any).narrationUrl = fileToDataURL(narrationPath);
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
      const audioPath = assetUrls[`voiceover_sec_${idx}`];
      const imagePath = assetUrls[`visual_sec_${idx}`];

      if (!audioPath || !imagePath) {
        throw new Error(`Missing audio or image for section ${idx}`);
      }

      const durationSeconds = getAudioDuration(audioPath);
      const durationInFrames = Math.ceil(durationSeconds * fps);

      const imageUrl = fileToDataURL(imagePath);
      const audioUrl = fileToDataURL(audioPath);

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

    console.log(`[Video Compositor] Retrieving compositions...`);
    const comps = await getCompositions(bundleLocation, {
      inputProps: remotionInputProps,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    const composition = comps.find((c) => c.id === 'MainVideo');
    if (!composition) {
      throw new Error('Composition "MainVideo" not found in entryPoint');
    }

    // Override composition settings dynamically
    composition.durationInFrames = totalFrames;

    console.log(`[Video Compositor] Renderizando com Remotion (tema/arquétipo: ${canonArchetype ?? 'default'})...`);
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputVideoPath,
      inputProps: remotionInputProps,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

    console.log(`[Video Compositor] Remotion render concluído com sucesso!`);
  } catch (remotionError) {
    console.warn(`[Video Compositor] Remotion rendering failed. Falling back to FFmpeg compositor:`, remotionError);
    
    // Fallback to FFmpeg compositor
    await renderWithFFmpeg(contentId, script, assetUrls, outputVideoPath);
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
      const audioPath = assetUrls[`voiceover_sec_${idx}`];
      const imagePath = assetUrls[`visual_sec_${idx}`];
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
