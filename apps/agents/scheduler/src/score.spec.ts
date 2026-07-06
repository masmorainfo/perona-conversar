import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DefaultScoringStrategy, OpportunityHealthFactors } from './score.js';

describe('Dynamic Score Calculation with Heuristics', () => {
  const strategy = new DefaultScoringStrategy();

  const defaultFactors: OpportunityHealthFactors = {
    category: 'NORMAL',
    sourceCount: 1,
    geographicExpansion: 0,
    editorialCompatibility: 1.0,
    momentum: 0,
  };

  test('should return base score when time difference is 0 and default factors', () => {
    const baseScore = 90;
    const now = Date.now();
    const result = strategy.calculateScore(baseScore, defaultFactors, now, now);
    assert.equal(result, 90);
  });

  test('should decay by 5 points after 1 hour (NORMAL)', () => {
    const baseScore = 90;
    const now = Date.now();
    const oneHourAgo = now - (1000 * 60 * 60);
    // decay = 5, mitigation = 5 (from sourceCount 1 * 5). wait, default sourceCount is 1 -> 5 mitigation.
    // 5 - 5 = 0 effective decay!
    // Let's set sourceCount to 0 for pure decay test
    const factors = { ...defaultFactors, sourceCount: 0 };
    const result = strategy.calculateScore(baseScore, factors, oneHourAgo, now);
    assert.equal(result, 85);
  });

  test('BREAKING_NEWS should decay rapidly (20 pts/hr) if no mitigation', () => {
    const baseScore = 100;
    const now = Date.now();
    const oneHourAgo = now - (1000 * 60 * 60);
    const factors = { ...defaultFactors, category: 'BREAKING_NEWS', sourceCount: 0 };
    const result = strategy.calculateScore(baseScore, factors, oneHourAgo, now);
    assert.equal(result, 80); // 100 - 20
  });

  test('EVERGREEN should decay very slowly (0.5 pts/hr)', () => {
    const baseScore = 100;
    const now = Date.now();
    const tenHoursAgo = now - (10 * 1000 * 60 * 60); // 10 hours
    const factors = { ...defaultFactors, category: 'EVERGREEN', sourceCount: 0 };
    const result = strategy.calculateScore(baseScore, factors, tenHoursAgo, now);
    assert.equal(result, 95); // 100 - (10 * 0.5)
  });

  test('High momentum and source diversity should mitigate decay', () => {
    const baseScore = 90;
    const now = Date.now();
    const tenHoursAgo = now - (10 * 1000 * 60 * 60); // 10 hours * 5 decay/hr = 50 penalty
    
    const factors = { 
      ...defaultFactors, 
      momentum: 2.0, // 20 mitigation
      sourceCount: 5, // 25 mitigation
      // Total mitigation = 45. Effective decay = 5.
    };
    const result = strategy.calculateScore(baseScore, factors, tenHoursAgo, now);
    assert.equal(result, 85); // 90 - 5 = 85
  });

  test('should not decay below 0', () => {
    const baseScore = 10;
    const now = Date.now();
    const threeHoursAgo = now - (3 * 1000 * 60 * 60); // 15 decay
    const factors = { ...defaultFactors, sourceCount: 0 };
    const result = strategy.calculateScore(baseScore, factors, threeHoursAgo, now);
    assert.equal(result, 0); 
  });

  test('Editorial compatibility should scale the final score', () => {
    const baseScore = 90;
    const now = Date.now();
    // 0 decay
    const factors = { ...defaultFactors, editorialCompatibility: 0.8 };
    const result = strategy.calculateScore(baseScore, factors, now, now);
    assert.equal(result, 72); // 90 * 0.8
  });

  test('should not exceed 100', () => {
    const factors = { ...defaultFactors, editorialCompatibility: 1.5 };
    const result = strategy.calculateScore(90, factors, Date.now(), Date.now()); // 135
    assert.equal(result, 100);
  });
});

