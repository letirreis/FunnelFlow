import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, collection, query, orderBy, addDoc, updateDoc, deleteDoc, getDocs, getDoc, deleteField } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { Funnel, Question, AnswerOption, Diagnosis, LogicRule, ScoringConfig, KoRule, KoCondition, CoverPage, LeadCaptureConfig, LeadFormField, DEFAULT_LEAD_FIELDS } from '../types';
import { Button, Card, Input } from '../components/ui';
import { RichTextEditor } from '../components/RichTextEditor';
import { ArrowLeft, Plus, Settings, BarChart2, Users, Save, Trash2, ChevronRight, ChevronDown, Image as ImageIcon, LogOut, Globe, TrendingUp, Layout, GripVertical, Copy, ChevronUp, Upload, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LeadsList } from '../components/LeadsList';
import { IntegrationsTab } from '../components/IntegrationsTab';
import { AnalyticsTab } from '../components/AnalyticsTab';
import { UserProfile } from '../types';

const MIN_QUESTION_WEIGHT = 1;
const MAX_QUESTION_WEIGHT = 10;

// Fields that should NOT trigger dirty state when they change (counters, timestamps)
const IGNORE_DIRTY_FIELDS = ['views', 'leadsCount', 'updatedAt', 'savedAt', 'createdAt'];

function isSubstantiveChange(prev: Funnel, next: Funnel): boolean {
  const strip = (f: Funnel) => {
    const copy = { ...f } as Record<string, unknown>;
    IGNORE_DIRTY_FIELDS.forEach(k => delete copy[k]);
    return copy;
  };
  const sortedStringify = (obj: unknown): string =>
    JSON.stringify(obj, (_, value) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
        : value
    );
  return sortedStringify(strip(prev)) !== sortedStringify(strip(next));
}

export function Builder({ funnelId, onBack }: { funnelId: string; onBack: () => void }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'diagnoses' | 'settings' | 'leads' | 'integrations' | 'analytics'>('builder');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Refs for tracking initial load and preventing false dirty state
  const loadedRef = React.useRef({ funnel: false, questions: false, diagnoses: false });
  const skipFunnelDirtyRef = React.useRef(false);
  const prevFunnelRef = React.useRef<Funnel | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Reset tracking refs when funnelId changes
    loadedRef.current = { funnel: false, questions: false, diagnoses: false };
    prevFunnelRef.current = null;
    skipFunnelDirtyRef.current = false;
    setIsDirty(false);

    const fetchProfile = async () => {
      if (auth.currentUser) {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (snap.exists()) setUserProfile(snap.data() as UserProfile);
      }
    };
    fetchProfile();

    const unsubFunnel = onSnapshot(doc(db, 'funnels', funnelId), (docSnap) => {
      const newFunnel = { id: docSnap.id, ...docSnap.data() } as Funnel;
      if (loadedRef.current.funnel) {
        if (skipFunnelDirtyRef.current) {
          skipFunnelDirtyRef.current = false;
        } else if (prevFunnelRef.current && isSubstantiveChange(prevFunnelRef.current, newFunnel)) {
          setIsDirty(true);
        }
      } else {
        loadedRef.current.funnel = true;
      }
      prevFunnelRef.current = newFunnel;
      setFunnel(newFunnel);
    });

    const qQuestions = query(collection(db, 'funnels', funnelId, 'questions'), orderBy('order', 'asc'));
    const unsubQuestions = onSnapshot(qQuestions, (snapshot) => {
      setQuestions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
      if (loadedRef.current.questions) {
        setIsDirty(true);
      } else {
        loadedRef.current.questions = true;
      }
    });

    const qDiagnoses = query(collection(db, 'funnels', funnelId, 'diagnoses'));
    const unsubDiagnoses = onSnapshot(qDiagnoses, (snapshot) => {
      setDiagnoses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Diagnosis)));
      if (loadedRef.current.diagnoses) {
        setIsDirty(true);
      } else {
        loadedRef.current.diagnoses = true;
      }
    });

    return () => {
      unsubFunnel();
      unsubQuestions();
      unsubDiagnoses();
    };
  }, [funnelId]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = questions.findIndex((q) => q.id === String(active.id));
      const newIndex = questions.findIndex((q) => q.id === String(over.id));
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newQuestions: Question[] = arrayMove(questions, oldIndex, newIndex);
        
        // Update orders in Firestore
        const batch: Promise<void>[] = [];
        newQuestions.forEach((q: Question, idx: number) => {
          if (q.order !== idx) {
            batch.push(updateDoc(doc(db, 'funnels', funnelId, 'questions', q.id), { order: idx }));
          }
        });
        await Promise.all(batch);
      }
    }
  };

  const addQuestion = async () => {
    const docRef = await addDoc(collection(db, 'funnels', funnelId, 'questions'), {
      funnelId,
      order: questions.length,
      type: 'single',
      text: 'Nova Pergunta',
      createdAt: new Date().toISOString()
    });
    setExpandedQuestionId(docRef.id);
  };

  const addDiagnosis = async () => {
    await addDoc(collection(db, 'funnels', funnelId, 'diagnoses'), {
      funnelId,
      title: 'Novo Diagnóstico',
      description: 'Descrição do diagnóstico...',
      minScore: 0,
      maxScore: 100,
      ctas: [],
      createdAt: new Date().toISOString()
    });
  };

  const saveFunnel = async () => {
    setIsSaving(true);
    skipFunnelDirtyRef.current = true;
    try {
      await updateDoc(doc(db, 'funnels', funnelId), {
        savedAt: new Date().toISOString(),
      });
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublish = async () => {
    if (!funnel) return;
    skipFunnelDirtyRef.current = true;
    const newStatus = funnel.status === 'published' ? 'draft' : 'published';
    await updateDoc(doc(db, 'funnels', funnelId), {
      status: newStatus,
      updatedAt: new Date().toISOString()
    });
    setIsDirty(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      console.warn("A imagem é muito grande. O limite é 500KB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const openPreview = () => {
    if (!funnel) return;
    window.open(`#/f/${funnel.slug}`, '_blank');
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
              { id: 'builder', label: 'Builder', icon: Layout, roles: ['admin', 'colaborador', 'infra'] },
              { id: 'diagnoses', label: 'Diagnósticos', icon: BarChart2, roles: ['admin', 'colaborador', 'infra'] },
              { id: 'leads', label: 'Leads', icon: Users, roles: ['admin', 'colaborador'] },
              { id: 'analytics', label: 'Analytics', icon: TrendingUp, roles: ['admin', 'colaborador', 'infra'] },
              { id: 'integrations', label: 'Integrações', icon: Globe, roles: ['admin', 'infra'] },
              { id: 'settings', label: 'Configurações', icon: Settings, roles: ['admin', 'colaborador'] },
            ].filter(tab => !userProfile || tab.roles.includes(userProfile.role)).map((tab) => (
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
          <Button onClick={openPreview} variant="secondary">Preview</Button>
          {/* Status badge */}
          {isDirty ? (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Não salvo
            </span>
          ) : funnel.status !== 'published' ? (
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Salvo
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Publicado
            </span>
          )}
          <Button
            onClick={saveFunnel}
            disabled={!isDirty || isSaving}
            variant="secondary"
            className="gap-1.5"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button 
            onClick={togglePublish}
            className={cn(
              funnel.status === 'published' ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {funnel.status === 'published' ? 'Despublicar' : 'Publicar'}
          </Button>
          <div className="ml-2 h-8 w-px bg-slate-200" />
          <Button onClick={() => signOut(auth)} variant="ghost" className="p-2 text-slate-400 hover:text-red-600">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden bg-slate-50">
        {activeTab === 'builder' && (
          <div className="h-full overflow-y-auto p-8">
            <div className="mx-auto max-w-3xl space-y-4 pb-20">
              <CoverPageBlock funnel={funnel} funnelId={funnelId} onUpload={handleFileUpload} />
              <LeadCaptureBlock funnel={funnel} funnelId={funnelId} />
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={questions.map(q => q.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {questions.map((q, idx) => (
                    <SortableQuestionBlock 
                      key={q.id} 
                      question={q} 
                      index={idx} 
                      funnelId={funnelId}
                      isExpanded={expandedQuestionId === q.id}
                      onToggle={() => setExpandedQuestionId(expandedQuestionId === q.id ? null : q.id)}
                      allQuestions={questions}
                      allDiagnoses={diagnoses}
                      onUpload={handleFileUpload}
                      scoringMode={funnel.scoring?.mode || 'simple'}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              
              <Button onClick={addQuestion} variant="secondary" className="w-full border-dashed py-8 bg-white hover:bg-slate-50">
                <Plus className="mr-2 h-5 w-5" />
                Adicionar Nova Pergunta
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && funnel && (
          <div className="h-full overflow-y-auto p-8">
            <div className="mx-auto max-w-6xl">
              <AnalyticsTab funnel={funnel} questions={questions} diagnoses={diagnoses} />
            </div>
          </div>
        )}

        {activeTab === 'diagnoses' && (
          <div className="h-full overflow-y-auto p-8">
            <div className="mx-auto max-w-4xl space-y-6 pb-20">
              {/* Scoring Configuration */}
              <ScoringConfigPanel funnel={funnel} funnelId={funnelId} diagnoses={diagnoses} questions={questions} />

              <div className="flex items-center justify-between">
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
          <div className="h-full overflow-y-auto">
            <LeadsList funnelId={funnelId} />
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="h-full overflow-y-auto p-8">
            <div className="mx-auto max-w-2xl space-y-8">
              <section className="space-y-4">
                <h2 className="text-xl font-bold">Configurações Gerais</h2>
                <Card className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome do Funil</label>
                    <Input 
                      value={funnel.name} 
                      onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { name: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Slug da URL</label>
                    <Input 
                      value={funnel.slug} 
                      onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { slug: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Meta Pixel ID</label>
                    <Input
                      value={funnel.metaPixelId || ''}
                      onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { metaPixelId: e.target.value.trim() })}
                      placeholder="Ex: 1234567890"
                    />
                    <p className="text-xs text-slate-500">
                      Os eventos <strong>Lead</strong> (preenchimento do formulário) e <strong>CompleteRegistration</strong> (conclusão do diagnóstico) serão disparados automaticamente. Um evento personalizado <strong>lead_capturado</strong> também é enviado para rastreamento adicional.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Meta Conversions API — Token de Acesso</label>
                    <Input
                      value={funnel.metaConversionsApiToken || ''}
                      onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { metaConversionsApiToken: e.target.value })}
                      placeholder="EAAxxxxxxxxxxxxxxx..."
                      type="password"
                    />
                    <p className="text-xs text-slate-500">
                      Opcional. Quando preenchido junto com o Pixel ID, os eventos <strong>Lead</strong> e <strong>CompleteRegistration</strong> também serão enviados diretamente ao servidor da Meta (Conversions API), melhorando a precisão do rastreamento mesmo quando o pixel do navegador é bloqueado por ad-blockers.
                    </p>
                  </div>
                </Card>
              </section>

              <section className="space-y-4">
                <h2 className="text-xl font-bold">Identidade Visual (Branding)</h2>
                <Card className="p-6 space-y-6">
                  {/* Suggested Palette from Document */}
                  <div className="space-y-3 pb-6 border-b border-slate-100">
                    <label className="text-xs font-bold uppercase text-slate-400">Paleta Sugerida (Documento)</label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { color: '#2e2424', label: 'Dark' },
                        { color: '#665e5e', label: 'Grey' },
                        { color: '#e45fa6', label: 'Pink' },
                        { color: '#78124e', label: 'Maroon' },
                        { color: '#f2f2f2', label: 'Light' }
                      ].map((p) => (
                        <button
                          key={p.color}
                          onClick={() => updateDoc(doc(db, 'funnels', funnelId), { 'branding.primaryColor': p.color })}
                          className="group relative flex flex-col items-center gap-1"
                        >
                          <div 
                            className="w-10 h-10 rounded-full border border-slate-200 shadow-sm transition-all hover:scale-110 hover:shadow-md"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Cor Primária (Botões, Barras)</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={funnel.branding?.primaryColor || '#2563eb'} 
                          onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.primaryColor': e.target.value })}
                          className="h-10 w-10 rounded border border-slate-200 cursor-pointer"
                        />
                        <Input 
                          value={funnel.branding?.primaryColor || '#2563eb'} 
                          onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.primaryColor': e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Cor de Fundo</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={funnel.branding?.backgroundColor || '#ffffff'} 
                          onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.backgroundColor': e.target.value })}
                          className="h-10 w-10 rounded border border-slate-200 cursor-pointer"
                        />
                        <Input 
                          value={funnel.branding?.backgroundColor || '#ffffff'} 
                          onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.backgroundColor': e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Cor do Texto</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={funnel.branding?.textColor || '#0f172a'} 
                          onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.textColor': e.target.value })}
                          className="h-10 w-10 rounded border border-slate-200 cursor-pointer"
                        />
                        <Input 
                          value={funnel.branding?.textColor || '#0f172a'} 
                          onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.textColor': e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">URL do Logo</label>
                      <div className="flex gap-2">
                        <Input 
                          value={funnel.branding?.logoUrl || ''} 
                          onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.logoUrl': e.target.value })}
                          placeholder="https://exemplo.com/logo.png"
                          className="flex-1"
                        />
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, (url) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.logoUrl': url }))}
                            className="absolute inset-0 opacity-0 cursor-pointer w-10"
                          />
                          <Button variant="secondary" className="px-3">
                            <Upload className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Fonte (Typography)</label>
                      <select 
                        className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={funnel.branding?.fontFamily || 'font-sans'}
                        onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 'branding.fontFamily': e.target.value })}
                      >
                        <option value="font-sans">Canva Sans (Inter)</option>
                        <option value="font-display">Backer Sans (Outfit)</option>
                        <option value="font-serif">Bogart (Playfair Display)</option>
                        <option value="font-alkatra">Alkatra (Playful)</option>
                        <option value="font-mono">JetBrains Mono (Técnico)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Formato dos Botões</label>
                      <div className="flex gap-2">
                        {([
                          { value: 'pill', label: 'Arredondado', preview: 'rounded-full' },
                          { value: 'rounded', label: 'Levemente', preview: 'rounded-lg' },
                          { value: 'square', label: 'Quadrado', preview: 'rounded-none' },
                        ] as const).map((opt) => {
                          const active = (funnel.branding?.buttonShape ?? 'pill') === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateDoc(doc(db, 'funnels', funnelId), { 'branding.buttonShape': opt.value })}
                              className={cn(
                                'flex flex-1 flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
                                active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                              )}
                            >
                              <div
                                className={cn('h-8 w-full max-w-[80px] text-xs font-medium text-white flex items-center justify-center', opt.preview)}
                                style={{ backgroundColor: funnel.branding?.primaryColor || '#2563eb' }}
                              >
                                Botão
                              </div>
                              <span className={cn('text-xs font-medium', active ? 'text-blue-700' : 'text-slate-500')}>
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">Teste A/B</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">{funnel.abTesting?.enabled ? 'Ativado' : 'Desativado'}</span>
                    <button 
                      onClick={() => updateDoc(doc(db, 'funnels', funnelId), { 
                        'abTesting.enabled': !funnel.abTesting?.enabled 
                      })}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        funnel.abTesting?.enabled ? "bg-blue-600" : "bg-slate-200"
                      )}
                    >
                      <span className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        funnel.abTesting?.enabled ? "translate-x-6" : "translate-x-1"
                      )} />
                    </button>
                  </div>
                </div>
                
                {funnel.abTesting?.enabled && (
                  <Card className="p-6 space-y-4">
                    <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
                      O Teste A/B dividirá o tráfego 50/50 entre a versão original e a variante abaixo.
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Título da Variante B</label>
                      <Input 
                        value={funnel.abTesting?.variantBTitle || ''} 
                        onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 
                          'abTesting.variantBTitle': e.target.value 
                        })} 
                        placeholder="Ex: Como está sua saúde financeira?"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Descrição da Variante B</label>
                      <textarea 
                        value={funnel.abTesting?.variantBDescription || ''} 
                        onChange={(e) => updateDoc(doc(db, 'funnels', funnelId), { 
                          'abTesting.variantBDescription': e.target.value 
                        })} 
                        className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                        rows={3}
                        placeholder="Ex: Faça o teste e receba um plano de ação gratuito."
                      />
                    </div>
                  </Card>
                )}
              </section>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="p-8">
            <div className="mx-auto max-w-3xl">
              <IntegrationsTab 
                webhooks={funnel.integrations?.webhooks || []}
                onUpdate={(webhooks) => updateDoc(doc(db, 'funnels', funnelId), {
                  'integrations.webhooks': webhooks
                })}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Cover Page Editor Block ────────────────────────────────────────────────

interface CoverPageBlockProps {
  funnel: Funnel;
  funnelId: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => void;
}

function CoverPageBlock({ funnel, funnelId, onUpload }: CoverPageBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const coverPage = funnel.coverPage;
  const enabled = coverPage?.enabled !== false;

  const updateCoverPage = (updates: Partial<CoverPage>) => {
    updateDoc(doc(db, 'funnels', funnelId), {
      coverPage: { enabled, ...coverPage, ...updates },
    });
  };

  return (
    <Card className="overflow-hidden">
      <div
        className="flex cursor-pointer select-none items-center justify-between p-4 hover:bg-slate-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
            <Layout className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Capa</span>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              )}>
                {enabled ? 'Ativada' : 'Desativada'}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-700">Página Inicial do Quiz</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); updateCoverPage({ enabled: !enabled }); }}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              enabled ? 'bg-blue-600' : 'bg-slate-200'
            )}
          >
            <span className={cn(
              'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-1'
            )} />
          </button>
          {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            O título da página inicial é o <strong>nome do funil</strong> (<em>{funnel.name}</em>).
            Para alterá-lo, atualize o campo "Nome do Funil" em <strong>Configurações</strong>.
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Descrição</label>
            <RichTextEditor
              value={coverPage?.description ?? ''}
              onChange={(html) => updateCoverPage({ description: html })}
              placeholder="Descubra seu diagnóstico personalizado em poucos minutos."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Texto do Botão</label>
            <Input
              value={coverPage?.buttonText ?? ''}
              onChange={(e) => updateCoverPage({ buttonText: e.target.value })}
              placeholder="Começar Diagnóstico"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Imagem (opcional)</label>
            <div className="flex gap-2">
              <Input
                value={coverPage?.imageUrl ?? ''}
                onChange={(e) => updateCoverPage({ imageUrl: e.target.value })}
                placeholder="https://exemplo.com/imagem.jpg"
                className="flex-1"
              />
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onUpload(e, (url) => updateCoverPage({ imageUrl: url }))}
                  className="absolute inset-0 opacity-0 cursor-pointer w-10"
                />
                <Button variant="secondary" className="px-3">
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {coverPage?.imageUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img src={coverPage.imageUrl} alt="" className="h-16 w-28 rounded-lg object-cover border border-slate-200" referrerPolicy="no-referrer" />
                <Button variant="ghost" className="text-red-500 hover:bg-red-50 text-xs px-2 py-1" onClick={() => updateCoverPage({ imageUrl: '' })}>
                  <Trash2 className="h-3 w-3 mr-1" /> Remover
                </Button>
              </div>
            )}
            {coverPage?.imageUrl && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Altura máxima (px)</label>
                  <select
                    value={coverPage?.imageMaxHeight ?? 256}
                    onChange={(e) => updateCoverPage({ imageMaxHeight: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value={150}>150 px</option>
                    <option value={200}>200 px</option>
                    <option value={256}>256 px (padrão)</option>
                    <option value={320}>320 px</option>
                    <option value={400}>400 px</option>
                    <option value={500}>500 px</option>
                    <option value={9999}>Altura original</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Ajuste da imagem</label>
                  <select
                    value={coverPage?.imageObjectFit ?? 'cover'}
                    onChange={(e) => updateCoverPage({ imageObjectFit: e.target.value as 'cover' | 'contain' | 'fill' })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="cover">Preencher (recortar)</option>
                    <option value="contain">Mostrar tudo (sem recorte)</option>
                    <option value="fill">Esticar</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Lead Capture Form Editor Block ──────────────────────────────────────────

const BUILT_IN_FIELD_IDS = new Set(DEFAULT_LEAD_FIELDS.map(f => f.id));

interface LeadCaptureBlockProps {
  funnel: Funnel;
  funnelId: string;
}

function LeadCaptureBlock({ funnel, funnelId }: LeadCaptureBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<LeadFormField['type']>('text');

  const config = funnel.leadCapture;
  const position = config?.position ?? 'before_questions';
  const fields: LeadFormField[] = config?.fields?.length
    ? config.fields
    : DEFAULT_LEAD_FIELDS;

  const saveConfig = (updates: Partial<LeadCaptureConfig>) => {
    updateDoc(doc(db, 'funnels', funnelId), {
      leadCapture: { position, fields, ...config, ...updates },
    });
  };

  const updateField = (fieldId: string, updates: Partial<LeadFormField>) => {
    saveConfig({ fields: fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) });
  };

  const addCustomField = () => {
    if (!newFieldLabel.trim()) return;
    const ts = Date.now();
    const baseKey = 'custom_' + newFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    // Append timestamp suffix to guarantee uniqueness even if two fields share the same label
    const customKey = `${baseKey}_${ts}`;
    const newField: LeadFormField = {
      id: 'field_' + ts,
      type: newFieldType,
      key: customKey,
      label: newFieldLabel.trim(),
      required: false,
      enabled: true,
    };
    saveConfig({ fields: [...fields, newField] });
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const removeCustomField = (fieldId: string) => {
    saveConfig({ fields: fields.filter(f => f.id !== fieldId) });
  };

  const positionLabels: Record<string, string> = {
    before_questions: 'Antes das perguntas',
    after_questions: 'Após as perguntas',
    disabled: 'Desativado (sem captura)',
  };

  return (
    <Card className="overflow-hidden">
      <div
        className="flex cursor-pointer select-none items-center justify-between p-4 hover:bg-slate-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
            <FileText className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Formulário</span>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                position === 'disabled' ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-700'
              )}>
                {positionLabels[position]}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-700">Captura de Leads</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </div>

      {isExpanded && (
        <div className="border-t border-slate-100 p-4 space-y-5">
          {/* Position selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Posição no quiz</label>
            <div className="flex flex-wrap gap-2">
              {(['before_questions', 'after_questions', 'disabled'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => saveConfig({ position: pos })}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    position === pos
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  {positionLabels[pos]}
                </button>
              ))}
            </div>
          </div>

          {position !== 'disabled' && (
            <>
              {/* Built-in fields */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Campos do formulário</label>
                <div className="space-y-2">
                  {fields.filter(f => BUILT_IN_FIELD_IDS.has(f.id)).map(field => (
                    <div key={field.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 bg-white">
                      <button
                        onClick={() => updateField(field.id, { enabled: !field.enabled })}
                        className={cn(
                          'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
                          field.enabled ? 'bg-blue-600' : 'bg-slate-200'
                        )}
                      >
                        <span className={cn(
                          'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                          field.enabled ? 'translate-x-5' : 'translate-x-1'
                        )} />
                      </button>
                      <input
                        className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:bg-slate-50"
                        value={field.label}
                        disabled={!field.enabled}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                      />
                      <button
                        onClick={() => updateField(field.id, { required: !field.required })}
                        disabled={!field.enabled}
                        className={cn(
                          'rounded px-2 py-1 text-xs font-medium transition-colors',
                          field.required ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500',
                          !field.enabled && 'opacity-40 cursor-not-allowed'
                        )}
                      >
                        {field.required ? 'Obrigatório' : 'Opcional'}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400">O campo de consentimento (LGPD) é sempre exibido e obrigatório.</p>
              </div>

              {/* Custom fields */}
              {fields.filter(f => !BUILT_IN_FIELD_IDS.has(f.id)).length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Campos personalizados</label>
                  <div className="space-y-2">
                    {fields.filter(f => !BUILT_IN_FIELD_IDS.has(f.id)).map(field => (
                      <div key={field.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 bg-white">
                        <button
                          onClick={() => updateField(field.id, { enabled: !field.enabled })}
                          className={cn(
                            'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
                            field.enabled ? 'bg-blue-600' : 'bg-slate-200'
                          )}
                        >
                          <span className={cn(
                            'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                            field.enabled ? 'translate-x-5' : 'translate-x-1'
                          )} />
                        </button>
                        <input
                          className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          value={field.label}
                          onChange={(e) => updateField(field.id, { label: e.target.value })}
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.id, { type: e.target.value as LeadFormField['type'] })}
                          className="rounded border border-slate-200 px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <option value="text">Texto</option>
                          <option value="email">E-mail</option>
                          <option value="tel">Telefone</option>
                          <option value="number">Número</option>
                          <option value="textarea">Área de texto</option>
                        </select>
                        <button
                          onClick={() => updateField(field.id, { required: !field.required })}
                          className={cn(
                            'rounded px-2 py-1 text-xs font-medium transition-colors',
                            field.required ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          {field.required ? 'Obrigatório' : 'Opcional'}
                        </button>
                        <Button
                          variant="ghost"
                          className="text-red-500 hover:bg-red-50 px-2 py-1"
                          onClick={() => removeCustomField(field.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add custom field */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Adicionar campo personalizado</label>
                <div className="flex gap-2">
                  <Input
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="Ex: CPF, Data de nascimento..."
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }}
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as LeadFormField['type'])}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="text">Texto</option>
                    <option value="email">E-mail</option>
                    <option value="tel">Telefone</option>
                    <option value="number">Número</option>
                    <option value="textarea">Área de texto</option>
                  </select>
                  <Button variant="secondary" onClick={addCustomField} disabled={!newFieldLabel.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

interface SortableQuestionBlockProps {
  question: Question;
  index: number;
  funnelId: string;
  isExpanded: boolean;
  onToggle: () => void;
  allQuestions: Question[];
  allDiagnoses: Diagnosis[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => void;
  scoringMode: 'simple' | 'weighted_average';
  key?: any;
}

function SortableQuestionBlock({ 
  question, 
  index, 
  funnelId, 
  isExpanded, 
  onToggle,
  allQuestions,
  allDiagnoses,
  onUpload,
  scoringMode
}: SortableQuestionBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50")}>
      <QuestionBlock 
        question={question} 
        index={index} 
        funnelId={funnelId}
        isExpanded={isExpanded}
        onToggle={onToggle}
        dragHandleProps={{ ...attributes, ...listeners }}
        allQuestions={allQuestions}
        allDiagnoses={allDiagnoses}
        onUpload={onUpload}
        scoringMode={scoringMode}
      />
    </div>
  );
}

// Small controlled input that stores its value in local state and only writes
// to Firestore on blur, preventing cursor-jumping caused by onSnapshot re-renders.
function OptionInput({
  optId,
  initialValue,
  onSave,
  className,
  placeholder,
}: {
  optId: string;
  initialValue: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(initialValue);
  const prevIdRef = useRef(optId);
  useEffect(() => {
    if (optId !== prevIdRef.current) {
      prevIdRef.current = optId;
      setLocal(initialValue);
    }
  }, [optId, initialValue]);
  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onSave(local)}
      className={className}
      placeholder={placeholder}
    />
  );
}

function QuestionBlock({ 
  question, 
  index, 
  funnelId, 
  isExpanded, 
  onToggle,
  dragHandleProps,
  allQuestions,
  allDiagnoses,
  onUpload,
  scoringMode
}: { 
  question: Question; 
  index: number; 
  funnelId: string;
  isExpanded: boolean;
  onToggle: () => void;
  dragHandleProps: any;
  allQuestions: Question[];
  allDiagnoses: Diagnosis[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => void;
  scoringMode: 'simple' | 'weighted_average';
}) {
  const [options, setOptions] = useState<AnswerOption[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [optionToDelete, setOptionToDelete] = useState<string | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

  // Local state for plain-text inputs to avoid cursor-jumping caused by
  // Firestore onSnapshot triggering a re-render on every keystroke.
  const [localButtonText, setLocalButtonText] = useState(question.buttonText || '');
  // Sync local plain-text fields when question ID changes (different question loaded)
  const prevQuestionIdRef = useRef(question.id);
  useEffect(() => {
    if (question.id !== prevQuestionIdRef.current) {
      prevQuestionIdRef.current = question.id;
      setLocalButtonText(question.buttonText || '');
    }
  }, [question.id, question.buttonText]);

  useEffect(() => {
    if (isExpanded) {
      const qOptions = query(collection(db, 'funnels', funnelId, 'questions', question.id, 'options'));
      const unsubO = onSnapshot(qOptions, (snapshot) => {
        setOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnswerOption)));
      });
      return unsubO;
    }
  }, [funnelId, question.id, isExpanded]);

  const updateQuestion = async (data: Partial<Question>) => {
    await updateDoc(doc(db, 'funnels', funnelId, 'questions', question.id), data);
  };

  const addOption = async () => {
    await addDoc(collection(db, 'funnels', funnelId, 'questions', question.id, 'options'), {
      questionId: question.id,
      text: 'Nova Opção',
      score: 0,
      tags: []
    });
  };

  const updateOption = async (id: string, data: Partial<AnswerOption>) => {
    await updateDoc(doc(db, 'funnels', funnelId, 'questions', question.id, 'options', id), data);
  };

  const deleteOption = async (id: string) => {
    await deleteDoc(doc(db, 'funnels', funnelId, 'questions', question.id, 'options', id));
    setOptionToDelete(null);
  };

  const deleteQuestion = async () => {
    await deleteDoc(doc(db, 'funnels', funnelId, 'questions', question.id));
    setShowDeleteConfirm(false);
  };

  const duplicateQuestion = async () => {
    const newQuestion = await addDoc(collection(db, 'funnels', funnelId, 'questions'), {
      ...question,
      id: undefined,
      order: question.order + 0.5, // Temporary order to place it right after
      createdAt: new Date().toISOString()
    });
    
    // Copy options
    const optionsSnap = await getDocs(collection(db, 'funnels', funnelId, 'questions', question.id, 'options'));
    for (const optDoc of optionsSnap.docs) {
      await addDoc(collection(db, 'funnels', funnelId, 'questions', newQuestion.id, 'options'), {
        ...optDoc.data(),
        questionId: newQuestion.id
      });
    }
  };

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-200",
      isExpanded ? "ring-2 ring-blue-500 border-transparent shadow-lg" : "hover:border-slate-300"
    )}>
      {/* Header */}
      <div 
        className={cn(
          "flex items-center gap-4 p-4 cursor-pointer select-none",
          isExpanded ? "bg-slate-50 border-b border-slate-100" : "bg-white"
        )}
        onClick={onToggle}
      >
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600">
          <GripVertical className="h-5 w-5" />
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 truncate">
            {stripHtml(question.text) || "Sem título"}
          </h4>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {question.type === 'single' ? 'Escolha Única' : 
             question.type === 'multi' ? 'Múltipla Escolha' :
             question.type === 'scale' ? 'Escala' :
             question.type === 'boolean' ? 'Sim/Não' :
             question.type === 'text' ? 'Texto' : 'Número'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-6 space-y-6 bg-white">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Tipo de Bloco</label>
                <select 
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={question.type}
                  onChange={(e) => updateQuestion({ type: e.target.value as any })}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="single">Escolha Única</option>
                  <option value="multi">Múltipla Escolha</option>
                  <option value="scale">Escala (1-5)</option>
                  <option value="boolean">Sim/Não</option>
                  <option value="text">Texto Livre</option>
                  <option value="number">Número</option>
                  <option value="message">Apenas Mensagem (Sem Resposta)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Texto da Pergunta / Mensagem</label>
                <RichTextEditor
                  value={question.text}
                  onChange={(html) => updateQuestion({ text: html })}
                  placeholder="Ex: Qual o seu faturamento mensal?"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-slate-500">Descrição / Subtexto</label>
                  <RichTextEditor
                    value={question.description || ''}
                    onChange={(html) => updateQuestion({ description: html })}
                    placeholder="Texto auxiliar para o lead..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-slate-500">URL da Imagem (Opcional)</label>
                  <div className="flex gap-2">
                    <Input 
                      value={question.imageUrl || ''} 
                      onChange={(e) => updateQuestion({ imageUrl: e.target.value })} 
                      placeholder="https://exemplo.com/imagem.jpg"
                      className="flex-1"
                    />
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => onUpload(e, (url) => updateQuestion({ imageUrl: url }))}
                        className="absolute inset-0 opacity-0 cursor-pointer w-10"
                      />
                      <Button variant="secondary" className="px-3">
                        <Upload className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {question.type === 'message' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-slate-500">Texto do Botão</label>
                  <Input 
                    value={localButtonText}
                    onChange={(e) => setLocalButtonText(e.target.value)}
                    onBlur={() => updateQuestion({ buttonText: localButtonText })}
                    placeholder="Ex: Continuar, Entendi, Próximo..."
                  />
                </div>
              )}

              {scoringMode === 'weighted_average' && question.type !== 'message' && (
                <div className="flex items-center gap-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold uppercase text-blue-600">Peso da Pergunta (Média Ponderada)</label>
                    <p className="text-[10px] text-blue-500 mt-0.5">Perguntas com peso 2 valem o dobro no cálculo do score final.</p>
                  </div>
                  <Input
                    type="number"
                    min={MIN_QUESTION_WEIGHT}
                    max={MAX_QUESTION_WEIGHT}
                    value={question.scoring?.weight ?? MIN_QUESTION_WEIGHT}
                    onChange={(e) => updateQuestion({ scoring: { ...question.scoring, weight: Math.max(MIN_QUESTION_WEIGHT, Number(e.target.value)) } })}
                    className="w-20 text-center bg-white"
                  />
                </div>
              )}

              {['single', 'multi'].includes(question.type) && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-500">Layout das Opções</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateQuestion({ layout: 'grid' })}
                        className={cn(
                          "px-3 py-1 text-[10px] font-bold rounded-full border transition-all",
                          question.layout === 'grid' || !question.layout ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                        )}
                      >
                        Grid
                      </button>
                      <button 
                        onClick={() => updateQuestion({ layout: 'list' })}
                        className={cn(
                          "px-3 py-1 text-[10px] font-bold rounded-full border transition-all",
                          question.layout === 'list' ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                        )}
                      >
                        Lista
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-500">Opções e Lógica</label>
                    <Button onClick={addOption} variant="ghost" className="h-7 px-3 text-xs bg-slate-50 hover:bg-slate-100">
                      <Plus className="mr-1 h-3 w-3" /> Adicionar Opção
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {options.map(opt => (
                      <div key={opt.id} className="group relative rounded-xl border border-slate-100 p-4 bg-slate-50/30 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 space-y-2">
                            <OptionInput
                              optId={opt.id}
                              initialValue={opt.text}
                              onSave={(text) => updateOption(opt.id, { text })}
                              className="bg-white"
                              placeholder="Texto da opção"
                            />
                            <div className="flex gap-2">
                              <Input 
                                value={opt.imageUrl || ''} 
                                onChange={(e) => updateOption(opt.id, { imageUrl: e.target.value })} 
                                className="bg-white text-[10px] h-7 flex-1"
                                placeholder="URL da Imagem (Opcional)"
                              />
                              <div className="relative">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => onUpload(e, (url) => updateOption(opt.id, { imageUrl: url }))}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-7 h-7"
                                />
                                <Button variant="secondary" className="h-7 px-2">
                                  <Upload className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">PTS</span>
                            <Input 
                              type="number" 
                              value={opt.score} 
                              onChange={(e) => updateOption(opt.id, { score: Number(e.target.value) })} 
                              className="w-16 bg-white text-center"
                            />
                          </div>
                          {optionToDelete === opt.id ? (
                            <div className="flex items-center gap-1 bg-red-50 p-1 rounded border border-red-100">
                              <Button onClick={() => deleteOption(opt.id)} variant="ghost" className="h-7 px-2 text-[10px] bg-red-600 text-white hover:bg-red-700">Sim</Button>
                              <Button onClick={() => setOptionToDelete(null)} variant="ghost" className="h-7 px-2 text-[10px] bg-white text-slate-600 border border-slate-200">Não</Button>
                            </div>
                          ) : (
                            <Button onClick={() => setOptionToDelete(opt.id)} variant="ghost" className="h-9 w-9 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        
                        <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                          <Settings className="h-3 w-3 text-slate-400" />
                          <select 
                            className="flex-1 rounded-lg border border-slate-200 bg-white p-1.5 text-[11px] outline-none focus:ring-1 focus:ring-blue-500"
                            value={opt.action?.type || ''}
                            onChange={(e) => {
                              const type = e.target.value as any;
                              if (!type) {
                                updateOption(opt.id, { action: undefined });
                              } else {
                                updateOption(opt.id, { action: { type, targetId: '' } });
                              }
                            }}
                          >
                            <option value="">Próxima Pergunta (Padrão)</option>
                            <option value="jump">Pular para Pergunta...</option>
                            <option value="disqualify">Desqualificar Lead</option>
                            <option value="force_diagnosis">Forçar Diagnóstico...</option>
                          </select>

                          {opt.action?.type === 'jump' && (
                            <select 
                              className="flex-1 rounded-lg border border-slate-200 bg-white p-1.5 text-[11px] outline-none focus:ring-1 focus:ring-blue-500"
                              value={opt.action.targetId}
                              onChange={(e) => updateOption(opt.id, { action: { ...opt.action!, targetId: e.target.value } })}
                            >
                              <option value="">Selecionar Pergunta</option>
                              {allQuestions.filter(q => q.id !== question.id).map(q => (
                                <option key={q.id} value={q.id}>{stripHtml(q.text).substring(0, 30)}...</option>
                              ))}
                            </select>
                          )}

                          {opt.action?.type === 'force_diagnosis' && (
                            <select 
                              className="flex-1 rounded-lg border border-slate-200 bg-white p-1.5 text-[11px] outline-none focus:ring-1 focus:ring-blue-500"
                              value={opt.action.targetId}
                              onChange={(e) => updateOption(opt.id, { action: { ...opt.action!, targetId: e.target.value } })}
                            >
                              <option value="">Selecionar Diagnóstico</option>
                              {allDiagnoses.map(d => (
                                <option key={d.id} value={d.id}>{d.title}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

              {/* Advanced Logic Section */}
              <div className="space-y-4 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-slate-500">Lógica Avançada (AND/OR)</label>
                  <Button 
                    onClick={() => {
                      const newRule: LogicRule = {
                        id: Math.random().toString(36).substr(2, 9),
                        matchType: 'all',
                        conditions: [],
                        action: { type: 'jump', targetId: '' }
                      };
                      updateQuestion({ rules: [...(question.rules || []), newRule] });
                    }} 
                    variant="ghost" 
                    className="h-7 px-3 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    <Plus className="mr-1 h-3 w-3" /> Adicionar Regra
                  </Button>
                </div>

                <div className="space-y-4">
                  {(question.rules || []).map((rule, rIdx) => (
                    <div key={rule.id} className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <select 
                          className="rounded-lg border border-blue-200 bg-white p-1.5 text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500"
                          value={rule.matchType}
                          onChange={(e) => {
                            const newRules = [...(question.rules || [])];
                            newRules[rIdx].matchType = e.target.value as any;
                            updateQuestion({ rules: newRules });
                          }}
                        >
                          <option value="all">SE TODAS (AND)</option>
                          <option value="any">SE QUALQUER (OR)</option>
                        </select>
                        {ruleToDelete === rule.id ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded border border-red-100">
                            <span className="text-[10px] font-bold text-red-600 uppercase px-2">Excluir?</span>
                            <Button 
                              onClick={() => {
                                const newRules = (question.rules || []).filter(r => r.id !== rule.id);
                                updateQuestion({ rules: newRules });
                                setRuleToDelete(null);
                              }}
                              variant="ghost" 
                              className="h-6 px-2 text-[10px] bg-red-600 text-white hover:bg-red-700"
                            >
                              Sim
                            </Button>
                            <Button onClick={() => setRuleToDelete(null)} variant="ghost" className="h-6 px-2 text-[10px] bg-white text-slate-600 border border-slate-200">
                              Não
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            onClick={() => setRuleToDelete(rule.id)}
                            variant="ghost" 
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {rule.conditions.map((cond, cIdx) => (
                          <div key={cIdx} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 shadow-sm border border-blue-50">
                            <select 
                              className="flex-1 min-w-[120px] rounded border border-slate-100 p-1.5 text-[10px] outline-none"
                              value={cond.questionId}
                              onChange={(e) => {
                                const newRules = [...(question.rules || [])];
                                newRules[rIdx].conditions[cIdx].questionId = e.target.value;
                                updateQuestion({ rules: newRules });
                              }}
                            >
                              <option value="">Pergunta...</option>
                              {allQuestions.map(q => (
                                <option key={q.id} value={q.id}>{stripHtml(q.text).substring(0, 25)}</option>
                              ))}
                            </select>
                            
                            <select 
                              className="w-24 rounded border border-slate-100 p-1.5 text-[10px] outline-none"
                              value={cond.operator}
                              onChange={(e) => {
                                const newRules = [...(question.rules || [])];
                                newRules[rIdx].conditions[cIdx].operator = e.target.value as any;
                                updateQuestion({ rules: newRules });
                              }}
                            >
                              <option value="equals">Igual a</option>
                              <option value="not_equals">Diferente de</option>
                              <option value="greater_than">Maior que</option>
                              <option value="less_than">Menor que</option>
                            </select>

                            <Input 
                              className="w-24 h-8 text-[10px]"
                              placeholder="Valor"
                              value={cond.value}
                              onChange={(e) => {
                                const newRules = [...(question.rules || [])];
                                newRules[rIdx].conditions[cIdx].value = e.target.value;
                                updateQuestion({ rules: newRules });
                              }}
                            />

                            <Button 
                              onClick={() => {
                                const newRules = [...(question.rules || [])];
                                newRules[rIdx].conditions = newRules[rIdx].conditions.filter((_, i) => i !== cIdx);
                                updateQuestion({ rules: newRules });
                              }}
                              variant="ghost" 
                              className="h-6 w-6 p-0 text-slate-300 hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button 
                          onClick={() => {
                            const newRules = [...(question.rules || [])];
                            newRules[rIdx].conditions.push({ questionId: '', operator: 'equals', value: '' });
                            updateQuestion({ rules: newRules });
                          }}
                          variant="ghost" 
                          className="w-full h-8 text-[10px] border border-dashed border-blue-200 text-blue-500 hover:bg-blue-50"
                        >
                          + Adicionar Condição
                        </Button>
                      </div>

                      <div className="pt-3 border-t border-blue-100 flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Ação:</span>
                        <select 
                          className="flex-1 rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] outline-none focus:ring-1 focus:ring-blue-500"
                          value={rule.action.type}
                          onChange={(e) => {
                            const newRules = [...(question.rules || [])];
                            newRules[rIdx].action.type = e.target.value as any;
                            updateQuestion({ rules: newRules });
                          }}
                        >
                          <option value="jump">Pular para...</option>
                          <option value="disqualify">Desqualificar</option>
                          <option value="force_diagnosis">Forçar Diagnóstico</option>
                        </select>

                        {rule.action.type === 'jump' && (
                          <select 
                            className="flex-1 rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] outline-none focus:ring-1 focus:ring-blue-500"
                            value={rule.action.targetId}
                            onChange={(e) => {
                              const newRules = [...(question.rules || [])];
                              newRules[rIdx].action.targetId = e.target.value;
                              updateQuestion({ rules: newRules });
                            }}
                          >
                            <option value="">Selecionar Pergunta</option>
                            {allQuestions.filter(q => q.id !== question.id).map(q => (
                              <option key={q.id} value={q.id}>{stripHtml(q.text).substring(0, 30)}...</option>
                            ))}
                          </select>
                        )}

                        {rule.action.type === 'force_diagnosis' && (
                          <select 
                            className="flex-1 rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] outline-none focus:ring-1 focus:ring-blue-500"
                            value={rule.action.targetId}
                            onChange={(e) => {
                              const newRules = [...(question.rules || [])];
                              newRules[rIdx].action.targetId = e.target.value;
                              updateQuestion({ rules: newRules });
                            }}
                          >
                            <option value="">Selecionar Diagnóstico</option>
                            {allDiagnoses.map(d => (
                              <option key={d.id} value={d.id}>{d.title}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Button onClick={duplicateQuestion} variant="ghost" className="text-slate-500 hover:text-blue-600 hover:bg-blue-50">
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </Button>
                  
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2 bg-red-50 p-1 rounded-lg border border-red-100">
                      <span className="text-[10px] font-bold text-red-600 uppercase px-2">Excluir?</span>
                      <Button onClick={deleteQuestion} variant="ghost" className="h-8 px-3 text-[10px] bg-red-600 text-white hover:bg-red-700">
                        Sim
                      </Button>
                      <Button onClick={() => setShowDeleteConfirm(false)} variant="ghost" className="h-8 px-3 text-[10px] bg-white text-slate-600 border border-slate-200 hover:bg-slate-50">
                        Não
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => setShowDeleteConfirm(true)} variant="ghost" className="text-red-500 hover:bg-red-50">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </Button>
                  )}
                </div>
                <Button onClick={onToggle} variant="secondary">
                  Fechar Edição
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ─── ScoringConfigPanel ──────────────────────────────────────────────────────

function ScoringConfigPanel({
  funnel,
  funnelId,
  diagnoses,
  questions
}: {
  funnel: Funnel;
  funnelId: string;
  diagnoses: Diagnosis[];
  questions: Question[];
}) {
  const scoring = funnel.scoring;
  const mode = scoring?.mode || 'simple';
  const koRules = scoring?.koRules || [];
  const disqualifiedDiagnosisId = scoring?.disqualifiedDiagnosisId || '';

  // Cache of loaded answer options, keyed by questionId.
  // undefined = not yet loaded; [] = loaded but empty.
  const [questionOptions, setQuestionOptions] = useState<Record<string, AnswerOption[]>>({});

  // Fetches and caches answer options for a given question. No-op if already loading/loaded.
  const loadOptionsForQuestion = (questionId: string) => {
    if (!questionId || questionId in questionOptions) return;
    // Optimistically mark as loading (empty array sentinel) to prevent duplicate fetches.
    setQuestionOptions(prev => {
      if (questionId in prev) return prev;
      return { ...prev, [questionId]: [] };
    });
    getDocs(collection(db, 'funnels', funnelId, 'questions', questionId, 'options')).then(snap => {
      setQuestionOptions(prev => ({
        ...prev,
        [questionId]: snap.docs.map(d => ({ id: d.id, ...d.data() } as AnswerOption))
      }));
    }).catch(() => {
      // Question may have been deleted; keep the empty-array sentinel so we don't retry.
    });
  };

  // On mount and whenever koRules change, pre-load options for all referenced questionIds.
  useEffect(() => {
    const questionIds = new Set<string>();
    for (const rule of koRules) {
      for (const cond of rule.conditions) {
        if (cond.questionId && cond.type.startsWith('answer_')) {
          questionIds.add(cond.questionId);
        }
      }
    }
    questionIds.forEach(loadOptionsForQuestion);
  // loadOptionsForQuestion is stable within the component lifecycle; koRules and funnelId
  // are the true external dependencies here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [koRules, funnelId]);

  const updateScoring = (patch: Partial<ScoringConfig>) => {
    updateDoc(doc(db, 'funnels', funnelId), {
      scoring: { ...scoring, ...patch }
    });
  };

  const addKoRule = () => {
    const newRule: KoRule = {
      id: crypto.randomUUID(),
      description: 'Nova regra KO',
      matchType: 'all',
      conditions: []
    };
    updateScoring({ koRules: [...koRules, newRule] });
  };

  const updateKoRule = (id: string, patch: Partial<KoRule>) => {
    updateScoring({ koRules: koRules.map(r => r.id === id ? { ...r, ...patch } : r) });
  };

  const removeKoRule = (id: string) => {
    updateScoring({ koRules: koRules.filter(r => r.id !== id) });
  };

  const addKoCondition = (ruleId: string) => {
    const newCond: KoCondition = { type: 'answer_equals', questionId: '', value: '' };
    const rule = koRules.find(r => r.id === ruleId);
    if (!rule) return;
    updateKoRule(ruleId, { conditions: [...rule.conditions, newCond] });
  };

  const updateKoCondition = (ruleId: string, idx: number, patch: Partial<KoCondition>) => {
    const rule = koRules.find(r => r.id === ruleId);
    if (!rule) return;
    const newConds = rule.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
    updateKoRule(ruleId, { conditions: newConds });
  };

  const removeKoCondition = (ruleId: string, idx: number) => {
    const rule = koRules.find(r => r.id === ruleId);
    if (!rule) return;
    updateKoRule(ruleId, { conditions: rule.conditions.filter((_, i) => i !== idx) });
  };

  return (
    <Card className="p-6 space-y-6 border-2 border-blue-100">
      <div>
        <h3 className="text-base font-bold text-slate-900">⚙️ Configuração de Pontuação</h3>
        <p className="text-xs text-slate-500 mt-1">Defina como o score é calculado e configure regras de desqualificação (KO).</p>
      </div>

      {/* Mode selector */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase text-slate-500">Modelo de Pontuação</label>
        <div className="flex gap-3">
          {(['simple', 'weighted_average'] as const).map(m => (
            <button
              key={m}
              onClick={() => updateScoring({ mode: m })}
              className={cn(
                "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-all text-left",
                mode === m
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {m === 'simple' ? (
                <>
                  <div className="font-semibold">Soma Simples</div>
                  <div className="text-xs opacity-70 mt-0.5">Soma todos os pontos das respostas</div>
                </>
              ) : (
                <>
                  <div className="font-semibold">Média Ponderada</div>
                  <div className="text-xs opacity-70 mt-0.5">Cada pergunta pode ter um peso diferente</div>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* KO Rules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Regras de Desqualificação (KO)</label>
            <p className="text-[10px] text-slate-400 mt-0.5">O lead completa o funil normalmente, mas recebe o diagnóstico de desqualificado.</p>
          </div>
          <Button onClick={addKoRule} variant="secondary" className="h-7 px-3 text-xs">
            <Plus className="mr-1 h-3 w-3" /> Nova Regra
          </Button>
        </div>

        {koRules.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-slate-500">Diagnóstico de Desqualificado</label>
            <select
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={disqualifiedDiagnosisId}
              onChange={(e) => updateScoring({ disqualifiedDiagnosisId: e.target.value })}
            >
              <option value="">Selecionar diagnóstico...</option>
              {diagnoses.map(d => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </div>
        )}

        {koRules.map(rule => (
          <div key={rule.id} className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Input
                value={rule.description || ''}
                onChange={(e) => updateKoRule(rule.id, { description: e.target.value })}
                placeholder="Descrição da regra..."
                className="flex-1 bg-white text-sm"
              />
              <select
                className="rounded-lg border border-slate-200 bg-white p-2 text-xs"
                value={rule.matchType}
                onChange={(e) => updateKoRule(rule.id, { matchType: e.target.value as 'all' | 'any' })}
              >
                <option value="all">Todas (E)</option>
                <option value="any">Qualquer (OU)</option>
              </select>
              <Button
                onClick={() => removeKoRule(rule.id)}
                variant="ghost"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {rule.conditions.map((cond, idx) => {
                const isAnswerType = cond.type.startsWith('answer_');
                const optionsLoaded = cond.questionId ? cond.questionId in questionOptions : false;
                const loadedOptions = optionsLoaded ? questionOptions[cond.questionId!] : [];

                return (
                  <div key={idx} className="flex flex-wrap items-start gap-2 rounded-lg border border-orange-100 bg-white p-2">
                    {/* Condition type selector */}
                    <select
                      className="rounded border border-slate-200 p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      value={cond.type}
                      onChange={(e) => {
                        const newType = e.target.value as KoCondition['type'];
                        const isNewAnswerType = newType.startsWith('answer_');
                        const wasAnswerType = cond.type.startsWith('answer_');
                        // Reset value when switching between answer_* and score_* families,
                        // or when switching into answer_in (which expects an array).
                        const crossFamily = isNewAnswerType !== wasAnswerType;
                        const resetValue = crossFamily ? (newType === 'answer_in' ? [] : '') : cond.value;
                        updateKoCondition(rule.id, idx, {
                          type: newType,
                          questionId: isNewAnswerType ? (cond.questionId || '') : undefined,
                          value: resetValue
                        });
                      }}
                    >
                      <option value="answer_equals">Resposta igual a</option>
                      <option value="answer_not_equals">Resposta diferente de</option>
                      <option value="answer_in">Resposta está em</option>
                      <option value="score_gt">Score maior que</option>
                      <option value="score_lt">Score menor que</option>
                      <option value="score_gte">Score maior ou igual a</option>
                      <option value="score_lte">Score menor ou igual a</option>
                    </select>

                    {/* Question dropdown (for answer_* conditions) */}
                    {isAnswerType && (
                      <select
                        className="rounded border border-slate-200 p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-[140px]"
                        value={cond.questionId || ''}
                        onChange={(e) => {
                          const newQId = e.target.value;
                          updateKoCondition(rule.id, idx, {
                            questionId: newQId,
                            value: cond.type === 'answer_in' ? [] : ''
                          });
                          loadOptionsForQuestion(newQId);
                        }}
                      >
                        <option value="">Selecionar pergunta...</option>
                        {questions.map(q => (
                          <option key={q.id} value={q.id}>{stripHtml(q.text) || `Pergunta ${q.order + 1}`}</option>
                        ))}
                      </select>
                    )}

                    {/* Value: option dropdown for answer_* or number input for score_* */}
                    {isAnswerType ? (
                      cond.type === 'answer_in' ? (
                        optionsLoaded && loadedOptions.length > 0 ? (
                          <select
                            multiple
                            className="rounded border border-slate-200 p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-[140px] min-h-[56px]"
                            value={Array.isArray(cond.value) ? cond.value : []}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions as HTMLCollectionOf<HTMLOptionElement>).map(o => o.value);
                              updateKoCondition(rule.id, idx, { value: selected });
                            }}
                          >
                            {loadedOptions.map(o => (
                              <option key={o.id} value={o.id}>{o.text}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={Array.isArray(cond.value) ? cond.value.join(',') : String(cond.value ?? '')}
                            onChange={(e) => {
                              updateKoCondition(rule.id, idx, {
                                value: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                              });
                            }}
                            placeholder={cond.questionId && !optionsLoaded ? 'Carregando...' : 'id1,id2,...'}
                            className="flex-1 text-xs h-8 min-w-[120px]"
                            readOnly={!!cond.questionId && !optionsLoaded}
                          />
                        )
                      ) : (
                        optionsLoaded && loadedOptions.length > 0 ? (
                          <select
                            className="rounded border border-slate-200 p-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-[140px]"
                            value={typeof cond.value === 'string' ? cond.value : ''}
                            onChange={(e) => updateKoCondition(rule.id, idx, { value: e.target.value })}
                          >
                            <option value="">Selecionar opção...</option>
                            {loadedOptions.map(o => (
                              <option key={o.id} value={o.id}>{o.text}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={typeof cond.value === 'string' ? cond.value : String(cond.value ?? '')}
                            onChange={(e) => updateKoCondition(rule.id, idx, { value: e.target.value })}
                            placeholder={cond.questionId && !optionsLoaded ? 'Carregando opções...' : 'Selecione uma pergunta'}
                            className="flex-1 text-xs h-8 min-w-[120px]"
                            readOnly={!!cond.questionId && !optionsLoaded}
                          />
                        )
                      )
                    ) : (
                      <Input
                        type="number"
                        value={cond.value}
                        onChange={(e) => updateKoCondition(rule.id, idx, { value: Number(e.target.value) })}
                        placeholder="0"
                        className="flex-1 text-xs h-8"
                      />
                    )}

                    <Button
                      onClick={() => removeKoCondition(rule.id, idx)}
                      variant="ghost"
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-600 shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
              <Button
                onClick={() => addKoCondition(rule.id)}
                variant="ghost"
                className="h-7 w-full border border-dashed border-orange-200 text-[11px] text-orange-600 hover:bg-orange-100"
              >
                <Plus className="mr-1 h-3 w-3" /> Adicionar Condição
              </Button>
            </div>
          </div>
        ))}

        {koRules.length === 0 && (
          <p className="text-xs text-slate-400 rounded-lg border border-dashed border-slate-200 p-4 text-center">
            Nenhuma regra KO configurada. Clique em "Nova Regra" para adicionar.
          </p>
        )}
      </div>
    </Card>
  );
}

const DiagnosisCard = ({ diagnosis, funnelId }: { diagnosis: Diagnosis; funnelId: string; key?: any }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Local state for the title input to avoid cursor-jumping on Firestore re-renders
  const [localTitle, setLocalTitle] = useState(diagnosis.title);
  const prevDiagIdRef = useRef(diagnosis.id);
  useEffect(() => {
    if (diagnosis.id !== prevDiagIdRef.current) {
      prevDiagIdRef.current = diagnosis.id;
      setLocalTitle(diagnosis.title);
    }
  }, [diagnosis.id, diagnosis.title]);

  const update = (data: Partial<Diagnosis>) => {
    updateDoc(doc(db, 'funnels', funnelId, 'diagnoses', diagnosis.id), data);
  };

  const ctas = diagnosis.ctas && diagnosis.ctas.length > 0
    ? diagnosis.ctas
    : diagnosis.cta
      ? [{ id: 'legacy-cta', type: 'custom' as const, text: diagnosis.cta.text, url: diagnosis.cta.url }]
      : [];

  const updateCtas = (nextCtas: { id: string; type: 'custom' | 'whatsapp' | 'purchase' | 'video'; text: string; url: string }[]) => {
    update({ ctas: nextCtas, cta: deleteField() as any });
  };

  const addCta = () => {
    updateCtas([
      ...ctas,
      {
        id: Math.random().toString(36).slice(2, 9),
        type: 'custom',
        text: 'Saiba mais',
        url: ''
      }
    ]);
  };

  const updateCta = (ctaId: string, data: Partial<{ type: 'custom' | 'whatsapp' | 'purchase' | 'video'; text: string; url: string }>) => {
    const nextCtas = ctas.map((cta) => (cta.id === ctaId ? { ...cta, ...data } : cta));
    updateCtas(nextCtas);
  };

  const removeCta = (ctaId: string) => {
    updateCtas(ctas.filter((cta) => cta.id !== ctaId));
  };

  const deleteDiagnosis = async () => {
    await deleteDoc(doc(db, 'funnels', funnelId, 'diagnoses', diagnosis.id));
    setShowDeleteConfirm(false);
  };

  return (
    <Card className="p-4 space-y-4 relative group">
      <div className="absolute top-2 right-2 z-10">
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1 bg-red-50 p-1 rounded border border-red-100 shadow-sm">
            <Button onClick={deleteDiagnosis} variant="ghost" className="h-6 px-2 text-[10px] bg-red-600 text-white hover:bg-red-700">Sim</Button>
            <Button onClick={() => setShowDeleteConfirm(false)} variant="ghost" className="h-6 px-2 text-[10px] bg-white text-slate-600 border border-slate-200">Não</Button>
          </div>
        ) : (
          <Button 
            onClick={() => setShowDeleteConfirm(true)}
            variant="ghost" 
            className="h-8 w-8 p-0 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Input 
        value={localTitle}
        onChange={(e) => { setLocalTitle(e.target.value); update({ title: e.target.value }); }}
        placeholder="Título do Diagnóstico"
        className="font-bold"
      />
      <RichTextEditor
        value={diagnosis.description}
        onChange={(html) => update({ description: html })}
        placeholder="Descrição detalhada..."
        minHeight="8rem"
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

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
        <label className="text-xs font-medium text-slate-600">🎉 Mostrar confete neste diagnóstico</label>
        <button
          type="button"
          role="switch"
          aria-checked={diagnosis.showConfetti !== false}
          onClick={() => update({ showConfetti: diagnosis.showConfetti !== false ? false : true })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            diagnosis.showConfetti !== false ? 'bg-blue-500' : 'bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              diagnosis.showConfetti !== false ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase text-slate-500">CTAs do Diagnóstico</label>
          <Button onClick={addCta} variant="secondary" className="h-7 px-2 text-[11px]">
            <Plus className="mr-1 h-3 w-3" />
            Adicionar CTA
          </Button>
        </div>

        {ctas.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum CTA configurado. Adicione botões para WhatsApp, compra, vídeo ou link customizado.</p>
        ) : (
          <div className="space-y-3">
            {ctas.map((cta) => (
              <div key={cta.id} className="grid gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-12">
                <select
                  value={cta.type}
                  onChange={(e) => updateCta(cta.id, { type: e.target.value as 'custom' | 'whatsapp' | 'purchase' | 'video' })}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-xs sm:col-span-3"
                >
                  <option value="custom">Link</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="purchase">Compra</option>
                  <option value="video">Vídeo</option>
                </select>
                <Input
                  value={cta.text}
                  onChange={(e) => updateCta(cta.id, { text: e.target.value })}
                  placeholder="Texto do botão"
                  className="sm:col-span-3"
                />
                <Input
                  value={cta.url}
                  onChange={(e) => updateCta(cta.id, { url: e.target.value })}
                  placeholder="https://..."
                  className="sm:col-span-5"
                />
                <Button onClick={() => removeCta(cta.id)} variant="ghost" className="text-red-500 hover:bg-red-50 sm:col-span-1">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
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

// Strip HTML tags to get a readable plain-text summary.
// Used when rich text content needs to be displayed in contexts that don't support HTML
// (e.g. dropdown labels, breadcrumb headers).
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

