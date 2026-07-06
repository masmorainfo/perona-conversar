import { NextResponse } from 'next/server';

export async function GET() {
  // Simulando listagem dos agentes cadastrados no COS, seus prompts base e telemetria operacional
  const agents = [
    {
      id: 'editorial',
      name: 'Editorial Intelligence',
      status: 'IDLE',
      latencyMs: 1420,
      tokenCostUsd: 0.0032,
      version: '0.1.2',
      prompt: 'Você é o Diretor Editorial encarregado de julgar ideias de tópicos...'
    },
    {
      id: 'research',
      name: 'Research Agent',
      status: 'ACTIVE',
      latencyMs: 3850,
      tokenCostUsd: 0.0125,
      version: '0.2.1',
      prompt: 'Faça uma pesquisa detalhada sobre o tópico...'
    },
    {
      id: 'script',
      name: 'Script Agent',
      status: 'IDLE',
      latencyMs: 4100,
      tokenCostUsd: 0.0189,
      version: '0.1.5',
      prompt: 'Escreva um roteiro fluído e engajante com visualNotes...'
    },
    {
      id: 'critic',
      name: 'Critic Agent',
      status: 'IDLE',
      latencyMs: 2900,
      tokenCostUsd: 0.0094,
      version: '0.1.3',
      prompt: 'Você é o Revisor Crítico responsável por encontrar inconsistências...'
    }
  ];

  return NextResponse.json({ agents });
}
