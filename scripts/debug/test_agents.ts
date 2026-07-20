import { OpenAIProvider } from '@cos/llm';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const llm = new OpenAIProvider();

async function test() {
  const topic = 'Final da Copa do Mundo 2026';
  
  console.log('--- TESTE EDITORIAL ---');
  const editorialPrompt = `
    Você é a Inteligência Editorial (Diretor de Conteúdo) do canal "KAIRO - Futebol e a Condição Humana".
    A missão do canal é: "Contar histórias de futebol como épicos humanos, focando na falha, na glória e no peso da expectativa.".
    O público alvo foca em: Histórias de superação, tragédias esportivas, momentos lendários, bastidores emocionais, psicologia do atleta.
    Limites editoriais (ALWAYS IN): Foco no peso emocional, tom cinematográfico e respeitoso, falhas como parte da grandeza, trilha sonora dramática, narrativa arquetípica.
    Limites editoriais (ALWAYS OUT): Notícias quentes sem profundidade, fofocas pessoais, zoeira de torcedor, memes de baixo esforço, estatísticas secas.
    
    Analise o seguinte tópico proposto para um vídeo: "${topic}"
    
    ── FILTRO DO CANON KAIRO ────────────────────────────────────────────────────
    Antes de qualquer decisão editorial, classifique este tópico em um dos
    cinco Arquétipos Narrativos do Canon KAIRO:
    
    1. "heroi_tragico"       — Culpa + Grandeza. Jogador que falhou no momento decisivo
                               e carrega esse peso. Ex: Baggio, Roberto Carlos (Copa 98).
    2. "exilado_que_retorna" — Redenção + Melancolia. Atleta que voltou após exílio,
                               lesão grave ou exclusão injusta.
    3. "eterno_segundo"      — Injustiça + Dignidade. O melhor de uma geração que nunca
                               venceu o que merecia. Ex: Geração Belga, Mané Garrincha.
    4. "martir_esquecido"    — Solidão + Legado. Craque que foi eclipsado, esquecido
                               ou nunca recebeu o reconhecimento que merecia.
    5. "momento_impossivel"  — Espanto + Êxtase. Um feito estatisticamente ou
                               historicamente improvável que desafia a crença.
    
    Pergunta central do Canon: "O que esse momento revela sobre a condição humana?"
    
    Se o tópico NÃO mapear para nenhum dos 5 arquétipos (ex: é apenas um resultado
    de partida, uma polêmica de comentarista, ou um highlights genérico), o campo
    "canonArchetype" deve ser null e "approved" deve ser false, pois a KAIRO não
    produz conteúdo sem profundidade humana arquetípica.
    ─────────────────────────────────────────────────────────────────────────────

    ── CLP (Content Localization Policy) ───────────────────────────────────────
    O COS é um sistema de LOCALIZAÇÃO, não de tradução.
    Se o tópico ou sinais contiverem termos em outros idiomas, avalie:
    • O termo localizado comunica claramente para o público brasileiro?
    • Se NÃO, inclua "clpOverrides" com a correção editorial.
    Estratégias disponíveis: KEEP | TRANSLATE | ADAPT | EXPLAIN | REMOVE
    ─────────────────────────────────────────────────────────────────────────────

    ASSUMA QUE O EVENTO OU TEMA É REAL E CONFIRMADO. Sua função não é verificar fatos, mas julgar estritamente a qualidade da história. Avalie o tema apenas por sua adequação ao CANON KAIRO e à exploração da condição humana. Deixe a verificação factual para a próxima etapa do pipeline.
    
    Responda APENAS com um objeto JSON válido:
    {
      "approved": boolean,
      "score": number,
      "canonArchetype": "heroi_tragico" | "exilado_que_retorna" | "eterno_segundo" | "martir_esquecido" | "momento_impossivel" | null,
      "canonTargetEmotion": "string",
      "direction": "string",
      "reason": "string",
      "clpOverrides": []
    }
  `;

  const editorialResponse = await llm.complete(editorialPrompt, { task: 'editorial', jsonMode: true, temperature: 0.2 });
  const editorialResult = JSON.parse(editorialResponse);
  console.log(JSON.stringify(editorialResult, null, 2));

  if (!editorialResult.approved) {
    console.log('Tópico rejeitado pelo Editorial Agent.');
    return;
  }

  console.log('\n--- TESTE RESEARCH ---');
  let searchResults: any = null;
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

  if (TAVILY_API_KEY) {
    try {
      const searchResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: topic,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 5,
        }),
      });
      if (searchResponse.ok) {
        searchResults = await searchResponse.json();
      }
    } catch (e) {
      console.error(e);
    }
  }

  const researchPrompt = `
    Faça uma pesquisa detalhada sobre o tópico: "${topic}".
    Direção editorial desejada: "${editorialResult.direction || 'Neutro'}".
    
    ${searchResults ? `Aqui estão os resultados reais encontrados na internet para referência:\n${JSON.stringify(searchResults.results, null, 2)}\nResumo gerado pela pesquisa: ${searchResults.answer || ''}` : ''}
    
    Extraia fatos importantes, estatísticas e um resumo.
    Responda APENAS com um objeto JSON no formato:
    {
      "summary": "Resumo geral do tópico",
      "facts": ["fato 1", "fato 2", "fato 3"],
      "sources": [{"title": "Nome da fonte", "url": "url"}]
    }
  `;

  const researchResponse = await llm.complete(researchPrompt, { task: 'observer', jsonMode: true, temperature: 0.3 });
  console.log(JSON.stringify(JSON.parse(researchResponse), null, 2));
}

test().catch(console.error);
