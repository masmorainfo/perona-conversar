import { v4 as uuidv4 } from 'uuid';
import type { Script } from '@cos/types';
import type { CinematicDirection } from './director.js';

export interface PlannedScene {
  id: string;
  text: string;
  visualDescription: string;
  cameraMovement: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'still';
  transitionIn: 'fade' | 'cut' | 'wipe' | 'glitch' | 'slide';
  transitionDurationMs: number;
  effect: 'monochrome' | 'warm' | 'normal' | 'sepia';
  isSilence: boolean;
  /**
   * 'subject' → cena sobre o jogador/pessoa — usar abstração/silhueta, nunca rosto por IA.
   * 'context' → cena sobre cenário, objeto, lugar, conceito — priorizar imagem real licenciada.
   * Regra fixa: hook e CTA sempre 'context' (energia visual máxima).
   */
  sceneSubject: 'subject' | 'context';
  /** Peso retórico classificado por heurística de texto (sem LLM). */
  rhetoricalWeight: 'normal' | 'emphasis' | 'critical';
  /** Velocidade de pan/zoom proporcional ao peso retórico. 0 = câmera parada. */
  panZoomSpeed: number;
}

/**
 * Classifica o sujeito visual de uma cena com base no visualNote.
 * Palavras que remetem a pessoa → 'subject' (abstração).
 * Tudo o mais → 'context' (imagem real ou IA de ambiente).
 * Lista de nomes expansível sob demanda sem alterar arquitetura.
 */
function classifySceneSubject(visualNote: string): 'subject' | 'context' {
  const lower = visualNote.toLowerCase();
  const subjectKeywords = [
    // Substantivos genéricos de pessoa
    'jogador', 'atleta', 'craque', 'homem', 'menino', 'garoto', 'figura',
    // Pronomes que indicam o sujeito da história
    'ele ', 'ela ', 'herói',

    // ── Brasileiros lendários ──────────────────────────────────────────────
    'kaká', 'kaka',
    'ronaldo',         // Ronaldo Fenômeno
    'ronaldinho',      // Ronaldinho Gaúcho
    'roberto carlos',
    'rivaldo',
    'neymar',
    'garrincha',
    'romário',
    'romario',
    'adriano',

    // ── Italianos clássicos (canal com forte viés Serie A / AC Milan) ──────
    'baggio',
    'totti',
    'pirlo',
    'inzaghi',
    'del piero',
    'delpiero',
    'vieri',
    'maldini',
    'cannavaro',
    'buffon',
    'nedved',

    // ── Europeus era de ouro (90s–2010s) ──────────────────────────────────
    'zidane',
    'beckham',
    'henry',
    'shevchenko',
    'figo',
    'raul',
    'van nistelrooy',
    'rooney',
    'gerrard',
    'lampard',
    'xavi',
    'iniesta',
    'ibrahimovic',
    'ibra',
    'modric',

    // ── Estrelas atuais recorrentes no futebol mundial ────────────────────
    'messi',
    'haaland',
    'mbappe',
    'mbappé',
    'salah',
    'vinicius',
    'vini',
  ];
  if (subjectKeywords.some(kw => lower.includes(kw))) return 'subject';
  return 'context'; // fallback conservador
}

// ── Tipos e funções da heurística retórica (Onda C — Zoom Editorial) ────────

type RhetoricalWeight = 'normal' | 'emphasis' | 'critical';

/**
 * Classifica o peso retórico de uma cena por regex sobre o texto.
 * Sem chamada de LLM. Latência < 1ms por cena.
 *
 * CRITICAL  — clímax narrativo, ruptura emocional, pergunta existencial.
 * EMPHASIS  — virada narrativa, dado factual forte (ano, número), intensificador.
 * NORMAL    — qualquer trecho descritivo ou de transição.
 */
function classifyRhetoricalWeight(text: string): RhetoricalWeight {
  if (!text || text.trim().length === 0) return 'normal'; // silêncio
  const lower = text.toLowerCase();

  const criticalPatterns = [
    /[!]{2,}/,
    /\?/,                                       // pergunta retórica (pico de tensão)
    /não |nunca |jamais /,
    /destruiu|perdeu|acabou|tudo mudou|o fim/,
    /o momento|a virada|foi então|naquele instante/,
    /tragédia|colapso|fim da carreira|o diagnóstico/,
    /impossível|inacreditável|histórico/,
  ];

  const emphasisPatterns = [
    /\b\d{4}\b/,                                // ano (2004, 1994...)
    /\d+\s*(gols?|anos?|dias?|vezes?|metros?|pontos?)/,
    /mas |porém |contudo |mesmo assim /,         // virada narrativa
    /pela primeira vez|mais uma vez|de novo/,
    /campeão|título|medalha|ballon/,
    /seleção|copa do mundo|champions/,
  ];

  if (criticalPatterns.some(p => p.test(lower))) return 'critical';
  if (emphasisPatterns.some(p => p.test(lower))) return 'emphasis';
  return 'normal';
}

/**
 * Determina movimento de câmera e velocidade com base no peso retórico.
 *
 * critical  → zoom_in  @ 1.8   (aproximação dramática — isola o momento)
 * emphasis  → zoom_out / pan_left alternados @ 1.35  (respiro na afirmação)
 * normal    → still / pan_right alternados @ 0.85   (presença tranquila)
 */
function resolveCameraMovement(
  weight: RhetoricalWeight,
  idx: number
): { cameraMovement: PlannedScene['cameraMovement']; panZoomSpeed: number } {
  switch (weight) {
    case 'critical':
      return { cameraMovement: 'zoom_in', panZoomSpeed: 1.8 };
    case 'emphasis':
      return idx % 2 === 0
        ? { cameraMovement: 'zoom_out', panZoomSpeed: 1.35 }
        : { cameraMovement: 'pan_left',  panZoomSpeed: 1.35 };
    case 'normal':
    default:
      return idx % 2 === 0
        ? { cameraMovement: 'still',     panZoomSpeed: 0.85 }
        : { cameraMovement: 'pan_right', panZoomSpeed: 0.85 };
  }
}

function chunkTextIntoScenes(text: string): string[] {
  if (!text) return [];
  const parts = text.split(/([.!?]+[\s]*)/);
  const chunks: string[] = [];
  let current = '';
  for (let i = 0; i < parts.length; i++) {
    current += parts[i];
    if (i % 2 === 1 || i === parts.length - 1) {
      const trimmed = current.trim();
      if (trimmed) chunks.push(trimmed);
      current = '';
    }
  }
  
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.split(/\s+/).length > 12) {
      const subparts = chunk.split(/([,;]+[\s]*)/);
      let subCurrent = '';
      for (let j = 0; j < subparts.length; j++) {
        subCurrent += subparts[j];
        if (j % 2 === 1 || j === subparts.length - 1) {
          const trimmed = subCurrent.trim();
          if (trimmed) finalChunks.push(trimmed);
          subCurrent = '';
        }
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  const mergedChunks: string[] = [];
  let buffer = '';
  for (const chunk of finalChunks) {
    buffer = buffer ? `${buffer} ${chunk}` : chunk;
    if (buffer.split(/\s+/).length >= 6) {
      mergedChunks.push(buffer);
      buffer = '';
    }
  }
  if (buffer) {
    if (mergedChunks.length > 0 && buffer.split(/\s+/).length < 4) {
      mergedChunks[mergedChunks.length - 1] += ` ${buffer}`;
    } else {
      mergedChunks.push(buffer);
    }
  }
  return mergedChunks.length > 0 ? mergedChunks : [text];
}

export function planStoryboard(
  script: Script,
  direction: CinematicDirection
): PlannedScene[] {
  const scenes: PlannedScene[] = [];
  const paletteGene = direction.canonArchetype;
  let globalSceneIdx = 0;

  // 1. Hook Scene (TikTok hook, primeiros 15s)
  scenes.push({
    id: uuidv4(),
    text: script.hook,
    visualDescription: `Hook visual: ${script.body[0]?.visualNote || 'futebol clássico'}`,
    cameraMovement: 'zoom_in',
    panZoomSpeed: 1.8,
    rhetoricalWeight: 'critical',
    transitionIn: 'fade',
    transitionDurationMs: 400,
    effect: paletteGene === 'heroi_tragico' || paletteGene === 'martir_esquecido' ? 'monochrome' : 'normal',
    isSilence: false,
    sceneSubject: 'context',
  });
  globalSceneIdx++;

  // 2. Body Scenes — câmera determinada por peso retórico do texto (Onda C)
  for (let idx = 0; idx < script.body.length; idx++) {
    const section = script.body[idx];
    const isExilado = paletteGene === 'exilado_que_retorna';
    const isHeroi = paletteGene === 'heroi_tragico';

    const chunks = chunkTextIntoScenes(section.content);

    for (let c = 0; c < chunks.length; c++) {
      const chunkText = chunks[c];
      const bodyVisualNote = section.visualNote || `Cena ${idx + 1} de futebol`;
      const weight = classifyRhetoricalWeight(chunkText);
      const camera = resolveCameraMovement(weight, globalSceneIdx);

      scenes.push({
        id: uuidv4(),
        text: chunkText,
        visualDescription: bodyVisualNote,
        cameraMovement: camera.cameraMovement,
        panZoomSpeed: camera.panZoomSpeed,
        rhetoricalWeight: weight,
        transitionIn: 'cut',
        transitionDurationMs: 0,
        effect: isExilado ? 'sepia' : (isHeroi ? 'warm' : 'normal'),
        isSilence: false,
        sceneSubject: classifySceneSubject(bodyVisualNote),
      });
      globalSceneIdx++;
    }

    // Silêncio II — O Silêncio da Pergunta (Pausa após uma pergunta existencial)
    if (section.content.trim().endsWith('?')) {
      scenes.push({
        id: uuidv4(),
        text: '',
        visualDescription: `Pausa dramática (Silêncio II - Pergunta), plano estático da cena anterior`,
        cameraMovement: 'still',
        panZoomSpeed: 0,
        rhetoricalWeight: 'normal',
        transitionIn: 'cut',
        transitionDurationMs: 0,
        effect: isExilado ? 'sepia' : (isHeroi ? 'warm' : 'normal'),
        isSilence: true,
        sceneSubject: 'context',
      });
      globalSceneIdx++;
    }
  }

  // 3. Canon Silence I — câmera parada absoluta: tensão máxima antes do clímax
  scenes.push({
    id: uuidv4(),
    text: '',
    visualDescription: `Tragic pause, dark blurred stadium background, anticipation`,
    cameraMovement: 'still',
    panZoomSpeed: 0,
    rhetoricalWeight: 'normal',
    transitionIn: 'cut', // fade apenas em abertura/fechamento
    transitionDurationMs: 0,
    effect: 'monochrome',
    isSilence: true,
    sceneSubject: 'context',
  });
  globalSceneIdx++;

  // 4. CTA / Final Scene — sempre zoom_in @ 1.8: impacto máximo de fechamento
  scenes.push({
    id: uuidv4(),
    text: script.cta,
    visualDescription: `CTA visual: final dramatic scene`,
    cameraMovement: 'zoom_in',
    panZoomSpeed: 1.8,
    rhetoricalWeight: 'critical',
    transitionIn: 'fade', // fechamento
    transitionDurationMs: 300,
    effect: 'normal',
    isSilence: false,
    sceneSubject: 'context',
  });
  globalSceneIdx++;

  // 5. Canon Silence III — fade to black, câmera parada: respirar com a BGM
  scenes.push({
    id: uuidv4(),
    text: '',
    visualDescription: `Final fade to black, cinematic silence, logo background`,
    cameraMovement: 'still',
    panZoomSpeed: 0,
    rhetoricalWeight: 'normal',
    transitionIn: 'fade',
    transitionDurationMs: 600,
    effect: 'monochrome',
    isSilence: true,
    sceneSubject: 'context',
  });

  return scenes;
}

