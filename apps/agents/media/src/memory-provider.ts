import fs from 'fs';
import path from 'path';
import type { RenderManifest, TechnicalSceneProps, CanonArchetype } from '@cos/types';
import type { VoiceProvider, ImageProvider } from '@cos/llm';
import type { CinematicDirection } from './director.js';
import type { PlannedScene } from './storyboard-planner.js';

export class MemoryProvider {
  private memoriesDir: string;
  private memoriesIndex: Record<string, string> = {};

  constructor() {
    // Definimos o local da pasta de memórias autênticas
    this.memoriesDir = path.resolve(process.cwd(), '../../../packages/knowledge/memories');
    this.initializeMemoriesIndex();
  }

  private initializeMemoriesIndex() {
    try {
      // Garante que o diretório exista
      if (!fs.existsSync(this.memoriesDir)) {
        fs.mkdirSync(this.memoriesDir, { recursive: true });
      }

      const indexPath = path.join(this.memoriesDir, 'index.json');
      if (fs.existsSync(indexPath)) {
        this.memoriesIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } else {
        // Criamos um arquivo de índice padrão inicial vazio para exemplificar
        const defaultIndex = {
          "baggio": "baggio_penalty_1994.jpg",
          "roberto carlos": "roberto_carlos_98.jpg",
          "noruega": "brasil_noruega_98.jpg",
          "kairo": "kairo_logo_aesthetic.jpg"
        };
        fs.writeFileSync(indexPath, JSON.stringify(defaultIndex, null, 2), 'utf-8');
        this.memoriesIndex = defaultIndex;
      }
    } catch (err) {
      console.warn('[Memory Provider] Não foi possível ler ou criar índice de memórias:', err);
    }
  }

  /**
   * Tenta encontrar uma representação autêntica local no disco.
   * Se encontrada, retorna o caminho físico. Se não, retorna null.
   */
  private findAuthenticAsset(visualDescription: string): string | null {
    const descLower = visualDescription.toLowerCase();
    for (const [key, filename] of Object.entries(this.memoriesIndex)) {
      if (descLower.includes(key.toLowerCase())) {
        const fullPath = path.join(this.memoriesDir, filename);
        if (fs.existsSync(fullPath)) {
          console.log(`[Memory Provider] 🟢 Ativo Autêntico ENCONTRADO para a cena: "${key}" -> ${fullPath}`);
          return fullPath;
        }
      }
    }
    return null;
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
   * Resolve todos os ativos (imagens autênticas/IA, narração, etc.) e monta o RenderManifest.
   */
  public async resolveAssetsAndBuildManifest(
    contentId: string,
    channelId: string,
    plannedScenes: PlannedScene[],
    direction: CinematicDirection,
    voiceProvider: VoiceProvider,
    imageProvider: ImageProvider,
    assetsDir: string
  ): Promise<RenderManifest> {
    console.log(`[Memory Provider] Iniciando resolução de ativos para unit: ${contentId}`);

    const scenes: TechnicalSceneProps[] = [];
    const assetUrls: Record<string, string> = {};
    const fps = 30;

    for (let idx = 0; idx < plannedScenes.length; idx++) {
      const pScene = plannedScenes[idx];
      const sceneId = pScene.id;

      let mediaPath = '';
      let narrationPath = '';
      let durationMs = 3000; // Default

      // 1. Resolver Narrativo / Áudio
      if (pScene.isSilence) {
        // Pausa / Silêncio do Canon. Não gera áudio de voz.
        // Duração fixa: Silêncio I = 1.5s (45 frames), Silêncio III = 2.0s (60 frames)
        durationMs = idx === plannedScenes.length - 1 ? 2000 : 1500;
      } else {
        const audioFile = path.join(assetsDir, `voiceover_scene_${idx}.mp3`);
        console.log(`[Memory Provider] Gerando locução para cena ${idx + 1}...`);
        await voiceProvider.generateSpeech(pScene.text, audioFile);
        narrationPath = audioFile;
        assetUrls[`voiceover_scene_${idx}`] = audioFile;

        // Mede a duração exata do áudio e converte em milissegundos
        durationMs = this.getAudioDurationMs(audioFile);
      }

      // 2. Resolver Mídia Visual (Autêntica ou Fallback de IA)
      const authenticAsset = this.findAuthenticAsset(pScene.visualDescription);
      if (authenticAsset) {
        mediaPath = authenticAsset;
        assetUrls[`visual_scene_${idx}`] = authenticAsset;
      } else {
        // Fallback: Gerar imagem estilizada por IA
        const visualFile = path.join(assetsDir, `visual_scene_${idx}.jpg`);
        const archetypeStyle = direction.canonArchetype !== 'default'
          ? this.buildArchetypePrompt(direction.canonArchetype as any, pScene.visualDescription)
          : `Cinematic sports photography, clean composition, vertical 9:16. Subject: ${pScene.visualDescription}`;

        console.log(`[Memory Provider] 🔴 Ativo autêntico não encontrado. Fallback de IA na cena ${idx + 1}...`);
        await imageProvider.generateImage(archetypeStyle, visualFile);
        mediaPath = visualFile;
        assetUrls[`visual_scene_${idx}`] = visualFile;
      }

      // 3. Montar a TechnicalSceneProps para o RenderManifest
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
          // Guardar metadados específicos de direção na cena
          panZoomSpeed: pScene.cameraMovement === 'still' ? 0 : 1.15,
          effect: pScene.effect as any,
          ...(narrationPath ? { narrationPath } : {}), // Envia a locução
          cameraMovement: pScene.cameraMovement, // Passa o movimento planejado
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

    // 4. Montar o RenderManifest final
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
        bgmUrl: direction.audio.bgmName, // Nome lógico da trilha BGM
        bgmVolume: direction.audio.bgmVolume,
        sfxEvents: [],
      },
      scenes,
    };

    return manifest;
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
