import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Funnel, Question, AnswerOption, Diagnosis, Lead, TrackingData, LogicRule } from '../types';
import { Button, Card, Input } from '../components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, CheckCircle2, Layout, ArrowRight, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { calculateScore, evaluateKo } from '../lib/scoring';

export function Renderer({ slug }: { slug: string }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Record<string, AnswerOption[]>>({});
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  
  const [step, setStep] = useState<'intro' | 'questions' | 'lead' | 'result'>('intro');
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', consent: false });
  const [isStarting, setIsStarting] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [finalDiagnosis, setFinalDiagnosis] = useState<Diagnosis | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const [variant, setVariant] = useState<'A' | 'B'>('A');

  const [tracking, setTracking] = useState<TrackingData>({});

  const handleFirestoreError = (error: unknown, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  useEffect(() => {
    // Capture UTMs from URL
    const params = new URLSearchParams(window.location.search);
    const utms: TrackingData = {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_content: params.get('utm_content') || null,
      utm_term: params.get('utm_term') || null,
      referrer: document.referrer || null,
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    };
    setTracking(utms);

    // Phase 1: load only the funnel document so the start screen renders fast
    const fetchFunnel = async () => {
      try {
        const qFunnel = query(collection(db, 'funnels'), where('slug', '==', slug));
        const sFunnel = await getDocs(qFunnel);
        if (sFunnel.empty) throw new Error('Funil não encontrado');

        const fDoc = sFunnel.docs[0];
        const fData = { id: fDoc.id, ...fDoc.data() } as Funnel;
        setFunnel(fData);

        // Increment views (non-blocking)
        updateDoc(doc(db, 'funnels', fData.id), {
          views: (fData.views || 0) + 1
        }).catch(err => console.warn('Failed to increment views:', err));

        // A/B Testing Logic
        if (fData.abTesting?.enabled) {
          const assignedVariant = Math.random() > 0.5 ? 'B' : 'A';
          setVariant(assignedVariant);
        }

        // Show start screen immediately
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };
    fetchFunnel();
  }, [slug]);

  // Phase 2: load heavy data (questions, options, diagnoses) in the background
  // after the start screen has rendered, so it doesn't block the initial paint
  useEffect(() => {
    if (!funnel?.id) return;

    const fetchHeavyData = async () => {
      try {
        const qQuestions = query(collection(db, 'funnels', funnel.id, 'questions'), orderBy('order', 'asc'));
        const sQuestions = await getDocs(qQuestions);
        const qData = sQuestions.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
        setQuestions(qData);

        const opts: Record<string, AnswerOption[]> = {};
        for (const q of qData) {
          const sOpts = await getDocs(collection(db, 'funnels', funnel.id, 'questions', q.id, 'options'));
          opts[q.id] = sOpts.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnswerOption));
        }
        setOptions(opts);

        const sDiagnoses = await getDocs(collection(db, 'funnels', funnel.id, 'diagnoses'));
        setDiagnoses(sDiagnoses.docs.map(doc => ({ id: doc.id, ...doc.data() } as Diagnosis)));
      } catch (err: any) {
        console.error('Failed to load funnel data:', err);
      } finally {
        setDataLoading(false);
      }
    };

    // Defer to the next tick so the start screen paints first
    const timeoutId = setTimeout(fetchHeavyData, 0);
    return () => clearTimeout(timeoutId);
  }, [funnel?.id]);

  const [disqualified, setDisqualified] = useState(false);
  const [forcedDiagnosisId, setForcedDiagnosisId] = useState<string | null>(null);

  const evaluateRules = (rules: LogicRule[], currentAnswers: Record<string, any>) => {
    for (const rule of rules) {
      const results = rule.conditions.map(condition => {
        const userValue = currentAnswers[condition.questionId];
        const targetValue = condition.value;

        switch (condition.operator) {
          case 'equals': return userValue === targetValue;
          case 'not_equals': return userValue !== targetValue;
          case 'greater_than': return Number(userValue) > Number(targetValue);
          case 'less_than': return Number(userValue) < Number(targetValue);
          case 'contains': return Array.isArray(userValue) && userValue.includes(targetValue);
          default: return false;
        }
      });

      const isMatch = rule.matchType === 'all' 
        ? results.every(r => r === true) 
        : results.some(r => r === true);

      if (isMatch) return rule.action;
    }
    return null;
  };

  const handleAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleContinue = () => {
    if (!currentQuestion) return;
    
    const questionId = currentQuestion.id;
    let value = answers[questionId];
    
    if (currentQuestion.type === 'message') {
      value = 'viewed';
      setAnswers(prev => ({ ...prev, [questionId]: 'viewed' }));
    }
    
    if (currentQuestion.type !== 'message' && !value) {
      return;
    }

    const currentAnswers = { ...answers, [questionId]: value };
    const qOptions = options[questionId] || [];
    const selected = qOptions.find(o => o.id === value);
    
    // 1. Check for Question-level Rules (Multi-condition)
    if (currentQuestion.rules && currentQuestion.rules.length > 0) {
      const action = evaluateRules(currentQuestion.rules, currentAnswers);
      if (action) {
        if (action.type === 'disqualify') {
          setDisqualified(true);
          setStep('result');
          return;
        }
        if (action.type === 'force_diagnosis' && action.targetId) {
          setForcedDiagnosisId(action.targetId);
          setStep('lead');
          return;
        }
        if (action.type === 'jump' && action.targetId) {
          const targetIdx = questions.findIndex(q => q.id === action.targetId);
          if (targetIdx !== -1) {
            setCurrentQuestionIdx(targetIdx);
            return;
          }
        }
      }
    }

    // 2. Check for Option-level Action (Legacy/Simple)
    if (selected?.action) {
      const { type, targetId } = selected.action;
      
      if (type === 'disqualify') {
        setDisqualified(true);
        setStep('result');
        return;
      }
      
      if (type === 'force_diagnosis' && targetId) {
        setForcedDiagnosisId(targetId);
        setStep('lead');
        return;
      }
      
      if (type === 'jump' && targetId) {
        const targetIdx = questions.findIndex(q => q.id === targetId);
        if (targetIdx !== -1) {
          setCurrentQuestionIdx(targetIdx);
          return;
        }
      }
    }

    // 3. Standard navigation
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
    } else {
      finishFunnel();
    }
  };

  const startLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    // Validate form
    if (!leadForm.name.trim()) {
      setFormError('Nome é obrigatório');
      return;
    }
    if (!leadForm.email.trim()) {
      setFormError('E-mail é obrigatório');
      return;
    }
    if (!leadForm.consent) {
      setFormError('Você deve aceitar a política de privacidade');
      return;
    }
    if (isStarting || !funnel) {
      setFormError('Carregando, tente novamente...');
      return;
    }
    
    setIsStarting(true);

    try {
      // Save Initial Lead (Incomplete)
      const leadRef = await addDoc(collection(db, 'leads'), {
        funnelId: funnel.id,
        name: leadForm.name,
        email: leadForm.email,
        phone: leadForm.phone,
        variant,
        ...tracking,
        status: 'incomplete',
        createdAt: new Date().toISOString()
      }).catch(err => {
        handleFirestoreError(err, 'create', 'leads');
        return null;
      });

      if (leadRef) {
        setLeadId(leadRef.id);
        
        // Increment Lead Count
        await updateDoc(doc(db, 'funnels', funnel.id), {
          leadsCount: (funnel.leadsCount || 0) + 1
        }).catch(err => console.warn('Failed to increment leadsCount:', err));
        
        setStep('questions');
      } else {
        setFormError('Erro ao iniciar diagnóstico. Tente novamente.');
      }
    } catch (err: any) {
      console.error('Start lead failed:', err);
      setFormError('Erro ao iniciar diagnóstico. Tente novamente.');
    } finally {
      setIsStarting(false);
    }
  };

  const finishFunnel = async () => {
    try {
      // Calculate Score (simple sum or weighted average based on funnel config)
      const score = calculateScore(funnel!.scoring, answers, questions, options);
      setTotalScore(score);

      // Evaluate KO rules (funnel-level, JSON-logic, no eval)
      const koResult = evaluateKo(funnel!.scoring?.koRules, answers, score);
      const isDisqualified = koResult.triggered;
      const disqualifiedReason = koResult.reason ?? null;

      // Find Diagnosis
      let diag: Diagnosis | undefined;

      if (isDisqualified) {
        // 1. Try configured disqualified diagnosis
        const disqId = funnel!.scoring?.disqualifiedDiagnosisId;
        if (disqId) diag = diagnoses.find(d => d.id === disqId);
        // 2. Fallback: diagnosis whose title contains the Portuguese word for "disqualified"
        if (!diag) diag = diagnoses.find(d => d.title.toLowerCase().includes('desqualificado'));
        // 3. Last resort: first diagnosis
        if (!diag) diag = diagnoses[0];
      } else if (forcedDiagnosisId) {
        diag = diagnoses.find(d => d.id === forcedDiagnosisId);
      }

      if (!diag) {
        diag = diagnoses.find(d => score >= d.minScore && score <= d.maxScore) || diagnoses[0];
      }

      setFinalDiagnosis(diag || null);

      // Update Lead to Completed
      if (leadId) {
        await updateDoc(doc(db, 'leads', leadId), {
          status: 'completed',
          finalScore: score,
          diagnosisId: diag?.id || 'none',
          isDisqualified,
          disqualifiedReason,
          updatedAt: new Date().toISOString()
        }).catch(err => handleFirestoreError(err, 'update', `leads/${leadId}`));
      }

      // Save Response
      await addDoc(collection(db, 'responses'), {
        funnelId: funnel!.id,
        leadId: leadId || 'anonymous',
        answersJson: JSON.stringify(answers),
        score,
        diagnosisId: diag?.id || 'none',
        isDisqualified,
        disqualifiedReason,
        ...tracking,
        createdAt: new Date().toISOString()
      }).catch(err => handleFirestoreError(err, 'create', 'responses'));

      // Trigger Webhooks
      if (funnel?.integrations?.webhooks && funnel.integrations.webhooks.length > 0) {
        const activeWebhooks = funnel.integrations.webhooks.filter(w => w.enabled);
        
        if (activeWebhooks.length > 0) {
          // Prepare formatted responses for the webhook
          const formattedResponses: Record<string, string> = {};
          questions.forEach(q => {
            const answerId = answers[q.id];
            const option = options[q.id]?.find(o => o.id === answerId);
            if (option) {
              const key = q.text.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 40);
              formattedResponses[key] = option.text;
            }
          });

          const payload = {
            metadata: {
              event: 'lead_completed',
              source: 'FunnelBuilder Pro',
              timestamp: new Date().toISOString(),
            },
            funnel: {
              id: funnel.id,
              name: funnel.name,
            },
            lead: {
              id: leadId,
              ...leadForm,
            },
            results: {
              score,
              isDisqualified,
              disqualifiedReason,
              diagnosis: {
                title: diag?.title || 'N/A',
                description: diag?.description || ''
              },
              responses: formattedResponses
            }
          };

          activeWebhooks.forEach(webhook => {
            fetch(webhook.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhook.secret || '' },
              body: JSON.stringify({ ...payload, security: { secret: webhook.secret } })
            }).catch(err => console.error('Webhook failed:', err));
          });
        }
      }

      setStep('result');
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error('Finish funnel failed:', err);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  if (error) return <div className="flex h-screen items-center justify-center text-red-500">{error}</div>;
  if (!funnel) return null;

  const currentQuestion = questions[currentQuestionIdx];
  const progress = questions.length > 0 ? ((currentQuestionIdx + 1) / questions.length) * 100 : 0;
  const diagnosisCtas = finalDiagnosis
    ? finalDiagnosis.ctas && finalDiagnosis.ctas.length > 0
      ? finalDiagnosis.ctas
      : finalDiagnosis.cta
        ? [{ id: 'legacy-cta', type: 'custom' as const, text: finalDiagnosis.cta.text, url: finalDiagnosis.cta.url }]
        : []
    : [];

  const brandingStyles = {
    backgroundColor: funnel.branding?.backgroundColor || '#ffffff',
    color: funnel.branding?.textColor || '#0f172a',
    '--primary': funnel.branding?.primaryColor || '#2563eb',
    fontFamily: funnel.branding?.fontFamily === 'font-serif' ? '"Playfair Display", serif' : 
                funnel.branding?.fontFamily === 'font-display' ? '"Outfit", sans-serif' :
                funnel.branding?.fontFamily === 'font-mono' ? '"JetBrains Mono", monospace' :
                funnel.branding?.fontFamily === 'font-alkatra' ? '"Alkatra", system-ui' :
                '"Inter", sans-serif'
  } as React.CSSProperties;

  return (
    <div className="min-h-screen font-sans selection:bg-blue-100 transition-colors duration-500" style={brandingStyles}>
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        
        {/* Logo Header */}
        {funnel.branding?.logoUrl && (
          <div className="mb-12 flex justify-center">
            <img 
              src={funnel.branding.logoUrl} 
              alt={funnel.name} 
              className="max-h-16 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div 
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center relative z-10"
            >
              <div className="mb-8 flex justify-center">
                {!funnel.branding?.logoUrl && (
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center shadow-xl" style={{ backgroundColor: 'var(--primary)' }}>
                    <Layout className="h-8 w-8 text-white" />
                  </div>
                )}
              </div>
              <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
                {variant === 'B' && funnel.abTesting?.variantBTitle ? funnel.abTesting.variantBTitle : funnel.name}
              </h1>
              <p className="mb-10 text-xl opacity-80">
                {variant === 'B' && funnel.abTesting?.variantBDescription ? funnel.abTesting.variantBDescription : 'Descubra seu diagnóstico personalizado em poucos minutos.'}
              </p>
              <Button 
                onClick={() => setStep('lead')} 
                className="h-14 px-10 text-lg rounded-full shadow-lg"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Começar Diagnóstico
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          )}

          {step === 'questions' && (
            dataLoading ? (
              <motion.div key="questions-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
              </motion.div>
            ) : (
            <motion.div 
              key="questions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 relative z-10"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                  <span>Pergunta {currentQuestionIdx + 1} de {questions.length}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100/20">
                  <motion.div 
                    className="h-full"
                    style={{ backgroundColor: 'var(--primary)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                  />
                </div>
              </div>

              <div className="space-y-6">
                {currentQuestion.imageUrl && (
                  <div className="mb-6 overflow-hidden rounded-2xl shadow-lg">
                    <img src={currentQuestion.imageUrl} alt="" className="w-full object-cover max-h-64" referrerPolicy="no-referrer" />
                  </div>
                )}
                <h2 className="text-3xl font-bold leading-tight">{currentQuestion.text}</h2>
                {currentQuestion.description && <p className="text-lg opacity-70">{currentQuestion.description}</p>}
                
                {currentQuestion.type === 'message' ? (
                  <div className="pt-4 space-y-6">
                    <div className="prose prose-slate max-w-none opacity-80 text-lg leading-relaxed">
                      {/* Message content is already in text/description */}
                    </div>
                    <Button 
                      onClick={handleContinue}
                      className="h-14 px-10 text-lg rounded-full shadow-lg"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      {currentQuestion.buttonText || 'Continuar'}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <div className={cn(
                    "grid gap-4",
                    currentQuestion.layout === 'list' 
                      ? "grid-cols-1" 
                      : (options[currentQuestion.id] || []).some(o => o.imageUrl) 
                        ? "grid-cols-1 sm:grid-cols-2" 
                        : "grid-cols-1"
                  )}>
                    {(options[currentQuestion.id] || []).map((opt) => (
                      <motion.button
                        key={opt.id}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleAnswer(currentQuestion.id, opt.id)}
                        className={cn(
                          "flex w-full flex-col overflow-hidden rounded-2xl border-2 transition-all",
                          answers[currentQuestion.id] === opt.id 
                            ? "border-[var(--primary)] bg-[var(--primary)]/5 ring-4 ring-[var(--primary)]/10" 
                            : "border-slate-200/20 hover:border-[var(--primary)]/50 hover:bg-slate-50/5"
                        )}
                      >
                        {opt.imageUrl && (
                          <div className="aspect-video w-full overflow-hidden">
                            <img src={opt.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        <div className="flex flex-1 items-center justify-between p-5 text-left">
                          <span className="text-lg font-medium">{opt.text}</span>
                          <div className={cn(
                            "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                            answers[currentQuestion.id] === opt.id ? "border-[var(--primary)] bg-[var(--primary)]" : "border-slate-300"
                          )}>
                            {answers[currentQuestion.id] === opt.id && <CheckCircle2 className="h-4 w-4 text-white" />}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-8">
                <Button 
                  variant="ghost" 
                  onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestionIdx === 0}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>

                {currentQuestion.type !== 'message' && (
                  <Button 
                    onClick={handleContinue}
                    disabled={!answers[currentQuestion.id]}
                    style={{ backgroundColor: 'var(--primary)' }}
                    className="h-12 px-10 text-lg rounded-xl shadow-lg font-bold"
                  >
                    Próximo
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                )}
              </div>
            </motion.div>
            )
          )}

          {step === 'lead' && (
            <motion.div 
              key="lead"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 relative z-10"
            >
              <div className="text-center">
                <h2 className="mb-2 text-3xl font-bold">Identificação</h2>
                <p className="text-slate-500">Preencha seus dados para iniciar seu diagnóstico personalizado.</p>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                  {formError}
                </div>
              )}
              
              <form onSubmit={startLead} className="space-y-4">
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
                  <label className="text-sm font-medium">E-mail</label>
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
                <Button 
                  type="submit" 
                  disabled={isStarting}
                  className="w-full h-14 text-lg rounded-xl shadow-lg flex items-center justify-center relative z-20 hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer" 
                  style={{ backgroundColor: 'var(--primary)', cursor: isStarting ? 'not-allowed' : 'pointer' }}
                >
                  {isStarting ? (
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    'Iniciar Diagnóstico'
                  )}
                </Button>
              </form>
            </motion.div>
          )}

          {step === 'result' && disqualified && (
            <motion.div 
              key="disqualified"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <XCircle className="h-10 w-10" />
              </div>
              <h1 className="mb-4 text-3xl font-extrabold">Obrigado pelo interesse!</h1>
              <p className="text-lg text-slate-600 mb-8">
                Infelizmente, com base nas suas respostas, nosso serviço não é o ideal para o seu momento atual.
              </p>
              <Button onClick={() => window.location.reload()} variant="outline">
                Recomeçar
              </Button>
            </motion.div>
          )}

          {step === 'result' && !disqualified && finalDiagnosis && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--primary)' }}>Seu Diagnóstico</h2>
              <h1 className="mb-6 text-4xl font-extrabold">{finalDiagnosis.title}</h1>
              
              <Card className="mb-10 p-8 text-left border-2 shadow-xl" style={{ borderColor: 'var(--primary)', backgroundColor: 'rgba(var(--primary), 0.05)' }}>
                <p className="text-lg leading-relaxed opacity-80 whitespace-pre-wrap">{finalDiagnosis.description}</p>
              </Card>

              {diagnosisCtas.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {diagnosisCtas.map((cta) => (
                    <Button
                      key={cta.id}
                      onClick={() => window.open(cta.url, '_blank', 'noopener,noreferrer')}
                      className="h-12 px-6 text-base rounded-full shadow-lg"
                      style={{ backgroundColor: 'var(--primary)' }}
                      disabled={!cta.url}
                    >
                      {cta.text || 'Acessar'}
                    </Button>
                  ))}
                </div>
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
