import fs from 'fs';
import path from 'path';
import type { RenderManifest, TechnicalSceneProps, CanonArchetype } from '@cos/types';
import type { VoiceProvider, ImageProvider } from '@cos/llm';
import type { CinematicDirection } from './director.js';
import type { PlannedScene } from './storyboard-planner.js';

interface MemoryAsset {
  filename: string;
  tags: string[];
  description: string;
}

interface MemoryIndexV2 {
  version: number;
  assets: MemoryAsset[];
}

interface AssetMatch {
  asset: MemoryAsset;
  fullPath: string;
  score: number;
}

// Palavras comuns removidas da tokenização para evitar matches falso-positivos
const STOP_WORDS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'em', 'um', 'uma', 'para', 'com', 'que',
  'the', 'of', 'and', 'in', 'to', 'for', 'is', 'on', 'at', 'by', 'an',
  'visual', 'cena', 'scene', 'plano', 'shot', 'dramatic', 'pause', 'hook',
  'futebol', 'football', 'soccer', 'background', 'clássico', 'classic',
]);

const MATCH_THRESHOLD = 0.15; // score mínimo para considerar um match autêntico

export class MemoryProvider {
  private memoriesDir: string;
  private assets: MemoryAsset[] = [];

  constructor() {
    this.memoriesDir = path.resolve(process.cwd(), '../../../packages/knowledge/memories');
    this.initializeMemoriesIndex();
  }

  private initializeMemoriesIndex() {
    try {
      if (!fs.existsSync(this.memoriesDir)) {
        fs.mkdirSync(this.memoriesDir, { recursive: true });
      }

      const indexPath = path.join(this.memoriesDir, 'index.json');
      if (!fs.existsSync(indexPath)) {
        const emptyIndex: MemoryIndexV2 = { version: 2, assets: [] };
        fs.writeFileSync(indexPath, JSON.stringify(emptyIndex, null, 2), 'utf-8');
        this.assets = [];
        return;
      }

      const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      // Auto-migrate v1 → v2
      if (!raw.version || raw.version < 2) {
        console.log('[Memory Provider] Migrando index.json v1 → v2...');
        const migrated: MemoryAsset[] = [];
        for (const [key, filename] of Object.entries(raw)) {
          if (key === 'version' || key === 'assets') continue;
          migrated.push({
            filename: filename as string,
            tags: key.toLowerCase().split(/\s+/),
            description: key,
          });
        }
        const v2: MemoryIndexV2 = { version: 2, assets: migrated };
        fs.writeFileSync(indexPath, JSON.stringify(v2, null, 2), 'utf-8');
        this.assets = migrated;
        console.log(`[Memory Provider] Migração concluída: ${migrated.length} assets.`);
      } else {
        this.assets = (raw as MemoryIndexV2).assets || [];
      }

      console.log(`[Memory Provider] Índice carregado: ${this.assets.length} assets.`);
    } catch (err) {
      console.warn('[Memory Provider] Não foi possível ler ou criar índice de memórias:', err);
    }
  }

  /**
   * Tokeniza uma string em termos relevantes (stop-words removidas).
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-záàâãéèêíïóôõúüç0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }

  /**
   * Busca assets autênticos por overlap semântico de tokens.
   * Retorna matches acima do threshold, ordenados por score decrescente.
   */
  private findAuthenticAssets(visualDescription: string): AssetMatch[] {
    const queryTokens = this.tokenize(visualDescription);
    if (queryTokens.length === 0) return [];

    const matches: AssetMatch[] = [];

    for (const asset of this.assets) {
      const assetTokens = new Set([
        ...asset.tags.map(t => t.toLowerCase()),
        ...this.tokenize(asset.description),
      ]);

      const overlap = queryTokens.filter(t => assetTokens.has(t)).length;
      const score = overlap / queryTokens.length;

      if (score >= MATCH_THRESHOLD) {
        const fullPath = path.join(this.memoriesDir, asset.filename);
        if (fs.existsSync(fullPath)) {
          matches.push({ asset, fullPath, score });
        }
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Decide a fonte visual para uma cena: ativo autêntico ou fallback IA.
   * Log explícito do motivo da decisão.
   */
  private resolveVisualSource(
    visualDescription: string,
    sceneIndex: number
  ): { mediaPath: string; isAiFallback: boolean } {
    const matches = this.findAuthenticAssets(visualDescription);

    if (matches.length > 0) {
      const best = matches[0];
      console.log(
        `[Memory Provider] 🟢 AUTÊNTICO cena ${sceneIndex}: "${best.asset.filename}" ` +
        `(score: ${best.score.toFixed(2)}, tags: [${best.asset.tags.join(', ')}])`
      );
      return { mediaPath: best.fullPath, isAiFallback: false };
    }

    console.log(
      `[Memory Provider] 🟡 FALLBACK IA cena ${sceneIndex}: nenhum match acima de ${MATCH_THRESHOLD} ` +
      `para "${visualDescription.substring(0, 80)}..."`
    );
    return { mediaPath: `ai_visual:${sceneIndex}`, isAiFallback: true };
  }

  /**
   * Auxiliar simples para ffprobe para medir a duração exata do áudio
   */
  private getAudioDurationMs(audioPath: string): number {
    try {
      const stats = fs.statSync(audioPath);
      if (stats.size <= 10) return 5000;
      
      const { execSync } = require('child_process');
      const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
      const output = execSync(command, { encoding: 'utf-8' }).trim();
      const durationSeconds = parseFloat(output);
      if (isNaN(durationSeconds)) return 5000;
      return Math.ceil(durationSeconds * 1000);
    } catch (err) {
      return 5000; // Fallback de 5s
    }
  }

  /**
   * Constrói o manifesto conceitual puro (sem side-effects de IA) priorizando mídias reais.
   */
  public async buildConceptManifest(
    contentId: string,
    channelId: string,
    plannedScenes: PlannedScene[],
    direction: CinematicDirection
  ): Promise<RenderManifest> {
    console.log(`[Memory Provider] Construindo manifesto conceitual para unit: ${contentId}`);

    const scenes: TechnicalSceneProps[] = [];

    for (let idx = 0; idx < plannedScenes.length; idx++) {
      const pScene = plannedScenes[idx];
      const sceneId = pScene.id;

      let mediaPath = '';
      let narrationPath = '';
      let durationMs = 3000; // Default

      // 1. Resolver Narrativo / Áudio Conceitualmente
      if (pScene.isSilence) {
        durationMs = idx === plannedScenes.length - 1 ? 2000 : 1500;
      } else {
        // Marcador para geração física futura
        narrationPath = `ai_narration:${idx}`;
        // Estimativa inicial de tempo (aproximadamente 3 palavras por segundo + 1s margem)
        const wordCount = pScene.text.split(/\s+/).filter(Boolean).length;
        durationMs = Math.max(3000, Math.ceil((wordCount / 3) * 1000) + 1000);
      }

      // 2. Resolver Mídia Visual (Autêntica ou Fallback)
      const visualSource = this.resolveVisualSource(pScene.visualDescription, idx);
      mediaPath = visualSource.mediaPath;

      const aiPrompt = direction.canonArchetype !== 'default'
        ? this.buildArchetypePrompt(direction.canonArchetype as any, pScene.visualDescription)
        : `Cinematic sports photography, clean composition, vertical 9:16. Subject: ${pScene.visualDescription}`;

      // 3. Montar a TechnicalSceneProps
      scenes.push({
        id: sceneId,
        durationMs,
        transitionIn: {
          type: pScene.transitionIn,
          durationMs: pScene.transitionDurationMs,
        },
        layout: {
          type: 'fullscreen',
          mediaUrl: mediaPath,
          panZoomSpeed: pScene.cameraMovement === 'still' ? 0 : 1.15,
          effect: pScene.effect as any,
          ...(narrationPath ? { narrationPath } : {}),
          cameraMovement: pScene.cameraMovement,
          aiPrompt, // Guarda o prompt para síntese futura
          isAiFallback: visualSource.isAiFallback
        } as any,
        captions: {
          text: pScene.text,
          style: 'karaoke',
          positionX: 50,
          positionY: 85,
        },
        overlays: [],
      });
    }

    const manifest: RenderManifest = {
      videoId: `${channelId}_${contentId}`,
      masterOrientation: 'vertical',
      globalStyle: {
        palette: {
          primary: direction.colors.primary,
          secondary: direction.colors.secondary,
          accent: direction.colors.accent,
          background: direction.colors.background,
        },
        typography: {
          fontFamily: direction.colors.primary === '#e8eef7' ? 'Georgia' : 'Arial',
          fontWeight: 700,
          baseFontSizePx: 48,
          lineHeight: 1.3,
        },
        safeAreasEnabled: true,
      },
      audioContext: {
        bgmUrl: direction.audio.bgmName,
        bgmVolume: direction.audio.bgmVolume,
        sfxEvents: [],
      },
      scenes,
    };

    return manifest;
  }

  /**
   * Executa a síntese física dos ativos de IA (geração de imagens e vozes) pendentes.
   */
  public async synthesizeAssets(
    manifest: RenderManifest,
    voiceProvider: VoiceProvider,
    imageProvider: ImageProvider,
    assetsDir: string
  ): Promise<{ manifest: RenderManifest; assetUrls: Record<string, string> }> {
    console.log(`[Memory Provider] Iniciando síntese física de ativos para unit: ${manifest.videoId}`);
    const assetUrls: Record<string, string> = {};

    // Garante que o diretório de assets exista
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    for (let idx = 0; idx < manifest.scenes.length; idx++) {
      const scene = manifest.scenes[idx];
      const layout = scene.layout as any;

      // 1. Gera locução se necessário
      if (layout.narrationPath && layout.narrationPath.startsWith('ai_narration:')) {
        const audioFile = path.join(assetsDir, `voiceover_scene_${idx}.mp3`);
        console.log(`[Memory Provider] [IA Speech] Gerando áudio para cena ${idx + 1}...`);
        await voiceProvider.generateSpeech(scene.captions.text, audioFile);
        layout.narrationPath = audioFile;
        assetUrls[`voiceover_scene_${idx}`] = audioFile;

        // Atualiza para a duração real do áudio gravado
        scene.durationMs = this.getAudioDurationMs(audioFile);
      }

      // 2. Gera imagem de IA se necessário
      if (layout.mediaUrl && layout.mediaUrl.startsWith('ai_visual:')) {
        const visualFile = path.join(assetsDir, `visual_scene_${idx}.jpg`);
        console.log(`[Memory Provider] [IA Visual] Gerando imagem para cena ${idx + 1}...`);
        await imageProvider.generateImage(layout.aiPrompt, visualFile);
        layout.mediaUrl = visualFile;
        assetUrls[`visual_scene_${idx}`] = visualFile;
      } else if (layout.mediaUrl && fs.existsSync(layout.mediaUrl)) {
        // Se for arquivo autêntico existente localmente, associa para compatibilidade
        assetUrls[`visual_scene_${idx}`] = layout.mediaUrl;
      }
    }

    return { manifest, assetUrls };
  }

  private buildArchetypePrompt(archetype: CanonArchetype, description: string): string {
    const styles: Record<CanonArchetype, string> = {
      heroi_tragico: `Cinematic sports photography, extreme chiaroscuro lighting, deep black shadows, steel blue and charcoal gray tones. Lone tragic figure, sweat and exhaustion. Influenced by Sebastião Salgado's trágica dignidade. Vertical 9:16, photorealistic. Subject: ${description}`,
      exilado_que_retorna: `Warm cinematic gold hour photography, amber sepia color grade, soft flare, foggy stadium background. Lone silhouette walking towards stadium lights. Melancholy hope. Vertical 9:16. Subject: ${description}`,
      eterno_segundo: `Quiet desaturated sports documentary photo, muted tones, moss green and concrete grey. A player watching others celebrate. Dignified sorrow, clean composition. Vertical 9:16. Subject: ${description}`,
      martir_esquecido: `Near monochrome stark photography. Almost pure black and white with a single deliberate rich red/crimson accent. Forgotten weathered face or empty locker room bench. Sacred silence. Vertical 9:16. Subject: ${description}`,
      momento_impossivel: `High energy explosive sports photography, overexposed glowing stadium lights, electric cyan and gold highlights. A player frozen in mid-air defying gravity, high motion blur around. Ecstatic surprise. Vertical 9:16. Subject: ${description}`,
    };
    return styles[archetype] || description;
  }
}
