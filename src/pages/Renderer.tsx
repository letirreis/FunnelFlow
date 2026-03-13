import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Funnel, Question, AnswerOption, Diagnosis, Lead } from '../types';
import { Button, Card, Input } from '../components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, CheckCircle2, Layout, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';

export function Renderer({ slug }: { slug: string }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Record<string, AnswerOption[]>>({});
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  
  const [step, setStep] = useState<'intro' | 'questions' | 'lead' | 'result'>('intro');
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', consent: false });
  const [finalDiagnosis, setFinalDiagnosis] = useState<Diagnosis | null>(null);
  const [totalScore, setTotalScore] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const qFunnel = query(collection(db, 'funnels'), where('slug', '==', slug));
        const sFunnel = await getDocs(qFunnel);
        if (sFunnel.empty) throw new Error('Funil não encontrado');
        
        const fData = { id: sFunnel.docs[0].id, ...sFunnel.docs[0].data() } as Funnel;
        setFunnel(fData);

        const qQuestions = query(collection(db, 'funnels', fData.id, 'questions'), orderBy('order', 'asc'));
        const sQuestions = await getDocs(qQuestions);
        const qData = sQuestions.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
        setQuestions(qData);

        const opts: Record<string, AnswerOption[]> = {};
        for (const q of qData) {
          const sOpts = await getDocs(collection(db, 'funnels', fData.id, 'questions', q.id, 'options'));
          opts[q.id] = sOpts.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnswerOption));
        }
        setOptions(opts);

        const sDiagnoses = await getDocs(collection(db, 'funnels', fData.id, 'diagnoses'));
        setDiagnoses(sDiagnoses.docs.map(doc => ({ id: doc.id, ...doc.data() } as Diagnosis)));

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };
    fetchData();
  }, [slug]);

  const handleAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (currentQuestionIdx < questions.length - 1) {
      setTimeout(() => setCurrentQuestionIdx(prev => prev + 1), 300);
    } else {
      setTimeout(() => setStep('lead'), 300);
    }
  };

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.consent) return alert('Você precisa aceitar os termos.');

    // Calculate Score
    let score = 0;
    Object.entries(answers).forEach(([qId, val]) => {
      const qOptions = options[qId] || [];
      const selected = qOptions.find(o => o.id === val);
      if (selected) score += selected.score;
    });
    setTotalScore(score);

    // Find Diagnosis
    const diag = diagnoses.find(d => score >= d.minScore && score <= d.maxScore) || diagnoses[0];
    setFinalDiagnosis(diag);

    // Save Lead
    const leadRef = await addDoc(collection(db, 'leads'), {
      funnelId: funnel!.id,
      ...leadForm,
      createdAt: new Date().toISOString()
    });

    // Save Response
    await addDoc(collection(db, 'responses'), {
      funnelId: funnel!.id,
      leadId: leadRef.id,
      answersJson: JSON.stringify(answers),
      score,
      diagnosisId: diag?.id || 'none',
      createdAt: new Date().toISOString()
    });

    setStep('result');
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  if (error) return <div className="flex h-screen items-center justify-center text-red-500">{error}</div>;
  if (!funnel) return null;

  const currentQuestion = questions[currentQuestionIdx];
  const progress = ((currentQuestionIdx + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        
        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div 
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="mb-8 flex justify-center">
                <div className="h-16 w-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-200">
                  <Layout className="h-8 w-8 text-white" />
                </div>
              </div>
              <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{funnel.name}</h1>
              <p className="mb-10 text-xl text-slate-600">Descubra seu diagnóstico personalizado em poucos minutos.</p>
              <Button onClick={() => setStep('questions')} className="h-14 px-10 text-lg rounded-full shadow-lg shadow-blue-200">
                Começar Diagnóstico
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          )}

          {step === 'questions' && (
            <motion.div 
              key="questions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                  <span>Pergunta {currentQuestionIdx + 1} de {questions.length}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <motion.div 
                    className="h-full bg-blue-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-3xl font-bold leading-tight">{currentQuestion.text}</h2>
                {currentQuestion.description && <p className="text-lg text-slate-500">{currentQuestion.description}</p>}
                
                <div className="grid gap-3">
                  {(options[currentQuestion.id] || []).map((opt) => (
                    <motion.button
                      key={opt.id}
                      whileHover={{ scale: 1.01, x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleAnswer(currentQuestion.id, opt.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border-2 p-5 text-left transition-all",
                        answers[currentQuestion.id] === opt.id 
                          ? "border-blue-600 bg-blue-50 ring-4 ring-blue-50" 
                          : "border-slate-100 hover:border-blue-200 hover:bg-slate-50"
                      )}
                    >
                      <span className="text-lg font-medium">{opt.text}</span>
                      <div className={cn(
                        "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                        answers[currentQuestion.id] === opt.id ? "border-blue-600 bg-blue-600" : "border-slate-200"
                      )}>
                        {answers[currentQuestion.id] === opt.id && <CheckCircle2 className="h-4 w-4 text-white" />}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-8">
                <Button 
                  variant="ghost" 
                  onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestionIdx === 0}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'lead' && (
            <motion.div 
              key="lead"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="text-center">
                <h2 className="mb-2 text-3xl font-bold">Quase lá!</h2>
                <p className="text-slate-500">Preencha seus dados para ver seu resultado personalizado.</p>
              </div>
              
              <form onSubmit={submitLead} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Nome Completo</label>
                  <Input 
                    required 
                    value={leadForm.name} 
                    onChange={e => setLeadForm(prev => ({ ...prev, name: e.target.value }))}
                    className="h-12 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">E-mail Corporativo</label>
                  <Input 
                    type="email" 
                    required 
                    value={leadForm.email} 
                    onChange={e => setLeadForm(prev => ({ ...prev, email: e.target.value }))}
                    className="h-12 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Telefone / WhatsApp</label>
                  <Input 
                    type="tel" 
                    value={leadForm.phone} 
                    onChange={e => setLeadForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="h-12 rounded-xl"
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer py-2">
                  <input 
                    type="checkbox" 
                    required 
                    checked={leadForm.consent} 
                    onChange={e => setLeadForm(prev => ({ ...prev, consent: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-500 leading-relaxed">
                    Concordo em receber comunicações e aceito a Política de Privacidade conforme a LGPD.
                  </span>
                </label>
                <Button type="submit" className="w-full h-14 text-lg rounded-xl shadow-lg shadow-blue-200">
                  Ver meu Diagnóstico
                </Button>
              </form>
            </motion.div>
          )}

          {step === 'result' && finalDiagnosis && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-blue-600">Seu Diagnóstico</h2>
              <h1 className="mb-6 text-4xl font-extrabold">{finalDiagnosis.title}</h1>
              
              <Card className="mb-10 p-8 text-left border-2 border-blue-50 shadow-xl shadow-blue-50/50">
                <p className="text-lg leading-relaxed text-slate-600 whitespace-pre-wrap">{finalDiagnosis.description}</p>
              </Card>

              {finalDiagnosis.cta && (
                <Button 
                  onClick={() => window.open(finalDiagnosis.cta?.url, '_blank')}
                  className="h-14 px-10 text-lg rounded-full shadow-lg shadow-blue-200"
                >
                  {finalDiagnosis.cta.text}
                </Button>
              )}
              
              <p className="mt-8 text-sm text-slate-400">Score Final: {totalScore}</p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
