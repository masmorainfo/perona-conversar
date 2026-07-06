export interface OpportunityHealthFactors {
  category: string;
  sourceCount: number;
  geographicExpansion: number;
  editorialCompatibility: number;
  momentum: number;
}

export interface ScoringPolicyConfig {
  decayRates: Record<string, number>;
  defaultDecayRate: number;
  multipliers: {
    momentum: number;
    diversity: number;
    geographic: number;
  };
}

export const defaultScoringPolicy: ScoringPolicyConfig = {
  decayRates: {
    'BREAKING_NEWS': 20.0,
    'EVERGREEN': 0.5,
    'LAUNCH': 2.0,
  },
  defaultDecayRate: 5.0,
  multipliers: {
    momentum: 10.0,
    diversity: 5.0,
    geographic: 10.0,
  }
};

export interface OpportunityScoringStrategy {
  calculateScore(
    baseScore: number, 
    factors: OpportunityHealthFactors,
    createdAtMs: number, 
    nowMs: number
  ): number;
}

export class DefaultScoringStrategy implements OpportunityScoringStrategy {
  constructor(private config: ScoringPolicyConfig = defaultScoringPolicy) {}

  calculateScore(
    baseScore: number, 
    factors: OpportunityHealthFactors,
    createdAtMs: number, 
    nowMs: number
  ): number {
    const hoursSinceCreation = Math.max(0, (nowMs - createdAtMs) / (1000 * 60 * 60));
    
    // 1. Decaimento Baseado na Categoria
    const category = (factors.category || '').toUpperCase();
    const decayRate = this.config.decayRates[category] ?? this.config.defaultDecayRate;
    const decayPenalty = hoursSinceCreation * decayRate;

    // 2. Fatores de Sustentação (Saúde da Oportunidade)
    const momentumBoost = (factors.momentum ?? 0) * this.config.multipliers.momentum; 
    const diversityBoost = (factors.sourceCount ?? 1) * this.config.multipliers.diversity;
    const geographicBoost = (factors.geographicExpansion ?? 0) * this.config.multipliers.geographic;
    
    const healthMitigation = momentumBoost + diversityBoost + geographicBoost;
    
    // O decaimento efetivo nunca é negativo
    const effectiveDecay = Math.max(0, decayPenalty - healthMitigation);

    // 3. Aplicação do Fator Editorial
    const compatibilityMultiplier = typeof factors.editorialCompatibility === 'number' ? factors.editorialCompatibility : 1.0;
    
    let dynamicScore = (baseScore - effectiveDecay) * compatibilityMultiplier;

    // Normalização final entre 0 e 100
    return Math.max(0, Math.min(100, dynamicScore));
  }
}
