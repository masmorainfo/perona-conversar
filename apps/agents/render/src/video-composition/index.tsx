import { registerRoot, Composition, Sequence, Audio, Img, AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import React from 'react';
import type { CanonArchetype } from '@cos/types';

// ─── Canon Visual Themes ───────────────────────────────────────────────────────
//
// Cada arquétipo do Canon KAIRO tem uma identidade visual completa:
// paleta, tipografia, atmosfera e comportamento de legendas.
// ─────────────────────────────────────────────────────────────────────────────

interface CanonTheme {
  background: string;
  overlayColor: string;
  overlayOpacity: number;
  captionColor: string;
  captionBackground: string;
  captionBorder: string;
  fontFamily: string;
  fontWeight: number | string;
  fontStyle: 'normal' | 'italic';
  letterSpacing: string;
  textShadow: string;
  vignetteColor: string;
}

const CANON_THEMES: Record<CanonArchetype | 'default', CanonTheme> = {
  // ── O Herói Trágico ── Culpa + Grandeza
  // Tons frios, alto contraste, peso visual máximo
  heroi_tragico: {
    background: '#050810',
    overlayColor: '#0a1628',
    overlayOpacity: 0.45,
    captionColor: '#e8eef7',
    captionBackground: 'rgba(5, 8, 16, 0.85)',
    captionBorder: '1px solid rgba(100, 140, 200, 0.3)',
    fontFamily: '"Georgia", "Times New Roman", serif',
    fontWeight: 700,
    fontStyle: 'normal',
    letterSpacing: '0.02em',
    textShadow: '0 2px 20px rgba(10, 22, 40, 0.9)',
    vignetteColor: 'rgba(5, 8, 16, 0.7)',
  },

  // ── O Exilado que Retorna ── Redenção + Melancolia
  // Âmbar queimado, luz dourada, filme de época
  exilado_que_retorna: {
    background: '#1a0f05',
    overlayColor: '#3d2010',
    overlayOpacity: 0.35,
    captionColor: '#f5e8c8',
    captionBackground: 'rgba(26, 15, 5, 0.80)',
    captionBorder: '1px solid rgba(200, 150, 80, 0.4)',
    fontFamily: '"Georgia", "Palatino Linotype", serif',
    fontWeight: 400,
    fontStyle: 'italic',
    letterSpacing: '0.03em',
    textShadow: '0 2px 16px rgba(26, 15, 5, 0.8)',
    vignetteColor: 'rgba(26, 15, 5, 0.65)',
  },

  // ── O Eterno Segundo ── Injustiça + Dignidade
  // Verde musgo desgastado, clean, sem ostentação
  eterno_segundo: {
    background: '#0d120e',
    overlayColor: '#1a2a1c',
    overlayOpacity: 0.30,
    captionColor: '#dde8dd',
    captionBackground: 'rgba(13, 18, 14, 0.82)',
    captionBorder: '1px solid rgba(120, 160, 120, 0.25)',
    fontFamily: '"Helvetica Neue", "Arial", sans-serif',
    fontWeight: 300,
    fontStyle: 'normal',
    letterSpacing: '0.06em',
    textShadow: '0 1px 10px rgba(0,0,0,0.7)',
    vignetteColor: 'rgba(13, 18, 14, 0.6)',
  },

  // ── O Mártir Esquecido ── Solidão + Legado
  // Quase monocromático, toque único de vermelho, silêncio visual
  martir_esquecido: {
    background: '#0a0a0a',
    overlayColor: '#111111',
    overlayOpacity: 0.50,
    captionColor: '#e0e0e0',
    captionBackground: 'rgba(10, 10, 10, 0.88)',
    captionBorder: '1px solid rgba(180, 30, 30, 0.5)',
    fontFamily: '"Georgia", serif',
    fontWeight: 400,
    fontStyle: 'normal',
    letterSpacing: '0.08em',
    textShadow: '0 2px 12px rgba(0,0,0,0.95)',
    vignetteColor: 'rgba(10, 10, 10, 0.75)',
  },

  // ── O Momento Impossível ── Espanto + Êxtase
  // Luz estourada, elétrico, explosivo
  momento_impossivel: {
    background: '#020408',
    overlayColor: '#001020',
    overlayOpacity: 0.20,
    captionColor: '#ffffff',
    captionBackground: 'rgba(0, 10, 30, 0.75)',
    captionBorder: '1px solid rgba(80, 200, 255, 0.5)',
    fontFamily: '"Helvetica Neue", "Arial Black", sans-serif',
    fontWeight: 900,
    fontStyle: 'normal',
    letterSpacing: '0.01em',
    textShadow: '0 0 30px rgba(80, 200, 255, 0.4), 0 2px 8px rgba(0,0,0,0.9)',
    vignetteColor: 'rgba(0, 0, 20, 0.5)',
  },

  // ── Default ── Fallback para canais sem arquétipo Canon
  default: {
    background: '#000000',
    overlayColor: '#000000',
    overlayOpacity: 0.35,
    captionColor: '#ffffff',
    captionBackground: 'rgba(0, 0, 0, 0.70)',
    captionBorder: 'none',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: 700,
    fontStyle: 'normal',
    letterSpacing: '0em',
    textShadow: '0px 4px 8px rgba(0,0,0,0.5)',
    vignetteColor: 'rgba(0,0,0,0.5)',
  },
};

// ─── Vinheta (Vignette) ────────────────────────────────────────────────────────
// Bordas escurecidas que criam profundidade cinematográfica

const Vignette: React.FC<{ color: string }> = ({ color }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, transparent 40%, ${color} 100%)`,
      pointerEvents: 'none',
    }}
  />
);

// ─── Overlay Atmosférico ───────────────────────────────────────────────────────

const AtmosphericOverlay: React.FC<{ color: string; opacity: number }> = ({ color, opacity }) => (
  <AbsoluteFill
    style={{
      backgroundColor: color,
      opacity,
      pointerEvents: 'none',
      mixBlendMode: 'multiply',
    }}
  />
);

// ─── Word Timestamp type (mirrors @cos/llm WordTimestamp) ──────────────────────
interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
}

// ─── Legenda Animada ───────────────────────────────────────────────────────────
// Uses real word-level timestamps from ElevenLabs when available.
// Falls back to the uniform 4-word segment split when timestamps are absent.

const AnimatedCaption: React.FC<{
  text: string;
  theme: CanonTheme;
  localFrame: number;
  totalDurationInFrames: number;
  wordTimestamps?: WordTimestamp[];
}> = ({ text, theme, localFrame, totalDurationInFrames, wordTimestamps }) => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const FPS = 30; // Remotion default
  const currentTimeMs = (localFrame / FPS) * 1000;

  let activeSegment: string;
  let segmentLocalFrame: number;

  if (wordTimestamps && wordTimestamps.length > 0) {
    // ─── Timestamp-driven mode (ElevenLabs) ──────────────────────────────
    // Group words into segments of ~4 that share a time window,
    // but use real timestamps to determine which segment is active.
    const SEGMENT_SIZE = 4;
    const totalSegments = Math.ceil(wordTimestamps.length / SEGMENT_SIZE);

    // Find which segment is active based on real audio timing
    let activeIndex = totalSegments - 1;
    for (let s = 0; s < totalSegments; s++) {
      const segEnd = s + 1 < totalSegments
        ? wordTimestamps[Math.min((s + 1) * SEGMENT_SIZE, wordTimestamps.length - 1)].startMs
        : wordTimestamps[wordTimestamps.length - 1].endMs + 500;
      if (currentTimeMs < segEnd) {
        activeIndex = s;
        break;
      }
    }

    const startIdx = activeIndex * SEGMENT_SIZE;
    activeSegment = wordTimestamps
      .slice(startIdx, startIdx + SEGMENT_SIZE)
      .map(w => w.word)
      .join(' ');

    // Calculate local frame within this segment for animation
    const segStartMs = wordTimestamps[startIdx].startMs;
    segmentLocalFrame = Math.max(0, Math.round(((currentTimeMs - segStartMs) / 1000) * FPS));
  } else {
    // ─── Legacy uniform mode (Edge-TTS / OpenAI) ─────────────────────────
    const SEGMENT_SIZE = 4;
    const totalSegments = Math.ceil(words.length / SEGMENT_SIZE);
    const framesPerSegment = Math.max(8, Math.floor(totalDurationInFrames / totalSegments));

    const currentSegmentIndex = Math.min(
      totalSegments - 1,
      Math.floor(localFrame / framesPerSegment)
    );

    const startIndex = currentSegmentIndex * SEGMENT_SIZE;
    activeSegment = words.slice(startIndex, startIndex + SEGMENT_SIZE).join(' ');
    segmentLocalFrame = localFrame - (currentSegmentIndex * framesPerSegment);
  }

  // Animação suave quando o segmento muda (spring-like scale/fade)
  const scale = interpolate(segmentLocalFrame, [0, 4], [0.92, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(segmentLocalFrame, [0, 3], [0.3, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 480,
        left: 20,
        right: 20,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          color: theme.captionColor,
          fontSize: 64,
          fontFamily: theme.fontFamily,
          fontWeight: 900,
          fontStyle: theme.fontStyle,
          letterSpacing: '0.01em',
          textShadow: '0 4px 12px rgba(0, 0, 0, 0.95), 0 0 20px rgba(0, 0, 0, 0.7)',
          lineHeight: 1.2,
          maxWidth: '95%',
          display: 'inline-block',
          transform: `scale(${scale})`,
          opacity,
          textTransform: 'uppercase',
        }}
      >
        {activeSegment}
      </span>
    </div>
  );
};

// ─── Componente de Seção (Legado) ──────────────────────────────────────────────────────

interface VideoSection {
  text: string;
  imageUrl: string;
  audioUrl: string;
  durationInFrames: number;
}

const VideoSectionFrame: React.FC<{
  section: VideoSection;
  theme: CanonTheme;
}> = ({ section, theme }) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, section.durationInFrames], [1.0, 1.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        <Img
          src={section.imageUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
      <AtmosphericOverlay color={theme.overlayColor} opacity={theme.overlayOpacity} />
      <Vignette color={theme.vignetteColor} />
      <Audio src={section.audioUrl} />
      <AnimatedCaption
        text={section.text}
        theme={theme}
        localFrame={frame}
        totalDurationInFrames={section.durationInFrames}
      />
    </AbsoluteFill>
  );
};

// ─── Componente de Cena do Manifesto (Novo Cinematic Engine) ──────────────────────────

interface TechnicalScene {
  id: string;
  durationInFrames: number;
  layout: {
    type: 'fullscreen';
    mediaUrl: string;
    narrationUrl?: string;
    panZoomSpeed?: number;
    effect?: 'monochrome' | 'warm' | 'normal' | 'sepia';
    cameraMovement?: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'still';
  };
  captions: {
    text: string;
    wordTimestamps?: WordTimestamp[];
  };
}

const SceneFrame: React.FC<{
  scene: TechnicalScene;
  theme: CanonTheme;
}> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, layout, captions } = scene;
  const movement = layout.cameraMovement || 'zoom_in';

  // 1. Calcular Movimentos de Câmera (Pan / Zoom)
  let scale = 1.0;
  let translateX = 0;

  if (movement === 'zoom_in') {
    scale = interpolate(frame, [0, durationInFrames], [1.0, 1.18], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (movement === 'zoom_out') {
    scale = interpolate(frame, [0, durationInFrames], [1.18, 1.0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (movement === 'pan_left') {
    scale = 1.12; // Leve zoom para não mostrar bordas ao mover
    translateX = interpolate(frame, [0, durationInFrames], [25, -25], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (movement === 'pan_right') {
    scale = 1.12;
    translateX = interpolate(frame, [0, durationInFrames], [-25, 25], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (movement === 'still') {
    scale = 1.05;
  }

  // 2. Mapear Efeito / Filtro Visual
  let cssFilter = 'none';
  if (layout.effect === 'monochrome') {
    cssFilter = 'grayscale(100%) contrast(1.18) brightness(0.95)';
  } else if (layout.effect === 'sepia') {
    cssFilter = 'sepia(80%) contrast(0.95) brightness(0.90)';
  } else if (layout.effect === 'warm') {
    cssFilter = 'sepia(30%) saturate(1.25) contrast(1.05) brightness(0.95)';
  }

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      {/* Imagem com movimento e filtros de cor */}
      <AbsoluteFill style={{ 
        transform: `scale(${scale}) translateX(${translateX}px)`, 
        transformOrigin: 'center center',
        transition: 'transform 0.1s linear'
      }}>
        <Img
          src={layout.mediaUrl}
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            filter: cssFilter 
          }}
        />
      </AbsoluteFill>
 
      {/* Overlay atmosférico */}
      <AtmosphericOverlay color={theme.overlayColor} opacity={theme.overlayOpacity} />
 
      {/* Vinheta cinematográfica */}
      <Vignette color={theme.vignetteColor} />
 
      {/* Áudio da Narração / Locução se houver */}
      {layout.narrationUrl && <Audio src={layout.narrationUrl} />}
 
      {/* Legendas com fade-in */}
      {captions.text && (
        <AnimatedCaption
          text={captions.text}
          theme={theme}
          localFrame={frame}
          totalDurationInFrames={durationInFrames}
          wordTimestamps={captions.wordTimestamps}
        />
      )}
    </AbsoluteFill>
  );
};

// ─── Composição Principal ──────────────────────────────────────────────────────

interface MainVideoProps {
  sections?: VideoSection[];
  scenes?: TechnicalScene[];
  globalStyle?: any;
  audioContext?: {
    bgmUrl?: string;
    bgmVolume?: number;
  };
  canonArchetype?: CanonArchetype;
}

export const MainVideo: React.FC<MainVideoProps> = ({ 
  sections = [], 
  scenes = [], 
  globalStyle,
  audioContext,
  canonArchetype 
}) => {
  const theme = (canonArchetype && CANON_THEMES[canonArchetype])
    ? CANON_THEMES[canonArchetype]
    : CANON_THEMES['default'];

  // Caso 1: Renderizar a partir do novo Storyboard/RenderManifest
  if (scenes && scenes.length > 0) {
    let currentFrame = 0;
    return (
      <AbsoluteFill style={{ backgroundColor: theme.background }}>
        {/* Tocar Trilha Sonora (BGM) global com o volume configurado */}
        {audioContext && audioContext.bgmUrl && (
          <Audio 
            src={audioContext.bgmUrl} 
            volume={audioContext.bgmVolume ?? 0.20} 
            loop 
          />
        )}

        {scenes.map((scene, idx) => {
          const from = currentFrame;
          currentFrame += scene.durationInFrames;

          return (
            <Sequence
              key={scene.id || idx}
              from={from}
              durationInFrames={scene.durationInFrames}
            >
              <SceneFrame scene={scene} theme={theme} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  // Caso 2: Fallback para a renderização linear antiga
  let currentFrame = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      {sections.map((section, idx) => {
        const from = currentFrame;
        currentFrame += section.durationInFrames;

        return (
          <Sequence
            key={idx}
            from={from}
            durationInFrames={section.durationInFrames}
          >
            <VideoSectionFrame section={section} theme={theme} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// ─── Root ──────────────────────────────────────────────────────────────────────

export const VideoRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={MainVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        sections: [],
        scenes: [],
        audioContext: {
          bgmUrl: undefined,
          bgmVolume: 0.20,
        },
        canonArchetype: undefined,
      }}
    />
  );
};

registerRoot(VideoRoot);
