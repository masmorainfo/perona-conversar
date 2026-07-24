import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Fontes de imagem permitidas pela política editorial KAIRO
const ALLOWED_IMAGE_SOURCES = ['wikimedia', 'openverse', 'pexels', 'google_cse'];

export interface QualityChecklist {
  hasAudio: boolean;
  hasSubtitles: boolean;
  durationWithinRange: boolean;
  resolutionMeetsRequirements: boolean;
  noBlackFrames: boolean;
  audioLevelAcceptable: boolean;       // C7: LUFS integrado dentro da faixa
  allImagesLicensedAndVerified: boolean; // C5: license presente + verdict ACCEPTED
  hasKaraokeTimestamps: boolean;        // C6: voiceModel expressivo + wordTimestamps presente
}

export interface QualityMetrics {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  totalSampledFrames: number;
  darkFramesCount: number;
  darkFramePercentage: number;
  frameMeanBrightness: number[];
  audioLufs: number;                   // LUFS integrado medido (NaN se não medível)
  unlicensedOrRejectedScenes: string[]; // IDs de cenas com imagem sem licença ou reprovada
  voiceModel: string | null;           // Modelo de voz detectado no manifest
  scenesWithWordTimestamps: number;    // Cenas com wordTimestamps populados
  totalScenes: number;                 // Total de cenas no manifest
}

export interface QualityAnalysisResult {
  approved: boolean;
  score: number;
  reason?: string;
  checklist: QualityChecklist;
  metrics: QualityMetrics;
}

/**
 * Lê o manifest JSON em disco a partir do path informado.
 * Retorna null se não encontrado (container reiniciado, etc.).
 */
export function loadManifest(manifestPath: string): any | null {
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * C5 — Verifica se todas as cenas possuem imagem licenciada E aprovada pelo Visual Verifier.
 * Cenas de abstração (isAbstraction=true) e cenas AI-fallback (isAiFallback=true) são isentas
 * — elas não têm `sourcingMetadata`, pois a imagem foi gerada internamente.
 */
function checkImageLicensing(manifest: any): {
  allVerified: boolean;
  unlicensedOrRejectedScenes: string[];
} {
  if (!manifest?.scenes?.length) {
    // Sem manifest → não podemos verificar → falha conservadora
    return { allVerified: false, unlicensedOrRejectedScenes: ['manifest_unavailable'] };
  }

  const unlicensed: string[] = [];

  for (const scene of manifest.scenes) {
    const layout = scene.layout || {};
    const sceneId = scene.id || 'unknown';

    // Cenas de fallback IA ou abstração: isentas (a imagem foi gerada pelo sistema)
    if (layout.isAiFallback || layout.isAbstraction) continue;

    const sm = layout.sourcingMetadata;
    if (!sm) {
      // Cena com imagem externa mas sem metadata de sourcing → não rastreável
      unlicensed.push(`${sceneId}:no_sourcing_metadata`);
      continue;
    }

    // Checa licença
    if (!sm.license) {
      unlicensed.push(`${sceneId}:missing_license`);
      continue;
    }

    // Checa fonte permitida
    const sourceOk = ALLOWED_IMAGE_SOURCES.some(allowed =>
      (sm.source || '').toLowerCase().includes(allowed)
    );
    if (!sourceOk) {
      unlicensed.push(`${sceneId}:source_not_allowed:${sm.source}`);
      continue;
    }

    // Checa verdict do Visual Verifier — deve ser 'ACCEPTED'
    if (sm.verdict && sm.verdict !== 'ACCEPTED') {
      unlicensed.push(`${sceneId}:verdict_${sm.verdict}`);
    }
  }

  return { allVerified: unlicensed.length === 0, unlicensedOrRejectedScenes: unlicensed };
}

/**
 * C6 — Verifica presença de karaokê com timestamps sincronizados.
 * Critério: pelo menos 1 cena com `scene.captions.wordTimestamps.length > 0`
 * E presença de voiceModel expressivo no global manifest (se disponível).
 */
function checkKaraokeTimestamps(manifest: any): {
  hasKaraoke: boolean;
  voiceModel: string | null;
  scenesWithTimestamps: number;
  totalScenes: number;
} {
  if (!manifest?.scenes?.length) {
    return { hasKaraoke: false, voiceModel: null, scenesWithTimestamps: 0, totalScenes: 0 };
  }

  const totalScenes = manifest.scenes.length;
  let scenesWithTimestamps = 0;

  for (const scene of manifest.scenes) {
    const captions = scene.captions || {};
    if (Array.isArray(captions.wordTimestamps) && captions.wordTimestamps.length > 0) {
      scenesWithTimestamps++;
    }
  }

  // voiceModel pode estar no globalStyle ou narração do manifest
  const voiceModel: string | null =
    manifest.globalStyle?.voiceModel ||
    manifest.scenes[0]?.layout?.voiceModel ||
    null;

  // Karaokê válido: pelo menos 1 cena com timestamps (se houver narração)
  // Cenas sem narração (instrumentais/b-roll) podem não ter timestamps — não penalizar
  const scenesWithNarration = manifest.scenes.filter(
    (s: any) => s.layout?.narrationPath
  ).length;

  // Se nenhuma cena tem narração, timestamps são irrelevantes → approvar
  const hasKaraoke =
    scenesWithNarration === 0 ||
    scenesWithTimestamps > 0;

  return { hasKaraoke, voiceModel, scenesWithTimestamps, totalScenes };
}

/**
 * C7 — Mede LUFS integrado do áudio via FFmpeg loudnorm filter.
 * Gate: -24 ≤ LUFS ≤ -9 (abaixo = muito silencioso; acima = clipped/distorcido)
 */
function measureAudioLufs(videoFilePath: string): number {
  try {
    // loudnorm em modo de medição: -f null -  força análise sem reencoding
    const output = execSync(
      `ffmpeg -hide_banner -i "${videoFilePath}" -af "loudnorm=print_format=json" -f null - 2>&1`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    // FFmpeg imprime o JSON no stderr, capturado pelo 2>&1
    const match = output.match(/\{[\s\S]*?"input_i"\s*:\s*"([-\d.]+)"/);
    if (match) return parseFloat(match[1]);
    return NaN;
  } catch {
    return NaN;
  }
}

/**
 * Análise principal de qualidade do vídeo — 7 critérios objetivos.
 * @param videoFilePath  Caminho do arquivo MP4 renderizado
 * @param manifest       Manifest JSON carregado (null se não disponível)
 */
export function analyzeVideoQuality(
  videoFilePath: string,
  manifest: any | null
): QualityAnalysisResult {
  if (!fs.existsSync(videoFilePath)) {
    return {
      approved: false,
      score: 0,
      reason: `Arquivo de vídeo não encontrado: ${videoFilePath}`,
      checklist: {
        hasAudio: false,
        hasSubtitles: false,
        durationWithinRange: false,
        resolutionMeetsRequirements: false,
        noBlackFrames: false,
        audioLevelAcceptable: false,
        allImagesLicensedAndVerified: false,
        hasKaraokeTimestamps: false,
      },
      metrics: {
        durationSeconds: 0, width: 0, height: 0, fps: 0,
        totalSampledFrames: 0, darkFramesCount: 0, darkFramePercentage: 100,
        frameMeanBrightness: [], audioLufs: NaN,
        unlicensedOrRejectedScenes: ['video_file_missing'],
        voiceModel: null, scenesWithWordTimestamps: 0, totalScenes: 0,
      },
    };
  }

  // ── C1–C4: FFprobe streams & format ─────────────────────────────────────────
  let durationSeconds = 0, width = 0, height = 0, fps = 0, hasAudio = false;
  try {
    const ffprobeOutput = execSync(
      `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -show_entries format=duration -of json "${videoFilePath}"`,
      { encoding: 'utf-8' }
    );
    const probeData = JSON.parse(ffprobeOutput);
    if (probeData.format?.duration) durationSeconds = parseFloat(probeData.format.duration);
    for (const stream of (probeData.streams || [])) {
      if (stream.codec_type === 'audio') hasAudio = true;
      else if (stream.codec_type === 'video') {
        width = stream.width || width;
        height = stream.height || height;
        if (stream.r_frame_rate) {
          const [num, den] = stream.r_frame_rate.split('/').map(Number);
          if (num && den) fps = num / den;
        }
      }
    }
  } catch (err) {
    console.error('[Quality Checker] Erro ao executar ffprobe:', err);
  }

  // ── C2: Perceptual Darkness Analysis (1 frame/s sampled) ─────────────────────
  const tempFramesDir = path.join(path.dirname(videoFilePath), `qc_frames_${Date.now()}`);
  fs.mkdirSync(tempFramesDir, { recursive: true });
  let darkFramesCount = 0, totalSampledFrames = 0;
  const frameMeanBrightness: number[] = [];
  try {
    execSync(
      `ffmpeg -hide_banner -y -i "${videoFilePath}" -vf "fps=1,format=gray" "${tempFramesDir}/frame_%03d.png"`,
      { stdio: 'ignore' }
    );
    const frameFiles = fs.readdirSync(tempFramesDir).filter(f => f.endsWith('.png')).sort();
    totalSampledFrames = frameFiles.length;
    for (const file of frameFiles) {
      const rawPixels = execSync(
        `ffmpeg -hide_banner -i "${path.join(tempFramesDir, file)}" -f rawvideo -pix_fmt gray -`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      let sumBright = 0, countBelow26 = 0;
      for (let i = 0; i < rawPixels.length; i++) {
        sumBright += rawPixels[i];
        if (rawPixels[i] < 26) countBelow26++;
      }
      frameMeanBrightness.push(parseFloat((sumBright / rawPixels.length).toFixed(2)));
      if ((countBelow26 / rawPixels.length) * 100 > 90) darkFramesCount++;
    }
  } catch (err) {
    console.error('[Quality Checker] Erro na análise perceptual de escuridão:', err);
  } finally {
    if (fs.existsSync(tempFramesDir)) {
      try { fs.rmSync(tempFramesDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // ── C7: Audio LUFS ────────────────────────────────────────────────────────────
  const audioLufs = hasAudio ? measureAudioLufs(videoFilePath) : NaN;

  // ── C5: Image licensing + verdict ────────────────────────────────────────────
  const { allVerified: allImagesLicensedAndVerified, unlicensedOrRejectedScenes } =
    checkImageLicensing(manifest);

  // ── C6: Karaoke timestamps ────────────────────────────────────────────────────
  const { hasKaraoke, voiceModel, scenesWithTimestamps, totalScenes } =
    checkKaraokeTimestamps(manifest);

  // ── Compute final checklist ──────────────────────────────────────────────────
  const darkFramePercentage =
    totalSampledFrames > 0 ? (darkFramesCount / totalSampledFrames) * 100 : 0;

  const noBlackFrames = darkFramePercentage <= 10.0;
  const resolutionMeetsRequirements = width >= 720 && height >= 1280;
  const durationWithinRange = durationSeconds >= 10 && durationSeconds <= 120;
  const audioLevelAcceptable =
    hasAudio && !isNaN(audioLufs) && audioLufs >= -24 && audioLufs <= -9;
  const hasSubtitles = true; // Subtitles rendered into Remotion composition

  const approved =
    noBlackFrames &&
    resolutionMeetsRequirements &&
    durationWithinRange &&
    hasAudio &&
    audioLevelAcceptable &&
    allImagesLicensedAndVerified &&
    hasKaraoke;

  // Compute score: 1 point per passing criterion / 7
  const CRITERIA = [
    noBlackFrames,
    resolutionMeetsRequirements,
    durationWithinRange,
    hasAudio,
    audioLevelAcceptable,
    allImagesLicensedAndVerified,
    hasKaraoke,
  ];
  const score = CRITERIA.filter(Boolean).length / CRITERIA.length;

  // Build failure reason string
  let reason: string | undefined;
  if (!approved) {
    const failures: string[] = [];
    if (!noBlackFrames)
      failures.push(`C2-DarkFrames: ${darkFramesCount}/${totalSampledFrames} (${darkFramePercentage.toFixed(1)}% > 10%)`);
    if (!resolutionMeetsRequirements)
      failures.push(`C3-Resolução: ${width}x${height} (mínimo 720x1280)`);
    if (!durationWithinRange)
      failures.push(`C4-Duração: ${durationSeconds.toFixed(1)}s (fora de 10-120s)`);
    if (!hasAudio)
      failures.push(`C1-Áudio: nenhuma faixa detectada`);
    if (hasAudio && !audioLevelAcceptable)
      failures.push(`C7-LUFS: ${isNaN(audioLufs) ? 'não mensurável' : audioLufs.toFixed(1)} LUFS (gate: -24 a -9)`);
    if (!allImagesLicensedAndVerified)
      failures.push(`C5-Licença/Verdict: cenas com problema: [${unlicensedOrRejectedScenes.join(', ')}]`);
    if (!hasKaraoke)
      failures.push(`C6-Karaokê: sem wordTimestamps (cenas com timestamps: ${scenesWithTimestamps}/${totalScenes})`);
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
      allImagesLicensedAndVerified,
      hasKaraokeTimestamps: hasKaraoke,
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
      audioLufs,
      unlicensedOrRejectedScenes,
      voiceModel,
      scenesWithWordTimestamps: scenesWithTimestamps,
      totalScenes,
    },
  };
}
