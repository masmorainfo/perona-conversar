import type { CanonArchetype } from '@cos/types';

export interface CinematicDirection {
  canonArchetype: CanonArchetype | 'default';
  mood: string;
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
      overlayOpacity: 0.45,
      vignetteColor: 'rgba(5, 8, 16, 0.7)',
    },
    audio: {
      bgmName: 'heroi_tragico_piano.mp3',
      bgmVolume: 0.20,
      voiceTempo: 'slow',
      sfxIntensity: 'minimal',
    },
  },
  exilado_que_retorna: {
    mood: 'Redenção + Melancolia. Esperança sob luz dourada.',
    colors: {
      primary: '#f5e8c8', // Amber / Warm gold
      secondary: '#c89650',
      accent: '#f9e2af',
      background: '#1a0f05',
      overlayColor: '#3d2010',
      overlayOpacity: 0.35,
      vignetteColor: 'rgba(26, 15, 5, 0.65)',
    },
    audio: {
      bgmName: 'exilado_arpeggio.mp3',
      bgmVolume: 0.25,
      voiceTempo: 'measured',
      sfxIntensity: 'moderate',
    },
  },
  eterno_segundo: {
    mood: 'Injustiça + Dignidade. A nobreza silenciosa de quem não levou a coroa.',
    colors: {
      primary: '#dde8dd', // Moss green / Worn white
      secondary: '#78a078',
      accent: '#a6e3a1',
      background: '#0d120e',
      overlayColor: '#1a2a1c',
      overlayOpacity: 0.30,
      vignetteColor: 'rgba(13, 18, 14, 0.6)',
    },
    audio: {
      bgmName: 'eterno_segundo_chamber.mp3',
      bgmVolume: 0.18,
      voiceTempo: 'measured',
      sfxIntensity: 'minimal',
    },
  },
  martir_esquecido: {
    mood: 'Solidão + Legado. O silêncio e paz de uma história oculta.',
    colors: {
      primary: '#e0e0e0', // Monochrome with red accent
      secondary: '#888888',
      accent: '#f38ba8', // Faded red/crimson
      background: '#0a0a0a',
      overlayColor: '#111111',
      overlayOpacity: 0.50,
      vignetteColor: 'rgba(10, 10, 10, 0.75)',
    },
    audio: {
      bgmName: 'martir_solitude.mp3',
      bgmVolume: 0.15,
      voiceTempo: 'slow',
      sfxIntensity: 'minimal',
    },
  },
  momento_impossivel: {
    mood: 'Espanto + Êxtase. Blinding contrast, o instante sobrenatural.',
    colors: {
      primary: '#ffffff', // High contrast cyan/gold
      secondary: '#50c8ff',
      accent: '#89b4fa',
      background: '#020408',
      overlayColor: '#001020',
      overlayOpacity: 0.20,
      vignetteColor: 'rgba(0, 0, 20, 0.5)',
    },
    audio: {
      bgmName: 'momento_impossivel_epic.mp3',
      bgmVolume: 0.28,
      voiceTempo: 'normal',
      sfxIntensity: 'heavy',
    },
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
    overlayOpacity: 0.35,
    vignetteColor: 'rgba(0,0,0,0.5)',
  },
  audio: {
    bgmName: 'default_music.mp3',
    bgmVolume: 0.20,
    voiceTempo: 'normal',
    sfxIntensity: 'moderate',
  },
};

export function directNarrative(canonArchetype?: CanonArchetype): CinematicDirection {
  const archetype = canonArchetype || 'default';
  const directionProps = archetype !== 'default' && CANON_DIRECTIONS[archetype]
    ? CANON_DIRECTIONS[archetype]
    : DEFAULT_DIRECTION;

  return {
    canonArchetype: archetype,
    ...directionProps,
  };
}
