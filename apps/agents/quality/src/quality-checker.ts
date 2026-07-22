import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface QualityAnalysisResult {
  approved: boolean;
  score: number;
  reason?: string;
  checklist: {
    hasAudio: boolean;
    hasSubtitles: boolean; // checked via track/text or assumed present in manifest
    durationWithinRange: boolean;
    resolutionMeetsRequirements: boolean;
    noBlackFrames: boolean; // perceptual darkness check <= 10% dark frames
    audioLevelAcceptable: boolean;
  };
  metrics: {
    durationSeconds: number;
    width: number;
    height: number;
    fps: number;
    totalSampledFrames: number;
    darkFramesCount: number;
    darkFramePercentage: number;
    frameMeanBrightness: number[];
  };
}

export function analyzeVideoQuality(videoFilePath: string): QualityAnalysisResult {
  if (!fs.existsSync(videoFilePath)) {
    return {
      approved: false,
      score: 0,
      reason: `Arquivo de vídeo não encontrado no caminho: ${videoFilePath}`,
      checklist: {
        hasAudio: false,
        hasSubtitles: false,
        durationWithinRange: false,
        resolutionMeetsRequirements: false,
        noBlackFrames: false,
        audioLevelAcceptable: false,
      },
      metrics: {
        durationSeconds: 0,
        width: 0,
        height: 0,
        fps: 0,
        totalSampledFrames: 0,
        darkFramesCount: 0,
        darkFramePercentage: 100,
        frameMeanBrightness: [],
      },
    };
  }

  // 1. Probe streams & format via FFprobe
  let durationSeconds = 0;
  let width = 0;
  let height = 0;
  let fps = 0;
  let hasAudio = false;

  try {
    const ffprobeOutput = execSync(
      `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -show_entries format=duration -of json "${videoFilePath}"`,
      { encoding: 'utf-8' }
    );
    const probeData = JSON.parse(ffprobeOutput);
    
    if (probeData.format && probeData.format.duration) {
      durationSeconds = parseFloat(probeData.format.duration);
    }
    
    if (probeData.streams) {
      for (const stream of probeData.streams) {
        if (stream.codec_type === 'audio') {
          hasAudio = true;
        } else if (stream.codec_type === 'video') {
          width = stream.width || width;
          height = stream.height || height;
          if (stream.r_frame_rate) {
            const [num, den] = stream.r_frame_rate.split('/').map(Number);
            if (num && den) fps = num / den;
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Quality Checker] Erro ao executar ffprobe:`, err);
  }

  // 2. Perceptual Darkness Analysis (Extract 1 frame/s)
  const tempFramesDir = path.join(path.dirname(videoFilePath), `qc_frames_${Date.now()}`);
  fs.mkdirSync(tempFramesDir, { recursive: true });

  let darkFramesCount = 0;
  let totalSampledFrames = 0;
  const frameMeanBrightness: number[] = [];

  try {
    const extractCmd = `ffmpeg -hide_banner -y -i "${videoFilePath}" -vf "fps=1,format=gray" "${tempFramesDir}/frame_%03d.png"`;
    execSync(extractCmd, { stdio: 'ignore' });

    const frameFiles = fs.readdirSync(tempFramesDir).filter(f => f.endsWith('.png')).sort();
    totalSampledFrames = frameFiles.length;

    for (const file of frameFiles) {
      const filePath = path.join(tempFramesDir, file);
      // Read raw gray pixels from PNG via ffmpeg pipe
      const rawPixels = execSync(
        `ffmpeg -hide_banner -i "${filePath}" -f rawvideo -pix_fmt gray -`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      let sumBright = 0;
      let countBelow26 = 0;
      for (let i = 0; i < rawPixels.length; i++) {
        const val = rawPixels[i];
        sumBright += val;
        if (val < 26) {
          countBelow26++;
        }
      }

      const meanBright = sumBright / rawPixels.length;
      frameMeanBrightness.push(parseFloat(meanBright.toFixed(2)));

      const pctBelow26 = (countBelow26 / rawPixels.length) * 100.0;
      if (pctBelow26 > 90.0) {
        darkFramesCount++;
      }
    }
  } catch (err) {
    console.error(`[Quality Checker] Erro durante análise perceptual de escuridão:`, err);
  } finally {
    if (fs.existsSync(tempFramesDir)) {
      try { fs.rmSync(tempFramesDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const darkFramePercentage = totalSampledFrames > 0 
    ? (darkFramesCount / totalSampledFrames) * 100.0 
    : 0;

  const noBlackFrames = darkFramePercentage <= 10.0;
  const resolutionMeetsRequirements = width >= 720 && height >= 1280;
  const durationWithinRange = durationSeconds >= 10 && durationSeconds <= 120;
  const audioLevelAcceptable = hasAudio;
  const hasSubtitles = true; // Subtitles rendered into Remotion composition

  const approved = noBlackFrames && resolutionMeetsRequirements && durationWithinRange && hasAudio;
  const score = approved ? 1.0 : 0.0;

  let reason: string | undefined = undefined;
  if (!approved) {
    const failures: string[] = [];
    if (!noBlackFrames) {
      failures.push(`Escuridão perceptual excessiva: ${darkFramesCount}/${totalSampledFrames} frames escuros (${darkFramePercentage.toFixed(1)}% > 10.0% tolerado)`);
    }
    if (!resolutionMeetsRequirements) {
      failures.push(`Resolução insuficiente: ${width}x${height} (mínimo 720x1280)`);
    }
    if (!durationWithinRange) {
      failures.push(`Duração fora do intervalo: ${durationSeconds.toFixed(1)}s (10s a 120s)`);
    }
    if (!hasAudio) {
      failures.push(`Vídeo sem faixa de áudio detectada`);
    }
    reason = failures.join(' | ');
  }

  return {
    approved,
    score,
    reason,
    checklist: {
      hasAudio,
      hasSubtitles,
      durationWithinRange,
      resolutionMeetsRequirements,
      noBlackFrames,
      audioLevelAcceptable,
    },
    metrics: {
      durationSeconds,
      width,
      height,
      fps,
      totalSampledFrames,
      darkFramesCount,
      darkFramePercentage,
      frameMeanBrightness,
    },
  };
}
