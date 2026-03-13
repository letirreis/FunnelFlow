export type QuestionType = 'single' | 'multi' | 'scale' | 'boolean' | 'text' | 'number' | 'image';

export interface Branding {
  primaryColor: string;
  logoUrl?: string;
  fontFamily?: string;
}

export interface Funnel {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  status: 'draft' | 'published';
  branding: Branding;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  funnelId: string;
  order: number;
  type: QuestionType;
  text: string;
  description?: string;
  imageUrl?: string;
  conditionalLogic?: any;
}

export interface AnswerOption {
  id: string;
  questionId: string;
  text: string;
  score: number;
  tags: string[];
  imageUrl?: string;
}

export interface Diagnosis {
  id: string;
  funnelId: string;
  title: string;
  description: string;
  minScore: number;
  maxScore: number;
  imageUrl?: string;
  cta?: {
    text: string;
    url: string;
  };
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
  createdAt: string;
}

export interface Response {
  id: string;
  funnelId: string;
  leadId?: string;
  answersJson: string;
  score: number;
  diagnosisId: string;
  createdAt: string;
}
