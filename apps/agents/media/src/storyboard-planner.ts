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
}

export function planStoryboard(
  script: Script,
  direction: CinematicDirection
): PlannedScene[] {
  const scenes: PlannedScene[] = [];
  const paletteGene = direction.canonArchetype;

  // 1. Hook Scene (TikTok hook, primeiros 15s)
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

    scenes.push({
      id: uuidv4(),
      text: section.content,
      visualDescription: section.visualNote || `Cena ${idx + 1} de futebol`,
      cameraMovement: movement,
      transitionIn: idx === 0 ? 'fade' : 'cut',
      transitionDurationMs: idx === 0 ? 300 : 0,
      effect: paletteGene === 'exilado_que_retorna' ? 'sepia' : (paletteGene === 'heroi_tragico' ? 'warm' : 'normal'),
      isSilence: false,
    });
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
  });

  // 4. CTA / Final Scene
  scenes.push({
    id: uuidv4(),
    text: script.cta,
    visualDescription: `CTA visual: final dramatic scene`,
    cameraMovement: 'zoom_in',
    transitionIn: 'fade',
    transitionDurationMs: 300,
    effect: 'normal',
    isSilence: false,
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
  });

  return scenes;
}
