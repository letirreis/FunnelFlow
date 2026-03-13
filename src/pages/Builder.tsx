import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, orderBy, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Funnel, Question, AnswerOption, Diagnosis } from '../types';
import { Button, Card, Input } from '../components/ui';
import { ArrowLeft, Plus, Settings, BarChart2, Users, Save, Trash2, ChevronRight, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LeadsList } from '../components/LeadsList';

export function Builder({ funnelId, onBack }: { funnelId: string; onBack: () => void }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [activeTab, setActiveTab] = useState<'builder' | 'diagnoses' | 'settings' | 'leads'>('builder');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  useEffect(() => {
    const unsubFunnel = onSnapshot(doc(db, 'funnels', funnelId), (doc) => {
      setFunnel({ id: doc.id, ...doc.data() } as Funnel);
    });

    const qQuestions = query(collection(db, 'funnels', funnelId, 'questions'), orderBy('order', 'asc'));
    const unsubQuestions = onSnapshot(qQuestions, (snapshot) => {
      setQuestions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
    });

    const qDiagnoses = query(collection(db, 'funnels', funnelId, 'diagnoses'));
    const unsubDiagnoses = onSnapshot(qDiagnoses, (snapshot) => {
      setDiagnoses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Diagnosis)));
    });

    return () => {
      unsubFunnel();
      unsubQuestions();
      unsubDiagnoses();
    };
  }, [funnelId]);

  const addQuestion = async () => {
    await addDoc(collection(db, 'funnels', funnelId, 'questions'), {
      funnelId,
      order: questions.length,
      type: 'single',
      text: 'Nova Pergunta',
      createdAt: new Date().toISOString()
    });
  };

  const addDiagnosis = async () => {
    await addDoc(collection(db, 'funnels', funnelId, 'diagnoses'), {
      funnelId,
      title: 'Novo Diagnóstico',
      description: 'Descrição do diagnóstico...',
      minScore: 0,
      maxScore: 100,
      createdAt: new Date().toISOString()
    });
  };

  if (!funnel) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{funnel.name}</h1>
            <p className="text-xs text-slate-500">/{funnel.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <nav className="mr-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {[
              { id: 'builder', label: 'Builder', icon: LayoutIcon },
              { id: 'diagnoses', label: 'Diagnósticos', icon: BarChart2 },
              { id: 'leads', label: 'Leads', icon: Users },
              { id: 'settings', label: 'Configurações', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
          <Button variant="secondary">Preview</Button>
          <Button>Publicar</Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden bg-slate-50">
        {activeTab === 'builder' && (
          <div className="flex h-full">
            <div className="flex-1 overflow-y-auto p-8">
              <div className="mx-auto max-w-2xl space-y-4">
                {questions.map((q, idx) => (
                  <QuestionCard 
                    key={q.id} 
                    question={q} 
                    index={idx} 
                    isSelected={selectedQuestionId === q.id}
                    onClick={() => setSelectedQuestionId(q.id)}
                  />
                ))}
                <Button onClick={addQuestion} variant="secondary" className="w-full border-dashed py-8">
                  <Plus className="mr-2 h-5 w-5" />
                  Adicionar Pergunta
                </Button>
              </div>
            </div>
            <div className="w-96 border-l border-slate-200 bg-white overflow-y-auto">
              {selectedQuestionId ? (
                <QuestionEditor 
                  funnelId={funnelId} 
                  questionId={selectedQuestionId} 
                  onClose={() => setSelectedQuestionId(null)} 
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
                  <ChevronRight className="mb-4 h-12 w-12 opacity-20" />
                  <p>Selecione uma pergunta para editar suas propriedades.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'diagnoses' && (
          <div className="p-8">
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Diagnósticos</h2>
                <Button onClick={addDiagnosis}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Diagnóstico
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {diagnoses.map(d => (
                  <DiagnosisCard key={d.id} diagnosis={d} funnelId={funnelId} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leads' && (
          <LeadsList funnelId={funnelId} />
        )}
      </main>
    </div>
  );
}

const QuestionCard = ({ question, index, isSelected, onClick }: { question: Question; index: number; isSelected: boolean; onClick: () => void; key?: any }) => {
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:border-blue-300",
        isSelected && "border-blue-500 ring-2 ring-blue-500/10"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
          {index + 1}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-slate-900">{question.text}</h4>
          <p className="text-xs text-slate-500 uppercase tracking-wider">{question.type}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-300" />
      </div>
    </Card>
  );
}

function QuestionEditor({ funnelId, questionId, onClose }: { funnelId: string; questionId: string; onClose: () => void }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [options, setOptions] = useState<AnswerOption[]>([]);

  useEffect(() => {
    const unsubQ = onSnapshot(doc(db, 'funnels', funnelId, 'questions', questionId), (doc) => {
      setQuestion({ id: doc.id, ...doc.data() } as Question);
    });
    const qOptions = query(collection(db, 'funnels', funnelId, 'questions', questionId, 'options'));
    const unsubO = onSnapshot(qOptions, (snapshot) => {
      setOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnswerOption)));
    });
    return () => { unsubQ(); unsubO(); };
  }, [funnelId, questionId]);

  const updateQuestion = async (data: Partial<Question>) => {
    await updateDoc(doc(db, 'funnels', funnelId, 'questions', questionId), data);
  };

  const addOption = async () => {
    await addDoc(collection(db, 'funnels', funnelId, 'questions', questionId, 'options'), {
      questionId,
      text: 'Nova Opção',
      score: 0,
      tags: []
    });
  };

  const updateOption = async (id: string, data: Partial<AnswerOption>) => {
    await updateDoc(doc(db, 'funnels', funnelId, 'questions', questionId, 'options', id), data);
  };

  const deleteOption = async (id: string) => {
    await deleteDoc(doc(db, 'funnels', funnelId, 'questions', questionId, 'options', id));
  };

  const deleteQuestion = async () => {
    if (confirm('Excluir esta pergunta?')) {
      await deleteDoc(doc(db, 'funnels', funnelId, 'questions', questionId));
      onClose();
    }
  };

  if (!question) return null;

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-bold text-slate-900">Editar Pergunta</h3>
        <Button variant="ghost" onClick={onClose} className="p-1">
          <ChevronDown className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-500">Texto da Pergunta</label>
          <Input 
            value={question.text} 
            onChange={(e) => updateQuestion({ text: e.target.value })} 
            placeholder="Ex: Qual o seu faturamento mensal?"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-500">Tipo de Resposta</label>
          <select 
            className="w-full rounded-lg border border-slate-200 p-2 text-sm"
            value={question.type}
            onChange={(e) => updateQuestion({ type: e.target.value as any })}
          >
            <option value="single">Escolha Única</option>
            <option value="multi">Múltipla Escolha</option>
            <option value="scale">Escala (1-5)</option>
            <option value="boolean">Sim/Não</option>
            <option value="text">Texto Livre</option>
            <option value="number">Número</option>
          </select>
        </div>

        {['single', 'multi'].includes(question.type) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase text-slate-500">Opções de Resposta</label>
              <Button onClick={addOption} variant="ghost" className="h-6 px-2 text-xs">
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {options.map(opt => (
                <div key={opt.id} className="flex items-center gap-2">
                  <Input 
                    value={opt.text} 
                    onChange={(e) => updateOption(opt.id, { text: e.target.value })} 
                    className="flex-1"
                  />
                  <Input 
                    type="number" 
                    value={opt.score} 
                    onChange={(e) => updateOption(opt.id, { score: Number(e.target.value) })} 
                    className="w-16"
                  />
                  <Button onClick={() => deleteOption(opt.id)} variant="ghost" className="p-1 text-slate-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-6">
        <Button onClick={deleteQuestion} variant="ghost" className="w-full text-red-500 hover:bg-red-50">
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir Pergunta
        </Button>
      </div>
    </div>
  );
}

const DiagnosisCard = ({ diagnosis, funnelId }: { diagnosis: Diagnosis; funnelId: string; key?: any }) => {
  const update = (data: Partial<Diagnosis>) => {
    updateDoc(doc(db, 'funnels', funnelId, 'diagnoses', diagnosis.id), data);
  };

  return (
    <Card className="p-4 space-y-4">
      <Input 
        value={diagnosis.title} 
        onChange={(e) => update({ title: e.target.value })} 
        placeholder="Título do Diagnóstico"
        className="font-bold"
      />
      <textarea 
        value={diagnosis.description}
        onChange={(e) => update({ description: e.target.value })}
        className="w-full rounded-lg border border-slate-200 p-2 text-sm"
        rows={3}
        placeholder="Descrição detalhada..."
      />
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] font-bold uppercase text-slate-500">Score Mínimo</label>
          <Input type="number" value={diagnosis.minScore} onChange={(e) => update({ minScore: Number(e.target.value) })} />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[10px] font-bold uppercase text-slate-500">Score Máximo</label>
          <Input type="number" value={diagnosis.maxScore} onChange={(e) => update({ maxScore: Number(e.target.value) })} />
        </div>
      </div>
    </Card>
  );
}

const LayoutIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
  </svg>
);

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
