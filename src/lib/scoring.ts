/**
 * Pure scoring functions for FunnelFlow.
 * No side-effects, no eval — safe for client-side execution.
 */
import { AnswerOption, KoCondition, KoRule, Question, ScoringConfig } from '../types';

const MAX_SCORE = 64; // Score range defined by the business: 0–64
const MIN_SCORE = 0;

// ─── Score calculation ────────────────────────────────────────────────────────

/**
 * Simple sum of selected answer scores (original behaviour).
 */
export function calculateSimpleScore(
  answers: Record<string, any>,
  options: Record<string, AnswerOption[]>
): number {
  let score = 0;
  for (const [qId, val] of Object.entries(answers)) {
    const qOptions = options[qId] || [];
    const selected = qOptions.find(o => o.id === val);
    if (selected) score += selected.score;
  }
  return score;
}

/**
 * Weighted average: round( sum(score*weight) / sum(weight) ), clamped to 0–64.
 * Only answered questions count.  Weight defaults to 1 when not set.
 */
export function calculateWeightedAverageScore(
  answers: Record<string, any>,
  questions: Question[],
  options: Record<string, AnswerOption[]>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const q of questions) {
    const answerId = answers[q.id];
    if (answerId === undefined || answerId === null) continue;

    const qOptions = options[q.id] || [];
    const selected = qOptions.find(o => o.id === answerId);
    if (!selected) continue;

    const weight = q.scoring?.weight ?? 1;
    weightedSum += selected.score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return MIN_SCORE;

  const raw = Math.round(weightedSum / totalWeight);
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, raw));
}

/**
 * Dispatch to the correct calculation based on scoring config.
 * Falls back to simple sum when no config is present.
 */
export function calculateScore(
  scoring: ScoringConfig | undefined,
  answers: Record<string, any>,
  questions: Question[],
  options: Record<string, AnswerOption[]>
): number {
  if (scoring?.mode === 'weighted_average') {
    return calculateWeightedAverageScore(answers, questions, options);
  }
  return calculateSimpleScore(answers, options);
}

// ─── KO evaluation ───────────────────────────────────────────────────────────

export interface KoResult {
  triggered: boolean;
  reason?: string;
}

function evaluateKoCondition(
  cond: KoCondition,
  answers: Record<string, any>,
  score: number
): boolean {
  switch (cond.type) {
    case 'answer_equals':
      return cond.questionId !== undefined && answers[cond.questionId] === cond.value;
    case 'answer_not_equals':
      return cond.questionId !== undefined && answers[cond.questionId] !== cond.value;
    case 'answer_in':
      return (
        cond.questionId !== undefined &&
        Array.isArray(cond.value) &&
        cond.value.includes(answers[cond.questionId])
      );
    case 'score_gt':
      return score > Number(cond.value);
    case 'score_lt':
      return score < Number(cond.value);
    case 'score_gte':
      return score >= Number(cond.value);
    case 'score_lte':
      return score <= Number(cond.value);
    default:
      return false;
  }
}

function evaluateKoRule(
  rule: KoRule,
  answers: Record<string, any>,
  score: number
): boolean {
  const results = rule.conditions.map(c => evaluateKoCondition(c, answers, score));
  return rule.matchType === 'all' ? results.every(r => r) : results.some(r => r);
}

/**
 * Evaluates all KO rules and returns the first triggered result.
 * Returns { triggered: false } when no rules are defined or none match.
 * Never uses eval — pure JSON-logic evaluation.
 */
export function evaluateKo(
  koRules: KoRule[] | undefined,
  answers: Record<string, any>,
  score: number
): KoResult {
  if (!koRules || koRules.length === 0) return { triggered: false };

  for (const rule of koRules) {
    if (evaluateKoRule(rule, answers, score)) {
      return { triggered: true, reason: rule.description };
    }
  }

  return { triggered: false };
}
