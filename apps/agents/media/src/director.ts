import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CanonArchetype } from '@cos/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CinematicDirection {
  canonArchetype: CanonArchetype | 'default';
  mood: string;
  pace: 'seco' | 'longo';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    overlayColor: string;
    overlayOpacity: number;
    vignetteColor: string;
  };
  audio: {
    bgmName: string;
    bgmVolume: number;
    voiceTempo: 'slow' | 'measured' | 'normal' | 'fast';
    sfxIntensity: 'heavy' | 'moderate' | 'minimal';
  };
}

const CANON_DIRECTIONS: Record<CanonArchetype, Omit<CinematicDirection, 'canonArchetype'>> = {
  heroi_tragico: {
    mood: 'Culpa + Grandeza. A gravidade de uma falha monumental.',
    colors: {
      primary: '#e8eef7', // Steel blue
      secondary: '#648cc8',
      accent: '#cba6f7', // Lavender accent
      background: '#050810',
      overlayColor: '#0a1628',
      overlayOpacity: 0.25,
      vignetteColor: 'rgba(5, 8, 16, 0.7)',
    },
    audio: {
      bgmName: 'deep_tension.mp3',
      bgmVolume: 0.20,
      voiceTempo: 'slow',
      sfxIntensity: 'minimal',
    },
    pace: 'longo',
  },
  exilado_que_retorna: {
    mood: 'Redenção + Melancolia. Esperança sob luz dourada.',
    colors: {
      primary: '#f5e8c8', // Amber / Warm gold
      secondary: '#c89650',
      accent: '#f9e2af',
      background: '#1a0f05',
      overlayColor: '#3d2010',
      overlayOpacity: 0.25,
      vignetteColor: 'rgba(26, 15, 5, 0.65)',
    },
    audio: {
      bgmName: 'epic_reveal.mp3',
      bgmVolume: 0.25,
      voiceTempo: 'measured',
      sfxIntensity: 'moderate',
    },
    pace: 'seco',
  },
  eterno_segundo: {
    mood: 'Injustiça + Dignidade. A nobreza silenciosa de quem não levou a coroa.',
    colors: {
      primary: '#dde8dd', // Moss green / Worn white
      secondary: '#78a078',
      accent: '#a6e3a1',
      background: '#0d120e',
      overlayColor: '#1a2a1c',
      overlayOpacity: 0.25,
      vignetteColor: 'rgba(13, 18, 14, 0.6)',
    },
    audio: {
      bgmName: 'deep_tension.mp3',
      bgmVolume: 0.18,
      voiceTempo: 'measured',
      sfxIntensity: 'minimal',
    },
    pace: 'longo',
  },
  martir_esquecido: {
    mood: 'Solidão + Legado. O silêncio e paz de uma história oculta.',
    colors: {
      primary: '#e0e0e0', // Monochrome with red accent
      secondary: '#888888',
      accent: '#f38ba8', // Faded red/crimson
      background: '#0a0a0a',
      overlayColor: '#111111',
      overlayOpacity: 0.25,
      vignetteColor: 'rgba(10, 10, 10, 0.75)',
    },
    audio: {
      bgmName: 'deep_tension.mp3',
      bgmVolume: 0.15,
      voiceTempo: 'slow',
      sfxIntensity: 'minimal',
    },
    pace: 'longo',
  },
  momento_impossivel: {
    mood: 'Espanto + Êxtase. Blinding contrast, o instante sobrenatural.',
    colors: {
      primary: '#ffffff', // High contrast cyan/gold
      secondary: '#50c8ff',
      accent: '#89b4fa',
      background: '#020408',
      overlayColor: '#001020',
      overlayOpacity: 0.25,
      vignetteColor: 'rgba(0, 0, 20, 0.5)',
    },
    audio: {
      bgmName: 'epic_reveal.mp3',
      bgmVolume: 0.28,
      voiceTempo: 'normal',
      sfxIntensity: 'heavy',
    },
    pace: 'seco',
  },
};

const DEFAULT_DIRECTION: Omit<CinematicDirection, 'canonArchetype'> = {
  mood: 'Default. Narrativa neutra.',
  colors: {
    primary: '#ffffff',
    secondary: '#aaaaaa',
    accent: '#89b4fa',
    background: '#000000',
    overlayColor: '#000000',
    overlayOpacity: 0.25,
    vignetteColor: 'rgba(0,0,0,0.5)',
  },
  audio: {
    bgmName: 'deep_tension.mp3',
    bgmVolume: 0.20,
    voiceTempo: 'normal',
    sfxIntensity: 'moderate',
  },
  pace: 'seco',
};

const AUDIO_GENES = {
  solene_slow_piano: {
    bgmName: 'solene_slow_piano.mp3',
    bgmVolume: 0.20,
    voiceTempo: 'slow' as const,
    sfxIntensity: 'minimal' as const,
  },
  orchestral_epic: {
    bgmName: 'orchestral_epic.mp3',
    bgmVolume: 0.28,
    voiceTempo: 'normal' as const,
    sfxIntensity: 'heavy' as const,
  },
  epic_reveal: {
    bgmName: 'epic_reveal.mp3',
    bgmVolume: 0.25,
    voiceTempo: 'measured' as const,
    sfxIntensity: 'moderate' as const,
  },
  deep_tension: {
    bgmName: 'deep_tension.mp3',
    bgmVolume: 0.18,
    voiceTempo: 'slow' as const,
    sfxIntensity: 'minimal' as const,
  }
};

const VISUAL_GENES = {
  monochrome_to_warm_90s: {
    primary: '#e8eef7',
    secondary: '#648cc8',
    accent: '#cba6f7',
    background: '#050810',
    overlayColor: '#0a1628',
    overlayOpacity: 0.25,
    vignetteColor: 'rgba(5, 8, 16, 0.7)',
  },
};

function getActiveGeneOption(genes: any, category: string): string | null {
  const categoryGenes = genes[category];
  if (!categoryGenes) return null;

  let bestOption: string | null = null;
  let bestMaturityRank = -1;
  const maturityRanks: Record<string, number> = {
    'Consolidado': 3,
    'Validado': 2,
    'Experimental': 1,
    'Dormant': 0
  };

  for (const [optionName, optionVal] of Object.entries(categoryGenes)) {
    const maturity = (optionVal as any).maturity || 'Dormant';
    const rank = maturityRanks[maturity] ?? 0;
    if (rank > 0 && rank > bestMaturityRank) {
      bestMaturityRank = rank;
      bestOption = optionName;
    }
  }
  return bestOption;
}

export function directNarrative(canonArchetype?: CanonArchetype): CinematicDirection {
  const archetype = canonArchetype || 'default';
  const directionProps = archetype !== 'default' && CANON_DIRECTIONS[archetype]
    ? { ...CANON_DIRECTIONS[archetype] }
    : { ...DEFAULT_DIRECTION };

  // Tenta carregar o DNA de forma robusta
  const dnaPaths = [
    path.resolve(__dirname, '../../../../dna/kairo_dna.json'),
    path.resolve(process.cwd(), 'dna/kairo_dna.json'),
    path.resolve(process.cwd(), '../../../dna/kairo_dna.json')
  ];

  let dna: any = null;
  for (const dnaPath of dnaPaths) {
    if (fs.existsSync(dnaPath)) {
      try {
        dna = JSON.parse(fs.readFileSync(dnaPath, 'utf-8'));
        break;
      } catch (err) {
        console.error(`[Director] Erro ao ler DNA em ${dnaPath}:`, err);
      }
    }
  }

  if (dna && dna.genes) {
    // 1. Sobrescreve áudio com base no gene ativo
    const activeAudioGene = getActiveGeneOption(dna.genes, 'audio_tempo');
    if (activeAudioGene && activeAudioGene in AUDIO_GENES) {
      const audioSettings = AUDIO_GENES[activeAudioGene as keyof typeof AUDIO_GENES];
      console.log(`[Director] Aplicando gene ativo de áudio: "${activeAudioGene}"`);
      directionProps.audio = {
        ...directionProps.audio,
        ...audioSettings
      };
    }

    // 2. Sobrescreve paleta visual com base no gene ativo
    const activeVisualGene = getActiveGeneOption(dna.genes, 'visual_palette');
    if (activeVisualGene && activeVisualGene in VISUAL_GENES) {
      const visualSettings = VISUAL_GENES[activeVisualGene as keyof typeof VISUAL_GENES];
      console.log(`[Director] Aplicando gene ativo visual: "${activeVisualGene}"`);
      directionProps.colors = {
        ...directionProps.colors,
        ...visualSettings
      };
    }
  }

  directionProps.colors.overlayOpacity = Math.min(directionProps.colors.overlayOpacity, 0.25);

  return {
    canonArchetype: archetype,
    ...directionProps,
  };
}
