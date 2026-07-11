/**
 * ==============================================================================
 * VISUAL IDENTITY ENGINE (VIE)
 * ==============================================================================
 * A arquitetura é dividida em duas camadas:
 * 
 * 1. Channel Visual DNA (Semântico): Regras de alto nível, arquétipos e tom,
 *    armazenados na configuração do Canal. Descreve a intenção.
 * 
 * 2. Render Manifest (Técnico): Instruções exatas e pragmáticas (efeitos, 
 *    velocidades, posições, hex colors) consumidas pelo Remotion.
 * 
 * O VIE atua como um Diretor de Arte: lê o DNA + Roteiro + Mídia, e gera o Manifest.
 * ==============================================================================
 */

// ─── 1. CHANNEL VISUAL DNA (Semântica e Intenção) ─────────────────────────────

export type VisualAesthetic = 
  | 'minimalist-educational' 
  | 'cyberpunk-documentary' 
  | 'neon-gaming' 
  | 'corporate-news' 
  | 'brutalist-critique' 
  | 'cinematic-vlog'

export interface DnaTypography {
  tone: 'loud-and-intrusive' | 'elegant-and-subtle' | 'playful-and-bouncy' | 'minimalist-functional'
  hierarchy: 'high-contrast' | 'balanced' | 'flat'
}

export interface DnaMotion {
  pacing: 'anxious-and-fast' | 'calm-and-breathing' | 'dynamic-storyteller'
  energy: 'explosive' | 'smooth' | 'mechanical' | 'organic'
}

export interface DnaBranding {
  presence: 'omnipresent' | 'subtle' | 'intro-outro-only'
  primaryAtmosphere: string // Base tone describing the vibe (e.g., 'dark and moody blue')
  accentPresence: string    // What pops? (e.g., 'high contrast neon pink')
  signatureElement?: string // e.g., "A recurring glitch motif"
}

export interface DnaLayout {
  focus: 'host-centric' | 'media-centric' | 'split-balanced' | 'text-heavy'
  density: 'cluttered-and-informative' | 'spacious-and-clean'
}

export interface DnaAudio {
  soundscapeVibe: string    // e.g., 'lofi hip hop with rainy texture'
  sfxIntensity: 'heavy' | 'moderate' | 'minimal'
  fixedBgmUrl?: string
  fixedSfxUrls?: Record<string, string>
}

export interface DnaPlatform {
  primaryOrientation: 'vertical' | 'horizontal' | 'square'
  attentionSpan: 'short-form' | 'long-form'
}

export interface DnaStorytelling {
  sceneRhythm: 'rapid-fire' | 'slow-build' | 'steady-flow'
  averageCutDuration: 'very-short' | 'moderate' | 'long-takes'
  bRollFrequency: 'constant' | 'occasional' | 'rare'
  captionDensity: 'word-by-word' | 'full-sentences' | 'key-points-only' | 'none'
}

/**
 * O DNA Visual do Canal — As regras de alto nível que descrevem
 * como o canal se apresenta. O VIE usa isso como base para decidir
 * como um roteiro específico será renderizado.
 */
export interface ChannelVisualDNA {
  aesthetic: VisualAesthetic
  typography: DnaTypography
  motion: DnaMotion
  branding: DnaBranding
  layout: DnaLayout
  audio: DnaAudio
  platform: DnaPlatform
  storytelling: DnaStorytelling
}

export type VisualPresetId = 
  | 'preset:editorial'
  | 'preset:documentary'
  | 'preset:gaming'
  | 'preset:news'
  | 'preset:entertainment'

// Override que o canal aplica sobre o Preset
export type VisualDNAOverrides = DeepPartial<ChannelVisualDNA>


// ─── 2. RENDER MANIFEST (Instruções Técnicas para o Remotion) ────────────────

export interface TechnicalColorPalette {
  primary: string // Hex code
  secondary: string
  accent: string
  background: string
}

export interface TechnicalTypography {
  fontFamily: string
  fontWeight: string | number
  baseFontSizePx: number
  lineHeight: number
}

export interface TechnicalTransition {
  type: 'fade' | 'cut' | 'wipe' | 'glitch' | 'slide'
  durationMs: number
}

export interface TechnicalSceneProps {
  id: string
  durationMs: number
  transitionIn: TechnicalTransition
  
  layout: {
    type: 'fullscreen' | 'split-vertical' | 'split-horizontal' | 'pip'
    mediaUrl: string
    secondaryMediaUrl?: string
    panZoomSpeed?: number // 0 for no movement
    /** Onda C: peso retórico propagado do storyboard para decisões de render. */
    rhetoricalWeight?: 'normal' | 'emphasis' | 'critical'
  }
  
  captions: {
    text: string
    style: 'karaoke' | 'typewriter' | 'solid'
    positionX: number
    positionY: number
  }
  
  overlays: {
    type: 'title' | 'lower-third' | 'sticker' | 'b-roll'
    contentUrl?: string
    text?: string
    enterAnimation: 'slide' | 'fade' | 'pop' | 'none'
  }[]
}

/**
 * O catálogo exato de efeitos e disposições gerado dinamicamente.
 * Este é o payload final que o Remotion executa.
 */
export interface RenderManifest {
  videoId: string
  masterOrientation: 'vertical' | 'horizontal' | 'square'
  
  globalStyle: {
    palette: TechnicalColorPalette
    typography: TechnicalTypography
    logoUrl?: string
    safeAreasEnabled: boolean
  }
  
  audioContext: {
    bgmUrl: string
    bgmVolume: number // 0 a 1
    sfxEvents: { timestampMs: number; url: string; volume: number }[]
    /** Onda C: duração total do vídeo em ms — usado pelo masterAudio() para calcular fade-out da BGM. */
    totalDurationMs?: number
  }
  
  scenes: TechnicalSceneProps[]
}


// ─── 3. O MOTOR VIE (Visual Identity Engine) ──────────────────────────────────

import type { Script } from './index'

/**
 * Assinatura do motor que traduz Conteúdo + DNA em Instruções de Renderização.
 */
export interface VisualIdentityEngine {
  generateManifest(
    script: Script,
    mediaAssets: Record<string, string>,
    channelDna: ChannelVisualDNA
  ): Promise<RenderManifest>
}


// ─── UTILS ────────────────────────────────────────────────────────────────────
export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;
