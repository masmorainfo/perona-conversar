/**
 * Teste isolado do masterAudio() — Onda C
 * Roda a cadeia FFmpeg sobre o vídeo kaka_vertebra_v7 existente
 * SEM tocar no pipeline principal.
 *
 * Uso: node scratch/test_master_audio.mjs
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Candidato v7: maior arquivo de 09/07 com ~75s de duracao
const INPUT = path.join(ROOT, 'tmp', 'outputs',
  '25b9449d-28f5-4758-9d84-f7b23a067d7d_b903beb7-6efc-4740-878d-22acdc999056.mp4');
const OUTPUT = path.join(ROOT, 'tmp', 'outputs', 'kaka_v7_mastered_test.mp4');

if (!fs.existsSync(INPUT)) {
  console.error('Arquivo de entrada nao encontrado:', INPUT);
  process.exit(1);
}

function getDuration(filePath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
    { encoding: 'utf-8' }
  ).trim();
  return parseFloat(out);
}

const inputDuration = getDuration(INPUT);
const fadeStartSec  = Math.max(0, inputDuration - 0.15);

console.log('\n[INPUT]  ' + path.basename(INPUT));
console.log('  Tamanho: ' + (fs.statSync(INPUT).size / 1024 / 1024).toFixed(2) + ' MB');
console.log('  Duracao: ' + inputDuration.toFixed(3) + 's');
console.log('  Fade-out start: ' + fadeStartSec.toFixed(3) + 's\n');

// Cadeia identica a que sera integrada em video-compositor.ts:
//   highpass   -> remove ruido sub-80Hz
//   lowpass    -> remove harshness acima de 12kHz
//   equalizer  -> suaviza medios agressivos (~3kHz, -2dB)
//   compand    -> compressor dinamico (ataque 0ms, decay 500ms)
//   afade      -> fade-out 150ms antes do fim
//   loudnorm   -> normalizacao LUFS-I -14 (padrao TikTok)
//   -c:v copy  -> video NAO re-encodado, so audio passa pelo filtro
const audioFilter = [
  'highpass=f=80',
  'lowpass=f=12000',
  'equalizer=f=3000:width_type=o:width=2:g=-2',
  'compand=attacks=0:decays=0.5:points=-80/-80|-45/-15|-27/-9|-5/-5|0/-2',
  'afade=t=out:st=' + fadeStartSec.toFixed(3) + ':d=0.15',
  'loudnorm=I=-14:TP=-1.5:LRA=11',
].join(',');

const cmd = 'ffmpeg -nostdin -y -i "' + INPUT + '" -af "' + audioFilter + '" -c:v copy "' + OUTPUT + '"';

console.log('[CMD] ' + cmd + '\n');

try {
  execSync(cmd, { stdio: 'inherit' });
} catch (err) {
  console.error('\nFFmpeg falhou:', err.message);
  process.exit(1);
}

if (!fs.existsSync(OUTPUT)) {
  console.error('Output nao criado');
  process.exit(1);
}

const outputDuration = getDuration(OUTPUT);
const inputSizeMB    = fs.statSync(INPUT).size  / 1024 / 1024;
const outputSizeMB   = fs.statSync(OUTPUT).size / 1024 / 1024;
const durationDiff   = Math.abs(outputDuration - inputDuration);
const sizeRatio      = outputSizeMB / inputSizeMB;

console.log('\n[OUTPUT] ' + path.basename(OUTPUT));
console.log('  Tamanho: ' + outputSizeMB.toFixed(2) + ' MB  (ratio: ' + sizeRatio.toFixed(2) + 'x vs input ' + inputSizeMB.toFixed(2) + ' MB)');
console.log('  Duracao: ' + outputDuration.toFixed(3) + 's  (diff: ' + durationDiff.toFixed(3) + 's)');

let passed = true;
if (durationDiff > 0.5) { console.error('FAIL duracao diverge: ' + durationDiff.toFixed(3) + 's'); passed = false; }
if (sizeRatio < 0.5)    { console.error('FAIL output muito menor (ratio ' + sizeRatio.toFixed(2) + ') — possivel corrupcao'); passed = false; }
if (outputDuration < 5) { console.error('FAIL output < 5s — stream de audio corrompido'); passed = false; }

if (passed) {
  console.log('\nPASSED — masterAudio() pronto para integracao.\n');
} else {
  console.error('\nFAILED — NAO integrar ainda.\n');
  process.exit(1);
}
