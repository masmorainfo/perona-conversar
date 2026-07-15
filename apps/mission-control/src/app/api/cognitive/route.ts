import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // --- Daily Briefing: calculado do banco real ---

    // Contagens por estado
    const { rows: stateCounts } = await query(`
      SELECT state, COUNT(*) as count
      FROM content_units
      GROUP BY state
    `);

    const counts = Object.fromEntries(
      stateCounts.map((r: any) => [r.state, parseInt(r.count)])
    );

    const published = (counts['PUBLISHED'] ?? 0) + (counts['LEARNED'] ?? 0);
    const abandoned = counts['ABANDONED'] ?? 0;
    const rejected = counts['REJECTED'] ?? 0;
    const total = Object.values(counts).reduce((a: number, b) => a + (b as number), 0);
    const successRate = total > 0 ? Math.round((published / total) * 100) : 0;

    // Últimas publicações reais
    const { rows: recentPublished } = await query(`
      SELECT cu.topic, cr.name AS channel_name, ct.transitioned_at
      FROM content_transitions ct
      JOIN content_units cu ON ct.content_id = cu.id
      LEFT JOIN channel_registry cr ON cu.channel_id = cr.id
      WHERE ct.to_state = 'PUBLISHED'
      ORDER BY ct.transitioned_at DESC
      LIMIT 3
    `);

    // Reprovações recentes do Critic
    const { rows: recentRejections } = await query(`
      SELECT cu.topic, ct.reason, ct.transitioned_at
      FROM content_transitions ct
      JOIN content_units cu ON ct.content_id = cu.id
      WHERE ct.to_state = 'REJECTED' AND ct.actor = 'agent-critic'
      ORDER BY ct.transitioned_at DESC
      LIMIT 2
    `);

    // Gerar summary dinâmico baseado nos dados reais
    const totalProcessed = published + abandoned + rejected;
    const summaryParts: string[] = [];
    if (totalProcessed === 0) {
      summaryParts.push('Nenhum conteúdo processado ainda. Injete tópicos pelo Command Center para iniciar o pipeline.');
    } else {
      summaryParts.push(`O pipeline processou ${total} unidades de conteúdo no total.`);
      if (published > 0) summaryParts.push(`${published} vídeo${published > 1 ? 's' : ''} publicado${published > 1 ? 's' : ''} com sucesso.`);
      if (abandoned > 0) summaryParts.push(`${abandoned} Arquivado${abandoned > 1 ? 's' : ''} (revisão encerrada).`);
    }

    const highlights = [
      ...recentPublished.map((r: any) => ({
        id: `pub-${r.transitioned_at}`,
        text: `Publicado: "${r.topic}"${r.channel_name ? ` (${r.channel_name})` : ''}.`,
        type: 'published',
      })),
      ...recentRejections.map((r: any) => ({
        id: `rej-${r.transitioned_at}`,
        text: `Critic Agent reprovou: "${r.topic}". ${r.reason ? `Motivo: ${r.reason}` : ''}`,
        type: 'rejected',
      })),
    ];

    const dailyBriefing = {
      summary: summaryParts.join(' '),
      stats: {
        successRate: `${successRate}%`,
        publishedCount: published,
        rejectedCount: rejected + abandoned,
        totalUnits: total,
        stateBreakdown: counts,
      },
      highlights: highlights.length > 0
        ? highlights
        : [{ id: 'empty', text: 'Nenhum evento recente para exibir.', type: 'info' }],
    };

    // --- Agent Chats: tabela agent_messages (pode estar vazia inicialmente) ---
    const { rows: chatJobs } = await query(`
      SELECT DISTINCT am.content_id, cu.topic
      FROM agent_messages am
      JOIN content_units cu ON am.content_id = cu.id
      ORDER BY am.content_id
      LIMIT 10
    `).catch(() => ({ rows: [] })); // graceful: tabela pode ainda não existir

    const agentConversations: Record<string, any[]> = {};
    for (const job of chatJobs) {
      const { rows: messages } = await query(
        `SELECT sender, message, created_at FROM agent_messages WHERE content_id = $1 ORDER BY created_at ASC`,
        [job.content_id]
      );
      agentConversations[job.content_id] = messages.map((m: any) => ({
        sender: m.sender,
        message: m.message,
        topic: job.topic,
      }));
    }

    // --- Predictions: baseado em dados reais do banco ---
    const predictions = [];

    // Alerta de abandono elevado
    if (total > 0 && (abandoned / total) > 0.15) {
      predictions.push({
        id: 'pred-abandon',
        title: `Taxa de abandono elevada: ${Math.round((abandoned / total) * 100)}%`,
        probability: 'Alta',
        description: `${abandoned} unidades foram arquivadas (revisão encerrada). Verifique se foi encerramento manual ou limite de reprovações.`,
        mitigation: 'Acesse o Channels Editor e revise os thresholds de criticApprovalMinScore.',
      });
    }

    // Alerta de fila vazia
    const activeStates = ['DISCOVERED', 'EVALUATED', 'APPROVED', 'RESEARCHED', 'SCRIPTED'];
    const inProgress = activeStates.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
    if (inProgress === 0 && total > 0) {
      predictions.push({
        id: 'pred-idle',
        title: 'Pipeline ocioso — nenhuma unidade em processamento',
        probability: 'Média',
        description: 'Todas as unidades estão em estado terminal (PUBLISHED, REJECTED ou ABANDONED). Injete novos tópicos para manter o fluxo ativo.',
        mitigation: 'Use o Command Center para injetar novos tópicos ou ative o modo autônomo.',
      });
    }
    // --- Cost Metrics ---
    const { rows: todayCostRow } = await query(`
      SELECT SUM(cost_incurred_usd) as total
      FROM system_daily_limits
      WHERE date = CURRENT_DATE
    `).catch(() => ({ rows: [] }));
    
    const { rows: avg7dRow } = await query(`
      SELECT AVG(daily_total) as avg_7d
      FROM (
        SELECT date, SUM(cost_incurred_usd) as daily_total
        FROM system_daily_limits
        WHERE date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY date
      ) sub
    `).catch(() => ({ rows: [] }));

    const todayCost = todayCostRow[0]?.total ? parseFloat(todayCostRow[0].total) : 0.00;
    const avg7dCost = avg7dRow[0]?.avg_7d ? parseFloat(avg7dRow[0].avg_7d) : 0.00;
    const costMetrics = {
      todayUsd: todayCost.toFixed(2),
      avg7dUsd: avg7dCost.toFixed(2),
      trend: todayCost > avg7dCost ? 'up' : 'down'
    };

    // --- Pending Decisions ---
    const { rows: pendingRows } = await query(`
      SELECT id, topic, payload, created_at
      FROM content_units
      WHERE state = 'PENDING_REVIEW'
      ORDER BY created_at DESC
      LIMIT 5
    `).catch(() => ({ rows: [] }));

    const pendingDecisions = pendingRows.map((r: any) => ({
      id: r.id,
      topic: r.topic,
      createdAt: r.created_at,
      thumbnail: r.payload?.generatedAssets?.thumbnail || null,
      score: r.payload?.evaluation?.finalScore || null,
      summary: r.payload?.script?.summary || 'Resumo não disponível',
    }));

    return NextResponse.json({
      dailyBriefing,
      agentConversations,
      predictions,
      costMetrics,
      pendingDecisions,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
