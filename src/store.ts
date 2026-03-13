import { create } from 'zustand';
import { Funnel, Question, AnswerOption, Diagnosis } from './types';

interface AppState {
  currentFunnel: Funnel | null;
  questions: Question[];
  options: Record<string, AnswerOption[]>;
  diagnoses: Diagnosis[];
  setCurrentFunnel: (funnel: Funnel | null) => void;
  setQuestions: (questions: Question[]) => void;
  setOptions: (questionId: string, options: AnswerOption[]) => void;
  setDiagnoses: (diagnoses: Diagnosis[]) => void;
}

export const useStore = create<AppState>((set) => ({
  currentFunnel: null,
  questions: [],
  options: {},
  diagnoses: [],
  setCurrentFunnel: (funnel) => set({ currentFunnel: funnel }),
  setQuestions: (questions) => set({ questions }),
  setOptions: (questionId, options) => 
    set((state) => ({ options: { ...state.options, [questionId]: options } })),
  setDiagnoses: (diagnoses) => set({ diagnoses }),
}));
