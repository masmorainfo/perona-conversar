import pg from 'pg';
import { OpenAIProvider } from '@cos/llm';
import { sendTelegram } from '@cos/notifications';

export interface OpportunityInput {
  orgId: string;
  channelId: string;
  title: string;
  description: string;
  baseScore: number;
  score?: number; // legacy
  sourceSignals: string[]; // List of signal source/externalId or raw titles
}

export class OpportunityEngine {
  private dbPool: pg.Pool;
  private llm: OpenAIProvider;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
    this.llm = new OpenAIProvider();
  }

  async generateOpportunities(): Promise<void> {
    console.log(`[Opportunity Engine] Iniciando ciclo...`);

    const today = new Date().toISOString().split('T')[0];

    // Create limit table if not exists
    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS system_daily_limits (
        date_key DATE PRIMARY KEY,
        executions INT NOT NULL DEFAULT 0,
        alert_sent BOOLEAN NOT NULL DEFAULT false
      );
    `);

    // Ensure row exists for today
    await this.dbPool.query(`
      INSERT INTO system_daily_limits (date_key) 
      VALUES ($1) 
      ON CONFLICT (date_key) DO NOTHING;
    `, [today]);

    // Check limit
    const { rows: limitRows } = await this.dbPool.query(`
      SELECT executions, alert_sent FROM system_daily_limits WHERE date_key = $1;
    `, [today]);

    if (limitRows[0].executions >= 15) {
      console.log('[Opportunity Engine] 🛑 Limite diário de execuções atingido (15/15). Abortando ciclo.');
      if (!limitRows[0].alert_sent) {
         const botToken = process.env.TELEGRAM_BOT_TOKEN;
         const chatId = process.env.TELEGRAM_CHAT_ID;
         if (botToken && chatId) {
            try {
              await sendTelegram('🛑 *Limite diário de execuções atingido (15/15)* — pipeline pausado até amanhã', { botToken, chatId }, 'Markdown');
              await this.dbPool.query(`UPDATE system_daily_limits SET alert_sent = true WHERE date_key = $1`, [today]);
            } catch (err) {
              console.error('[Opportunity Engine] Falha ao enviar alerta no Telegram:', err);
            }
         }
      }
      return;
    }

    // Fetch signals from the last 24 hours
    const { rows: signals } = await this.dbPool.query(`
      SELECT source, title, description, url, score
      FROM normalized_signals
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY score DESC, created_at DESC
      LIMIT 100
    `);

    if (signals.length === 0) {
      console.log('[Opportunity Engine] Nenhum sinal encontrado nas últimas 24h.');
      return;
    }

    console.log(`[Opportunity Engine] Processando ${signals.length} sinais recentes...`);

    // Group signals
    const groupedSignals = groupSignals(signals);
    console.log(`[Opportunity Engine] Sinais agrupados em ${groupedSignals.length} temas.`);

    // Fetch active channels from channel_registry
    const { rows: channels } = await this.dbPool.query(
      'SELECT id, org_id, core, strategy FROM channel_registry WHERE is_active = true'
    );

    if (channels.length === 0) {
      console.log('[Opportunity Engine] Nenhum canal ativo cadastrado no registro.');
      return;
    }

    for (const channel of channels) {
      const channelId = channel.id;
      const orgId = channel.org_id || '00000000-0000-0000-0000-000000000000';
      const core = channel.core;

      console.log(`[Opportunity Engine] Analisando oportunidades para o canal: "${core.name}" (ID: ${channelId})`);

      // Retrieve recent channel memory to avoid duplicate topics
      const { rows: memoryRows } = await this.dbPool.query(
        'SELECT topic FROM channel_memory WHERE channel_id = $1 ORDER BY covered_at DESC LIMIT 20',
        [channelId]
      );
      const recentTopics = memoryRows.map(r => r.topic.toLowerCase());

      // Format grouped signals list for LLM analysis
      const signalsText = groupedSignals
        .slice(0, 30) // limit to top 30 clusters for context window
        .map((g, idx) => `[Tema #${idx + 1}] Relevância Combinada: ${g.combinedScore.toFixed(0)} | Fontes: ${g.sources.join(', ')} | Título Representativo: "${g.title}" | Descrição: "${g.description}" (${g.signals.length} sinal(is) agrupado(s))`)
        .join('\n');

      const prompt = `
        Você é o Motor de Oportunidades do Content Operating System (COS) para o canal "${core.name}".
        
        Missão do canal: "${core.mission}"
        Interesses do canal: ${core.audience?.interests?.join(', ')}
        Tópicos abordados recentemente (NÃO REPITA OU GERE TÓPICOS SIMILARES A ESTES):
        ${recentTopics.length > 0 ? recentTopics.map(t => `- ${t}`).join('\n') : '(Nenhum)'}

        Aqui estão os grupos de sinais capturados do mundo hoje (já agregados por similaridade de assunto):
        ${signalsText}

        Analise os sinais e a missão do canal. Selecione o tema/grupo de sinais (ou a combinação de grupos) com maior sinergia com o público do canal e crie 1 proposta de oportunidade de conteúdo de altíssima qualidade.
        A proposta deve ser um ângulo novo, instigante e relevante.

        Responda APENAS com um objeto JSON no formato abaixo (sem markdown ou blocos adicionais):
        {
          "hasOpportunity": boolean,
          "title": "Título instigante da proposta",
          "description": "Explicação detalhada do porquê esse tópico é uma oportunidade agora, incluindo referências aos sinais observados",
          "baseScore": number (de 0.0 a 100.0 indicando aderência/oportunidade de base),
          "sourceSignals": ["título do tema 1", "título do tema 2"]
        }
      `;

      try {
        const responseJsonStr = await this.llm.complete(prompt, { task: 'observer', jsonMode: true, temperature: 0.3 });
        const result = JSON.parse(responseJsonStr);
        // Map legacy score to baseScore if LLM gets confused
        const baseScoreValue = result.baseScore ?? (result.score ? result.score * 100 : 0);

        if (result.hasOpportunity && baseScoreValue >= 50) {
          // Check database to prevent duplicate opportunities with similar titles
          const { rows: existingOpp } = await this.dbPool.query(
            'SELECT id FROM content_opportunities WHERE channel_id = $1 AND LOWER(title) = LOWER($2) AND created_at > NOW() - INTERVAL \'24 hours\'',
            [channelId, result.title]
          );

          if (existingOpp.length > 0) {
            console.log(`[Opportunity Engine] Oportunidade com título similar já pendente para "${result.title}". Ignorando...`);
            continue;
          }

          // Match source signals back to grouped signals to compute source count and momentum
          let matchedSources = new Set<string>();
          if (Array.isArray(result.sourceSignals)) {
            for (const sigTitle of result.sourceSignals) {
              const matchedGroup = groupedSignals.find(g => 
                g.title.toLowerCase() === sigTitle.toLowerCase() || 
                sigTitle.toLowerCase().includes(g.title.toLowerCase()) ||
                g.title.toLowerCase().includes(sigTitle.toLowerCase())
              );
              if (matchedGroup) {
                matchedGroup.sources.forEach(src => matchedSources.add(src));
              }
            }
          }

          const sourceCount = Math.max(1, matchedSources.size);
          // Momentum increases with multiple sources
          const momentum = Math.min(1.0, (sourceCount - 1) * 0.25);
          // Dynamic score is base score boosted by momentum
          const dynamicScore = Math.min(100.0, baseScoreValue + (momentum * 20));
          const category = sourceCount >= 3 ? 'HOT_TREND' : 'NORMAL';

          // Insert into database with full metrics
          await this.dbPool.query(
            `INSERT INTO content_opportunities 
             (org_id, channel_id, title, description, base_score, dynamic_score, source_signals, status, source_count, momentum, category, geographic_expansion, editorial_compatibility)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10, 0.0, 1.0)`,
            [
              orgId, 
              channelId, 
              result.title, 
              result.description, 
              baseScoreValue, 
              dynamicScore, 
              JSON.stringify(result.sourceSignals),
              sourceCount,
              momentum,
              category
            ]
          );

          console.log(`[Opportunity Engine] Nova Oportunidade Gerada: "${result.title}" (Base: ${baseScoreValue}, Dynamic: ${dynamicScore.toFixed(0)}, Sources: ${sourceCount}, Category: ${category})`);

          // Increment daily limit counter
          const { rows: updatedLimit } = await this.dbPool.query(
            `UPDATE system_daily_limits SET executions = executions + 1 WHERE date_key = $1 RETURNING executions`,
            [today]
          );

          if (updatedLimit[0] && updatedLimit[0].executions >= 15) {
            console.log('[Opportunity Engine] 🛑 Limite diário atingido durante o processamento de canais. Interrompendo novos disparos.');
            break; // Stop processing other channels for this cycle
          }

        } else {
          console.log(`[Opportunity Engine] Nenhuma oportunidade qualificada identificada para canal ${core.name}`);
        }
      } catch (err: any) {
        console.error(`[Opportunity Engine] Erro ao processar oportunidade para canal ${channelId}:`, err);
      }
    }
  }
}

// ─── Grouping Helpers ──────────────────────────────────────────────────────────

interface GroupedSignal {
  title: string;
  description: string;
  sources: string[];
  maxScore: number;
  combinedScore: number;
  signals: any[];
}

function getWords(text: string): Set<string> {
  const stopwords = new Set([
    'a', 'o', 'e', 'de', 'da', 'do', 'in', 'on', 'the', 'and', 'to', 'for', 'of', 'with', 'is', 'at', 'under',
    'um', 'uma', 'em', 'para', 'com', 'no', 'na', 'nos', 'nas', 'por', 'sobre', 'que', 'se', 'com'
  ]);
  const cleaned = text.toLowerCase().replace(/[#\-_@]/g, ' ');
  const tokens = cleaned.split(/\s+/);
  const words = new Set<string>();
  for (const t of tokens) {
    const w = t.replace(/[^a-z0-9]/g, '');
    if (w && w.length > 2 && !stopwords.has(w)) {
      words.add(w);
    }
  }
  return words;
}

function calculateJaccard(s1: string, s2: string): number {
  const w1 = getWords(s1);
  const w2 = getWords(s2);
  if (w1.size === 0 || w2.size === 0) return 0;
  
  const intersection = new Set([...w1].filter(x => w2.has(x)));
  const union = new Set([...w1, ...w2]);
  
  return intersection.size / union.size;
}

export function groupSignals(signals: any[]): GroupedSignal[] {
  const groups: GroupedSignal[] = [];
  
  for (const signal of signals) {
    let matchedGroup: GroupedSignal | null = null;
    
    for (const group of groups) {
      // Compare against the group's representative title
      const similarity = calculateJaccard(signal.title, group.title);
      if (similarity >= 0.25) { // 25% overlap of significant words
        matchedGroup = group;
        break;
      }
    }
    
    if (matchedGroup) {
      matchedGroup.signals.push(signal);
      if (!matchedGroup.sources.includes(signal.source)) {
        matchedGroup.sources.push(signal.source);
      }
      if (signal.score > matchedGroup.maxScore) {
        matchedGroup.maxScore = signal.score;
        matchedGroup.title = signal.title; // update representative title to the most relevant one
        matchedGroup.description = signal.description;
      }
    } else {
      groups.push({
        title: signal.title,
        description: signal.description,
        sources: [signal.source],
        maxScore: signal.score,
        combinedScore: 0,
        signals: [signal]
      });
    }
  }
  
  // Calculate combined score
  for (const group of groups) {
    const rawScore = group.maxScore * 100;
    // Multi-source boost: +15 points for each extra source
    const boost = (group.sources.length - 1) * 15;
    group.combinedScore = Math.min(100, rawScore + boost);
  }
  
  // Sort groups by combined score descending
  return groups.sort((a, b) => b.combinedScore - a.combinedScore);
}
