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
    // Nomes recorrentes no canal — expandir aqui sob demanda
    'kaká', 'kaka', 'baggio', 'ronaldo', 'zidane', 'messi', 'neymar',
    'beckham', 'henry', 'shevchenko', 'inzaghi', 'totti', 'pirlo',
  ];
  if (subjectKeywords.some(kw => lower.includes(kw))) return 'subject';
  return 'context'; // fallback conservador
}

export function planStoryboard(
  script: Script,
  direction: CinematicDirection
): PlannedScene[] {
  const scenes: PlannedScene[] = [];
  const paletteGene = direction.canonArchetype;

  // 1. Hook Scene (TikTok hook, primeiros 15s)
  // Hook é sempre 'context': precisa de energia visual máxima — nunca restringir a abstração.
  scenes.push({
    id: uuidv4(),
    text: script.hook,
    visualDescription: `Hook visual: ${script.body[0]?.visualNote || 'futebol clássico'}`,
    cameraMovement: 'zoom_in',
    transitionIn: 'fade',
    transitionDurationMs: 400,
    // Se o DNA for monocromático a quente, o hook é P&B (monochrome)
    effect: paletteGene === 'heroi_tragico' || paletteGene === 'martir_esquecido' ? 'monochrome' : 'normal',
    isSilence: false,
    sceneSubject: 'context',
  });

  // 2. Body Scenes (Cenas do meio)
  const movements: Array<'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'still'> = [
    'pan_left',
    'pan_right',
    'zoom_out',
    'still',
  ];

  for (let idx = 0; idx < script.body.length; idx++) {
    const section = script.body[idx];
    const movement = movements[idx % movements.length];
    const isExilado = paletteGene === 'exilado_que_retorna';
    const isHeroi = paletteGene === 'heroi_tragico';

    const bodyVisualNote = section.visualNote || `Cena ${idx + 1} de futebol`;
    scenes.push({
      id: uuidv4(),
      text: section.content,
      visualDescription: bodyVisualNote,
      cameraMovement: movement,
      transitionIn: idx === 0 ? 'fade' : 'cut',
      transitionDurationMs: idx === 0 ? 300 : 0,
      effect: isExilado ? 'sepia' : (isHeroi ? 'warm' : 'normal'),
      isSilence: false,
      sceneSubject: classifySceneSubject(bodyVisualNote),
    });

    // Silêncio II — O Silêncio da Pergunta (Pausa após uma pergunta existencial)
    if (section.content.trim().endsWith('?')) {
      scenes.push({
        id: uuidv4(),
        text: '', // Sem locução
        visualDescription: `Pausa dramática (Silêncio II - Pergunta), plano estático da cena anterior`,
        cameraMovement: 'still',
        transitionIn: 'cut',
        transitionDurationMs: 0,
        effect: isExilado ? 'sepia' : (isHeroi ? 'warm' : 'normal'),
        isSilence: true,
        sceneSubject: 'context', // Silêncio: sempre contexto (plano estático de ambiente)
      });
    }
  }

  // 3. Canon Silence I (Silêncio antes do destino - 1.5s antes do CTA/clímax)
  scenes.push({
    id: uuidv4(),
    text: '', // Sem locução
    visualDescription: `Tragic pause, dark blurred stadium background, anticipation`,
    cameraMovement: 'still',
    transitionIn: 'fade',
    transitionDurationMs: 500,
    effect: 'monochrome',
    isSilence: true,
    sceneSubject: 'context', // Silêncio Canon: ambiente, não sujeito
  });

  // 4. CTA / Final Scene
  // CTA é sempre 'context': fechamento com ambiente, nunca abstração de sujeito.
  scenes.push({
    id: uuidv4(),
    text: script.cta,
    visualDescription: `CTA visual: final dramatic scene`,
    cameraMovement: 'zoom_in',
    transitionIn: 'fade',
    transitionDurationMs: 300,
    effect: 'normal',
    isSilence: false,
    sceneSubject: 'context',
  });

  // 5. Canon Silence III (Silêncio final de 2 segundos para respirar com a BGM)
  scenes.push({
    id: uuidv4(),
    text: '', // Sem locução
    visualDescription: `Final fade to black, cinematic silence, logo background`,
    cameraMovement: 'still',
    transitionIn: 'fade',
    transitionDurationMs: 600,
    effect: 'monochrome',
    isSilence: true,
    sceneSubject: 'context', // Silêncio final: fade to black, nunca sujeito
  });

  return scenes;
}
