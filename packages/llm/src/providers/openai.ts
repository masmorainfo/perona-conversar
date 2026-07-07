import OpenAI from 'openai';
import { LLMProvider, CompletionOptions, VoiceProvider, ImageProvider, NVIDIA_TASK_MODELS } from '../index.js';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// ─── Modelos padrão por provider ───────────────────────────────────────────────
// NVIDIA NIM usa a API OpenAI-compatible mas com nomes de modelos diferentes.
// Todos os modelos abaixo têm acesso gratuito via build.nvidia.com/explore/
const NVIDIA_DEFAULT_CHAT_MODEL  = process.env.NVIDIA_DEFAULT_MODEL   || 'meta/llama-3.3-70b-instruct';
const NVIDIA_DEFAULT_EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL     || 'nvidia/nv-embedqa-e5-v5';
const OPENAI_DEFAULT_CHAT_MODEL  = 'gpt-4o-mini';
const OPENAI_DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

export class OpenAIProvider implements LLMProvider, VoiceProvider, ImageProvider {
  private openai?: OpenAI;
  private readonly isNvidia: boolean;

  constructor(apiKey?: string, baseURL?: string) {
    const forceMock = process.env.FORCE_MOCK_LLM === 'true';
    
    // Choose LLM Provider based on env config or automatic fallback
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === 'nvidia') {
      this.isNvidia = true;
    } else if (provider === 'openai') {
      this.isNvidia = false;
    } else {
      this.isNvidia = !!process.env.NVIDIA_API_KEY && !process.env.OPENAI_API_KEY;
    }

    const key = forceMock ? undefined : (apiKey
      || (this.isNvidia ? process.env.NVIDIA_API_KEY : undefined)
      || process.env.OPENAI_API_KEY
      || process.env.NVIDIA_API_KEY); // fallback final

    const defaultBaseURL = this.isNvidia
      ? 'https://integrate.api.nvidia.com/v1'
      : process.env.OPENAI_BASE_URL;

    const url = baseURL || defaultBaseURL;

    if (key && key.trim() !== '') {
      const config: any = { apiKey: key, timeout: 60000, maxRetries: 2 };
      if (url) config.baseURL = url;
      this.openai = new OpenAI(config);
      console.log(`[LLM] Modo: ${this.isNvidia ? '🟢 NVIDIA NIM' : '🔵 OpenAI'} | Modelo padrão: ${this.isNvidia ? NVIDIA_DEFAULT_CHAT_MODEL : OPENAI_DEFAULT_CHAT_MODEL}`);
    } else {
      console.warn('⚠️ OpenAIProvider running in MOCK mode (no API key provided)');
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    if (this.openai) {
      // Prioridade: (1) model explícito → (2) task router → (3) default do provider
      const defaultModel = this.isNvidia ? NVIDIA_DEFAULT_CHAT_MODEL : OPENAI_DEFAULT_CHAT_MODEL;
      const routedModel = (this.isNvidia && options?.task)
        ? NVIDIA_TASK_MODELS[options.task]
        : defaultModel;
      const model = options?.model || routedModel;

      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        });
        return response.choices[0]?.message?.content || '';
      } catch (err) {
        console.error(`[LLM] Erro (modelo: ${model}), falling back to mock:`, err);
      }
    }


    // Mock completion logic matching expected agent JSON shapes
    // Uses task-type routing first (most reliable), then prompt pattern matching as fallback
    if (options?.jsonMode) {
      if (options?.task === 'cinematic-review' || prompt.includes('Assinatura Editorial') || prompt.includes('SIGNABLE') || prompt.includes('UNSIGNABLE')) {
        return JSON.stringify({
          signature: 'SIGNABLE',
          reasons: [],
          feedback: 'Mock: O mini-documentário capta com maestria o silêncio trágico de Pasadena, em total consonância com a identidade clássica da marca KAIRO.',
          suggestions: []
        });
      }
      if (options?.task === 'editorial' || prompt.includes('Diretor Editorial') || prompt.includes('Diretor de Conteúdo') || prompt.includes('Inteligência Editorial')) {
        return JSON.stringify({
          approved: true,
          score: 0.85,
          direction: 'focar nos aspectos práticos de engenharia e impacto real do tema.',
          reason: 'O tema é de alto interesse para o público-alvo e está de acordo com as diretrizes do canal.'
        });
      }
      if (prompt.includes('pesquisa detalhada') || prompt.includes('Pesquisador') || prompt.includes('pesquise sobre') || prompt.includes('pesquisa sobre')) {
        return JSON.stringify({
          summary: 'Este é um resumo gerado automaticamente sobre o tema solicitado, abordando as principais inovações.',
          facts: [
            'Fato 1: O desenvolvimento teve um aumento de 50% na adoção prática recente.',
            'Fato 2: Estudos de caso demonstram eficiência aprimorada em mais de 30%.',
            'Fato 3: Há uma forte tendência de consolidação da tecnologia no mercado global.'
          ],
          sources: [
            { title: 'Tech Report 2026', url: 'https://example.com/tech-report' },
            { title: 'AI Engineering Journal', url: 'https://example.com/ai-journal' }
          ]
        });
      }
      if (options?.task === 'script' || prompt.includes('roteiro') || prompt.includes('Roteirista')) {
        // Tenta responder de acordo com o tema solicitado no prompt
        const isZidane = prompt.includes('Zidane') || prompt.includes('2006');
        const title = isZidane ? 'O Silêncio de Berlim: A Queda Trágica de Zidane' : 'A Nova Era Tecnológica';
        const hook = isZidane 
          ? 'Em dois mil e seis, o mundo inteiro parou para assistir ao último ato de um gênio sob o céu de Berlim.'
          : 'Você não vai querer ficar de fora do que está acontecendo agora!';
        
        const body = isZidane ? [
          {
            content: 'Zinedine Zidane era a elegância pura, o maestro que conduzia a França rumo à glória eterna mais uma vez.',
            durationSeconds: 25,
            visualNote: 'Cena lenta, Zidane caminhando pelo campo com luz âmbar e poeira suspensa'
          },
          {
            content: 'Mas o destino, esse roteirista implacável, reserva tragédias aos que tentam tocar a coroa dos deuses. Um instante de fúria, e o silêncio caiu sobre Berlim.',
            durationSeconds: 30,
            visualNote: 'Zidane passando de cabeça baixa pela taça da Copa do Mundo, em tons de azul-frio e monochrome'
          },
          {
            content: 'A glória se desfez em cinzas sob os pés do herói exilado. Zidane saiu de campo sozinho, deixando o templo do futebol sem seu deus.',
            durationSeconds: 25,
            visualNote: 'Cena de encerramento vazia com foco na taça estática, tons escuros'
          }
        ] : [
          {
            content: 'Primeiro, vamos olhar para o panorama prático do desenvolvimento.',
            durationSeconds: 30,
            visualNote: 'Apresentação de tela com código'
          },
          {
            content: 'Em seguida, analisamos a eficiência obtida no dia a dia com automação.',
            durationSeconds: 30,
            visualNote: 'Gráfico de performance subindo'
          },
          {
            content: 'Por fim, o impacto imediato no mercado de trabalho.',
            durationSeconds: 20,
            visualNote: 'Equipe de engenheiros colaborando'
          }
        ];

        const keywords = isZidane 
          ? ['futebol', 'copadomundo', 'zidane', 'kairo'] 
          : ['tecnologia', 'inovacao', 'futuro', 'ia'];

        return JSON.stringify({
          title,
          hook,
          body,
          cta: 'Qual o maior drama que você já viu no futebol? Deixe seu comentário.',
          estimatedDurationSeconds: body.reduce((acc, s) => acc + s.durationSeconds, 0),
          description: isZidane 
            ? 'A história dramática do último jogo de Zinedine Zidane na final da Copa do Mundo de 2006.' 
            : 'Uma análise profunda sobre como a tecnologia está transformando o cenário atual.',
          keywords
        });
      }
      if (options?.task === 'humanizer' || prompt.includes('Humanizer') || prompt.includes('humanizar')) {
        const isZidane = prompt.includes('Zidane') || prompt.includes('Berlim');
        const hook = isZidane 
          ? 'Em dois mil e seis, o mundo inteiro parou pra ver o último ato de um gênio sob o céu de Berlim.'
          : 'Você não vai querer ficar de fora do que tá acontecendo agora, né?';
        
        const sections = isZidane ? [
          'Zinedine Zidane era a elegância pura, o maestro que conduzia a França rumo à glória eterna mais uma vez.',
          'Mas o destino reserva tragédias pesadas aos que tentam tocar a coroa dos deuses. Um segundo de fúria, e o silêncio caiu de vez sobre Berlim.',
          'A glória se desfez em cinzas sob os pés do herói exilado. Zidane saiu de campo sozinho, deixando o templo do futebol.'
        ] : [
          'Primeiro, vamo olhar bem pra esse panorama de um jeito super prático.',
          'Depois, a gente analisa a eficiência que tá rolando de verdade no dia a dia.',
          'E pra fechar, vamo ver o impacto disso tudo no nosso futuro imediato.'
        ];

        const cta = isZidane 
          ? 'Qual o maior drama que você já viu no futebol? Deixa aí nos comentários.'
          : 'E aí, o que você achou de tudo isso? Deixa sua opinião nos comentários!';

        return JSON.stringify({
          hook,
          sections,
          cta
        });
      }
      if (prompt.toLowerCase().includes('crítico') || prompt.toLowerCase().includes('critic') || prompt.toLowerCase().includes('avali')) {
        return JSON.stringify({
          overallScore: 0.9,
          approved: true,
          dimensions: {
            clarity: { score: 0.9, note: "ok", isBlocking: false },
            retention: { score: 0.8, note: "ok", isBlocking: false }
          },
          blockingIssues: [],
          suggestions: []
        });
      }
      if (prompt.includes('controle de qualidade') || prompt.includes('QC') || prompt.includes('qualidade do vídeo')) {
        return JSON.stringify({
          approved: true,
          score: 0.95,
          checklist: { 'audio_clear': true, 'resolution_ok': true },
          reason: 'Aprovado em todas as métricas visuais e auditivas.'
        });
      }
      if (prompt.includes('Motor de Oportunidades') || prompt.includes('oportunidade editorial')) {
        return JSON.stringify({
          hasOpportunity: true,
          title: "O Silêncio de Berlim: A Queda Trágica de Zidane",
          description: "Com base nos sinais e retrospectivas sobre a final da Copa do Mundo de 2006, analisamos o momento dramático da cabeçada de Zidane em Materazzi e seu abandono do campo.",
          score: 0.95,
          sourceSignals: ["Zinedine Zidane 2006", "Documentário e retrospectivas"]
        });
      }
      return '{}';
    }

    return 'Esta é uma resposta de texto padrão do provedor de inteligência artificial em modo simulado (mock).';
  }

  /**
   * CLP — Content Localization Policy
   * Aplica estratégia editorial (KEEP/TRANSLATE/ADAPT/EXPLAIN/REMOVE) a cada termo estrangeiro.
   * NÃO traduz literalmente — localiza editorialmente para o público brasileiro.
   */
  async localizeBatch(
    items: Array<{ term: string; context?: string }>,
    targetLang: string = 'pt-BR'
  ): Promise<import('@cos/types').LocalizationDecision[]> {
    if (items.length === 0) return [];

    const now = new Date();

    if (this.openai) {
      try {
        const numbered = items
          .map((item, i) => `${i + 1}. "${item.term}"${item.context ? ` [contexto: ${item.context}]` : ''}`)
          .join('\n');

        const prompt = `Você é o Agente de Localização Editorial do COS (Content Operating System).
Sua missão: decidir como cada termo estrangeiro deve ser tratado para o público brasileiro.

PRINCÍPIO FUNDAMENTAL: "Se um brasileiro médio assistir este vídeo, ele compreenderá imediatamente esse termo?"

Aplique EXATAMENTE UMA estratégia por termo:

• KEEP      → Manter idêntico. Use para: pessoas, marcas, produtos, empresas, tecnologias, jogos, franquias, siglas mundialmente conhecidas.
              Exemplos que devem ser KEEP: Nintendo, PlayStation, ChatGPT, OpenAI, RTX, NASA, Ronaldo, Toyota
• TRANSLATE → Traduzir quando representa um conceito comum com equivalente natural em ${targetLang}.
              Exemplos: "Dance Hall" → "Sala de Dança", "Final Battle" → "Batalha Final"
• ADAPT     → Adaptar criativamente quando a tradução literal soa estranha ou não comunica.
              Exemplos: "ベスト32" → "Top 32", "勇気100%" → "Coragem 100%"
• EXPLAIN   → Contextualizar quando tem relevância editorial mas depende de contexto cultural.
              Exemplos: "#ウエルシアボーナス" → "Promoção da rede japonesa Welcia"
• REMOVE    → Eliminar quando não agrega valor para o público brasileiro.
              Exemplos: hashtags locais em idiomas estrangeiros que não fazem sentido fora do contexto original

Termos para avaliar:
${numbered}

Responda SOMENTE com JSON:
{
  "decisions": [
    {
      "originalTerm": "termo original exato",
      "strategy": "KEEP|TRANSLATE|ADAPT|EXPLAIN|REMOVE",
      "localizedForm": "resultado (vazio string se REMOVE)",
      "reason": "justificativa editorial em uma linha"
    }
  ]
}`;

        const response = await this.openai.chat.completions.create({
          model: this.isNvidia ? NVIDIA_DEFAULT_CHAT_MODEL : OPENAI_DEFAULT_CHAT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        const raw: any[] = parsed.decisions || [];

        if (raw.length === items.length) {
          return raw.map((d, i) => ({
            originalTerm: d.originalTerm || items[i].term,
            strategy: (['KEEP','TRANSLATE','ADAPT','EXPLAIN','REMOVE'].includes(d.strategy) ? d.strategy : 'KEEP') as import('@cos/types').CLPStrategy,
            localizedForm: d.strategy === 'REMOVE' ? '' : (d.localizedForm || items[i].term),
            reason: d.reason || '',
            decidedBy: 'signal-normalizer' as const,
            decidedAt: now,
          }));
        }

        console.warn(`[localizeBatch] Mismatch: enviados ${items.length}, recebidos ${raw.length}. Aplicando KEEP em todos.`);
      } catch (err) {
        console.error('[localizeBatch] Erro na localização CLP, aplicando KEEP em todos:', err);
      }
    }

    // Mock / fallback: KEEP em todos
    return items.map(item => ({
      originalTerm: item.term,
      strategy: 'KEEP' as const,
      localizedForm: item.term,
      reason: 'Fallback: API indisponível, mantendo original',
      decidedBy: 'signal-normalizer' as const,
      decidedAt: now,
    }));
  }



  async embed(text: string): Promise<number[]> {
    if (this.openai) {
      const embedModel = this.isNvidia ? NVIDIA_DEFAULT_EMBED_MODEL : OPENAI_DEFAULT_EMBED_MODEL;
      try {
        const response = await this.openai.embeddings.create({
          model: embedModel,
          input: text,
          // NVIDIA nv-embed-v2 requer encoding_format explícito
          ...(this.isNvidia ? { encoding_format: 'float' } : {}),
        });
        return response.data[0]?.embedding || [];
      } catch (err) {
        console.error(`[LLM] Embed Error (${embedModel}), falling back to mock:`, err);
      }
    }

    // Mock: always 1536 dims to match pgvector column definition in the DB
    // (even when using NVIDIA NIM, the DB stores embeddings in 1536-dim format)
    const dims = 1536;
    return Array.from({ length: dims }, (_, i) => Math.sin(i));
  }

  async generateSpeech(text: string, outputPath: string): Promise<string> {
    // 1. Try OpenAI TTS (if API key available)
    if (this.openai && !this.isNvidia) {
      try {
        const mp3 = await this.openai.audio.speech.create({
          model: 'tts-1',
          voice: 'alloy',
          input: text,
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(outputPath, buffer);
        console.log(`[TTS] ✅ OpenAI TTS generated: ${outputPath}`);
        return outputPath;
      } catch (err) {
        console.error('[TTS] OpenAI TTS Error, trying Edge-TTS...', err);
      }
    }

    // 2. Try Edge-TTS (Microsoft free TTS — supports pt-BR)
    try {
      const tempTextFile = outputPath + '.txt';
      await fs.promises.writeFile(tempTextFile, text, 'utf-8');
      const voice = 'pt-BR-AntonioNeural';
      const cmd = `python -m edge_tts --file "${tempTextFile}" --voice ${voice} --write-media "${outputPath}"`;
      await execAsync(cmd, { timeout: 30000 });
      // Cleanup temp file
      try { await fs.promises.unlink(tempTextFile); } catch {}
      // Verify file was created and has content
      const stats = fs.statSync(outputPath);
      if (stats.size > 1000) {
        console.log(`[TTS] ✅ Edge-TTS generated: ${outputPath} (${stats.size} bytes)`);
        return outputPath;
      }
      console.warn(`[TTS] Edge-TTS output too small (${stats.size} bytes), falling back...`);
    } catch (err) {
      console.error('[TTS] Edge-TTS failed, falling back to silent mock:', err);
    }

    // 3. Last resort: silent WAV mock
    console.warn('[TTS] ⚠️ Using silent mock audio — no TTS engine available');
    const sampleRate = 8000;
    const duration = 5; // seconds
    const numSamples = sampleRate * duration;
    const wavBuffer = Buffer.alloc(44 + numSamples);
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(36 + numSamples, 4);
    wavBuffer.write('WAVE', 8);
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20);
    wavBuffer.writeUInt16LE(1, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(sampleRate, 28);
    wavBuffer.writeUInt16LE(1, 32);
    wavBuffer.writeUInt16LE(8, 34);
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(numSamples, 40);
    wavBuffer.fill(128, 44);
    await fs.promises.writeFile(outputPath, wavBuffer);
    return outputPath;
  }

  async generateImage(prompt: string, outputPath: string): Promise<string> {
    // 1. Try OpenAI DALL-E (if API key available)
    if (this.openai && !this.isNvidia) {
      try {
        const response = await this.openai.images.generate({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024',
        });
        const imageUrl = response.data?.[0]?.url;
        if (imageUrl) {
          const res = await fetch(imageUrl);
          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.promises.writeFile(outputPath, buffer);
          console.log(`[Image] ✅ DALL-E generated: ${outputPath}`);
          return outputPath;
        }
      } catch (err) {
        console.error('[Image] DALL-E Error, trying fallbacks...', err);
      }
    }

    // 2. Try Pollinations AI (Free image generation, no key needed)
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        console.log(`[Image] Tentando gerar imagem via Pollinations AI (Gratuito) - Tentativa ${attempts + 1}/${maxAttempts}...`);
        const sanitizedPrompt = encodeURIComponent(prompt.trim());
        // Usamos dimensões de retrato (1080x1920) e modelo flux para excelente qualidade visual
        const url = `https://image.pollinations.ai/prompt/${sanitizedPrompt}?width=1080&height=1920&nologo=true&private=true&enhance=false&model=flux`;
        
        const imageRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (imageRes.ok) {
          const buffer = Buffer.from(await imageRes.arrayBuffer());
          await fs.promises.writeFile(outputPath, buffer);
          console.log(`[Image] ✅ Pollinations AI gerou: ${outputPath} (${buffer.length} bytes)`);
          return outputPath;
        } else {
          console.warn(`[Image] Pollinations AI falhou com status: ${imageRes.status}`);
        }
      } catch (pollinationErr) {
        console.error(`[Image] Erro na tentativa ${attempts + 1} da API do Pollinations AI:`, pollinationErr);
      }
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000)); // Espera 3 segundos antes de tentar novamente
      }
    }

    // 3. Try FFmpeg gradient generation (free, no API key)
    try {
      // Pick dark/desaturated gradient theme based on archetype keywords in prompt
      let theme = { r: 'clip(15+X/15,0,50)', g: 'clip(15+Y/15,0,50)', b: 'clip(20+X/10,0,70)' }; // Default: Slate Grey
      
      const promptLower = prompt.toLowerCase();
      if (promptLower.includes('heroi_tragico') || promptLower.includes('steel blue') || promptLower.includes('monochrome')) {
        // Tragic Hero: Cold dark blues and graphite
        theme = {
          r: 'clip(5+X/25,0,30)',
          g: 'clip(10+Y/20,0,45)',
          b: 'clip(20+X/15+Y/25,0,60)'
        };
      } else if (promptLower.includes('exilado_que_retorna') || promptLower.includes('sepia') || promptLower.includes('amber')) {
        // Exiled: Muted dark gold and warm sepia tones
        theme = {
          r: 'clip(25+X/15,0,65)',
          g: 'clip(15+Y/25,0,40)',
          b: 'clip(5+X/30,0,25)'
        };
      } else if (promptLower.includes('eterno_segundo') || promptLower.includes('moss green')) {
        // Eternal Second: Desaturated moss green and concrete grey
        theme = {
          r: 'clip(10+X/25,0,35)',
          g: 'clip(20+Y/15,0,55)',
          b: 'clip(12+X/25,0,40)'
        };
      } else if (promptLower.includes('martir_esquecido')) {
        // Martyr: Deep charcoal with extremely subtle dark red shadow
        theme = {
          r: 'clip(12+Y/25,0,30)',
          g: 'clip(6+Y/25,0,20)',
          b: 'clip(6+Y/25,0,20)'
        };
      } else if (promptLower.includes('momento_impossivel')) {
        // Impossible Moment: Deep neon-indigo/cyan highlights on deep black
        theme = {
          r: 'clip(5+X/25,0,25)',
          g: 'clip(20+Y/15,0,60)',
          b: 'clip(45+X/10,0,90)'
        };
      }

      const cmd = `ffmpeg -y -f lavfi -i "color=s=1080x1920:c=0x0a0a23:d=0.1" -vf "geq=r='${theme.r}':g='${theme.g}':b='${theme.b}'" -frames:v 1 -update 1 "${outputPath}"`;
      await execAsync(cmd, { timeout: 15000 });

      // Verify file was created
      const stats = fs.statSync(outputPath);
      if (stats.size > 1000) {
        console.log(`[Image] ✅ FFmpeg gradient generated: ${outputPath} (${stats.size} bytes)`);
        return outputPath;
      }
      console.warn(`[Image] FFmpeg output too small (${stats.size} bytes), falling back...`);
    } catch (err) {
      console.error('[Image] FFmpeg gradient failed, falling back to placeholder:', err);
    }

    // 3. Last resort: solid colored image (much better than 2x2 white BMP)
    console.warn('[Image] ⚠️ Using solid color placeholder — no image engine available');
    // Generate a dark blue 1080x1920 JPEG using a minimal BMP approach
    const width = 1080, height = 1920;
    const rowBytes = width * 3;
    const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
    const pixelDataSize = paddedRowBytes * height;
    const fileSize = 54 + pixelDataSize;
    const buf = Buffer.alloc(fileSize);
    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(54, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(24, 28);
    buf.writeUInt32LE(0, 30);
    buf.writeUInt32LE(pixelDataSize, 34);
    buf.writeInt32LE(2835, 38);
    buf.writeInt32LE(2835, 42);
    // Fill with dark blue-purple gradient approximation
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = 54 + y * paddedRowBytes + x * 3;
        buf[offset] = Math.min(255, 80 + Math.floor(x / 5 + y / 10));   // B
        buf[offset + 1] = Math.min(150, 20 + Math.floor(y / 15));        // G
        buf[offset + 2] = Math.min(200, 40 + Math.floor(x / 8));         // R
      }
    }
    // Save as .bmp then overwrite path (keep .jpg extension but BMP data works with FFmpeg/Remotion)
    await fs.promises.writeFile(outputPath, buf);
    return outputPath;
  }
}
