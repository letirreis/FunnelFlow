export type UserRole = 'admin' | 'colaborador' | 'infra';

// ─── Scoring / KO ────────────────────────────────────────────────────────────

export type KoConditionType =
  | 'answer_equals'
  | 'answer_not_equals'
  | 'answer_in'
  | 'score_gt'
  | 'score_lt'
  | 'score_gte'
  | 'score_lte';

export interface KoCondition {
  type: KoConditionType;
  /** Required for answer_* conditions */
  questionId?: string;
  /** For answer_* the option id (or array for answer_in); for score_* a number */
  value: any;
}

export interface KoRule {
  id: string;
  description?: string;
  matchType: 'all' | 'any';
  conditions: KoCondition[];
}

export interface ScoringConfig {
  mode: 'simple' | 'weighted_average';
  /** ID of the diagnosis to show when KO triggers */
  disqualifiedDiagnosisId?: string;
  /** JSON-rule based KO evaluation (no eval — evaluated client-side via evaluateKo) */
  koRules?: KoRule[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = 'single' | 'multi' | 'scale' | 'boolean' | 'text' | 'number' | 'image' | 'message';

export interface Branding {
  primaryColor: string;
  backgroundColor?: string;
  textColor?: string;
  logoUrl?: string;
  fontFamily?: string;
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: ('lead_captured' | 'response_submitted')[];
  enabled: boolean;
  secret?: string;
}

export interface Funnel {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  status: 'draft' | 'published';
  branding: Branding;
  views: number;
  leadsCount: number;
  abTesting?: {
    enabled: boolean;
    variantBTitle?: string;
    variantBDescription?: string;
  };
  integrations?: {
    webhooks: WebhookConfig[];
  };
  /** Optional advanced scoring configuration. Absent = existing simple-sum behaviour. */
  scoring?: ScoringConfig;
  createdAt: string;
  updatedAt: string;
}

export interface LogicCondition {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: any;
}

export interface LogicRule {
  id: string;
  matchType: 'all' | 'any'; // AND | OR
  conditions: LogicCondition[];
  action: {
    type: 'jump' | 'disqualify' | 'force_diagnosis';
    targetId?: string;
  };
}

export interface Question {
  id: string;
  funnelId: string;
  order: number;
  type: QuestionType;
  text: string;
  description?: string;
  imageUrl?: string;
  buttonText?: string;
  layout?: 'grid' | 'list';
  rules?: LogicRule[];
  /** Per-question scoring metadata for weighted_average mode */
  scoring?: {
    /** Multiplier for this question's score. Defaults to 1. */
    weight?: number;
  };
}

export interface AnswerOption {
  id: string;
  questionId: string;
  text: string;
  score: number;
  tags: string[];
  imageUrl?: string;
  action?: {
    type: 'jump' | 'disqualify' | 'force_diagnosis';
    targetId?: string; // Question ID or Diagnosis ID
  };
}

export interface Diagnosis {
  id: string;
  funnelId: string;
  title: string;
  description: string;
  minScore: number;
  maxScore: number;
  imageUrl?: string;
  ctas?: {
    id: string;
    type: 'custom' | 'whatsapp' | 'purchase' | 'video';
    text: string;
    url: string;
  }[];
  // Legacy single CTA support
  cta?: {
    text: string;
    url: string;
  };
}

export interface TrackingData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  device?: string;
}

export interface Lead {
  id: string;
  funnelId: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  revenue?: string;
  role?: string;
  consent: boolean;
  status: 'incomplete' | 'completed';
  variant?: 'A' | 'B';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  device?: string;
  isDisqualified?: boolean;
  disqualifiedReason?: string | null;
  createdAt: string;
}

export interface Response {
  id: string;
  funnelId: string;
  leadId?: string;
  answersJson: string;
  score: number;
  diagnosisId: string;
  isDisqualified?: boolean;
  disqualifiedReason?: string | null;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  device?: string;
  createdAt: string;
}
