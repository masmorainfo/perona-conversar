import { OpenAIProvider } from '@cos/llm';

export interface VerificationResult {
  accepted: boolean;
  visionDescription: string;
  reason?: string;
}

export interface ExpectedContext {
  subject?: string;
  club?: string;
  competition?: string;
  year?: string;
  sceneText?: string;
}

/**
 * Gate de Verificação Visual por Modelo de Visão (LLM Vision)
 * Envia a imagem para o modelo multimodal perguntando a descrição objetiva
 * e valida a coerência factual contra os requisitos da cena.
 */
export async function verifyVisualCoherence(
  imageUrl: string,
  expectedContext: ExpectedContext
): Promise<VerificationResult> {
  const provider = new OpenAIProvider();
  
  const promptText = `Descreva esta imagem objetivamente: quantas pessoas aparecem, cores e detalhes exatos dos uniformes (camisa, calção, cores, escudos ou patrocinadores visíveis), modalidade esportiva aparente (futebol (soccer) vs futebol americano, etc), marcadores temporais (estilo da imagem, patrocínios da época, arquitetura do estádio), tipo de local (estádio, campo, coletiva), e qualquer texto ou logo legível.`;

  let visionDescription = '';

  try {
    const forceMock = process.env.FORCE_MOCK_LLM === 'true';
    const apiKey = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
    
    if (!apiKey || forceMock) {
      console.warn(`[Visual Verifier] API Key de visão não disponível. Pulando verificação por visão.`);
      return {
        accepted: true,
        visionDescription: 'Verificação por visão ignorada (sem chave de API)'
      };
    }

    console.log(`[Visual Verifier] Chamando provider.completeVision para validar: ${imageUrl}`);
    visionDescription = await provider.completeVision(promptText, imageUrl, { task: 'vision' });
    console.log(`[Visual Verifier] Descrição retornada pelo modelo: "${visionDescription.substring(0, 120)}..."`);
  } catch (err: any) {
    console.error(`[Visual Verifier] Erro ao chamar modelo de visão:`, err.message);
    return {
      accepted: false,
      visionDescription: 'Erro na API de visão',
      reason: `Falha técnica no modelo de visão: ${err.message}`
    };
  }

  // ─── Filtro Objetivo de Coerência Factual ─────────────────────────────────
  const descLower = visionDescription.toLowerCase();
  const topicLower = ((expectedContext.subject || '') + ' ' + (expectedContext.club || '') + ' ' + (expectedContext.sceneText || '')).toLowerCase();

  // Exemplo Concreto 1: Fato pede Santos FC (camisa branca/preta), mas a imagem mostra Seleção Brasileira (camisa amarela/verde)
  const requiresSantos = /santos/i.test(topicLower);
  const mentionsBrazilNationalTeam = /seleç[ãa]o brasileira|uniforme amarelo|camisa amarela|amarelo e azul|canarinho/i.test(descLower);
  if (requiresSantos && mentionsBrazilNationalTeam) {
    return {
      accepted: false,
      visionDescription,
      reason: 'Incoerência factual: A cena narra o Santos FC, mas a imagem exibe o uniforme amarelo da Seleção Brasileira.'
    };
  }

  // Verificação de Modalidade Esportiva
  const isAmericanFootball = /futebol americano|capacete|ombreira|bola oval|nfl|american football/i.test(descLower);
  if (isAmericanFootball) {
    return {
      accepted: false,
      visionDescription,
      reason: 'Incoerência factual: A imagem exibe futebol americano, mas a cena narra futebol (soccer).'
    };
  }

  // Verificação Temporal Baseada na Visão
  if (expectedContext.year) {
    const expectedYearInt = parseInt(expectedContext.year, 10);
    const yearsInDesc = descLower.match(/\b(19\d{2}|20\d{2})\b/g);
    if (yearsInDesc) {
      for (const y of yearsInDesc) {
        const foundYear = parseInt(y, 10);
        if (Math.abs(foundYear - expectedYearInt) > 2) {
          return {
            accepted: false,
            visionDescription,
            reason: `Incoerência temporal: O contexto pede ${expectedContext.year}, mas a imagem exibe elementos (texto/logo) lidos como ${foundYear}.`
          };
        }
      }
    }
  }

  // Exemplo Concreto 2: Fato pede Santos FC ou Seleção, mas a imagem mostra Barcelona, PSG ou Al Hilal
  const mentionsOtherClubs = /barcelona|psg|paris saint-germain|al hilal|al-hilal|al hilal/i.test(descLower);
  if (requiresSantos && mentionsOtherClubs) {
    return {
      accepted: false,
      visionDescription,
      reason: 'Incoerência factual: A cena narra o Santos FC em 2011, mas a imagem exibe uniforme de outro clube (Barcelona/PSG/Al Hilal).'
    };
  }

  // Exemplo Concreto 3: Fato pede Manchester United / Champions 1999, mas imagem mostra outro time/atleta
  const requiresManUtd = /manchester united|solskj[æa]er|sheringham/i.test(topicLower);
  const mentionsBayernOrOther = /bayern|camisa vermelha do bayern/i.test(descLower) && !/manchester/i.test(descLower);
  if (requiresManUtd && mentionsBayernOrOther) {
    return {
      accepted: false,
      visionDescription,
      reason: 'Incoerência factual: A cena narra o Manchester United, mas a imagem exibe apenas o time adversário.'
    };
  }

  return {
    accepted: true,
    visionDescription
  };
}
