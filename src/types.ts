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
  /** Shape of primary action buttons. Defaults to 'pill' (fully rounded). */
  buttonShape?: 'pill' | 'rounded' | 'square';
}

export interface CoverPage {
  /** Whether to show the cover/intro page. Defaults to true when absent. */
  enabled: boolean;
  /** Description text (HTML) shown below the title. Falls back to a default phrase when absent. */
  description?: string;
  /** CTA button label. Defaults to "Começar Diagnóstico" when absent. */
  buttonText?: string;
  /** Optional hero image URL. */
  imageUrl?: string;
  /** Max height of the hero image in pixels (e.g. 256). Defaults to 256. */
  imageMaxHeight?: number;
  /** CSS object-fit for the hero image. Defaults to 'cover'. */
  imageObjectFit?: 'cover' | 'contain' | 'fill';
}

export interface LeadFormField {
  id: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'number';
  /** Maps to a Lead document field (name, email, phone, company, revenue, role, or custom_*). */
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  enabled: boolean;
  /** Options list for select-type fields. */
  options?: string[];
}

/** Built-in fields available for the lead capture form. */
export const DEFAULT_LEAD_FIELDS: LeadFormField[] = [
  { id: 'field_name',    type: 'text',  key: 'name',    label: 'Nome Completo',       required: true,  enabled: true  },
  { id: 'field_email',   type: 'email', key: 'email',   label: 'E-mail',              required: true,  enabled: true  },
  { id: 'field_phone',   type: 'tel',   key: 'phone',   label: 'Telefone / WhatsApp', required: false, enabled: true  },
  { id: 'field_company', type: 'text',  key: 'company', label: 'Empresa',             required: false, enabled: false },
  { id: 'field_revenue', type: 'text',  key: 'revenue', label: 'Faturamento',         required: false, enabled: false },
  { id: 'field_role',    type: 'text',  key: 'role',    label: 'Cargo',               required: false, enabled: false },
];

export interface LeadCaptureConfig {
  /**
   * Where in the quiz flow the lead form appears.
   * 'before_questions' (default): after cover page, before questions.
   * 'after_questions': after all questions, before the result.
   * 'disabled': no lead capture form is shown.
   */
  position: 'before_questions' | 'after_questions' | 'disabled';
  /** Configured form fields. Defaults to DEFAULT_LEAD_FIELDS when absent or empty. */
  fields: LeadFormField[];
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
  /** Optional cover / intro page configuration. Defaults to enabled when absent. */
  coverPage?: CoverPage;
  /** Optional lead capture form configuration. Defaults to before_questions when absent. */
  leadCapture?: LeadCaptureConfig;
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
  /** Meta Pixel ID for tracking Lead events when the lead form is submitted. */
  metaPixelId?: string;
  /** Meta Conversions API access token for server-side Lead event tracking. */
  metaConversionsApiToken?: string;
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
  /** Whether to show confetti animation when this diagnosis is the final result. Defaults to true. */
  showConfetti?: boolean;
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
  /** Values for any custom fields added by the funnel owner. */
  customFields?: Record<string, string>;
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
