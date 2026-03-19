import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Funnel } from '../types';
import { Button, Card } from '../components/ui';
import { signOut } from 'firebase/auth';
import { Plus, Edit2, Trash2, BarChart2, ExternalLink, Layout, LogOut } from 'lucide-react';

export function Dashboard({ onEdit }: { onEdit: (id: string) => void }) {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [funnelToDelete, setFunnelToDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      const q = query(collection(db, 'funnels'), where('ownerId', '==', user.uid));
      const unsubscribeSnap = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Funnel));
        setFunnels(data);
        setLoading(false);
      }, (error) => {
        console.error("Erro ao carregar funis:", error);
        setLoading(false);
      });

      return () => unsubscribeSnap();
    });

    return () => unsubscribeAuth();
  }, []);

  const createFunnel = async () => {
    if (!auth.currentUser || !newFunnelName.trim()) return;
    setIsCreating(true);
    try {
      const slug = newFunnelName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      await addDoc(collection(db, 'funnels'), {
        ownerId: auth.currentUser.uid,
        name: newFunnelName.trim(),
        slug,
        status: 'draft',
        branding: { primaryColor: '#0B84FF' },
        views: 0,
        leadsCount: 0,
        abTesting: { enabled: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      setIsCreateModalOpen(false);
      setNewFunnelName('');
    } catch (error) {
      console.error("Erro ao criar funil:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteFunnel = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'funnels', id));
      setFunnelToDelete(null);
    } catch (error) {
      console.error("Erro ao deletar funil:", error);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meus Funis</h1>
          <p className="text-slate-500">Gerencie seus diagnósticos e leads.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => signOut(auth)} variant="ghost" className="text-slate-500 hover:text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Funil
          </Button>
        </div>
      </header>

      {/* Modal de Criação */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 shadow-2xl">
            <h2 className="mb-4 text-xl font-bold">Criar Novo Funil</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nome do Funil</label>
                <input 
                  type="text"
                  autoFocus
                  value={newFunnelName}
                  onChange={(e) => setNewFunnelName(e.target.value)}
                  placeholder="Ex: Diagnóstico de Marketing"
                  className="w-full rounded-lg border border-slate-200 p-2 focus:border-blue-500 focus:outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && createFunnel()}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={() => setIsCreateModalOpen(false)} variant="secondary" className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={createFunnel} disabled={isCreating || !newFunnelName.trim()} className="flex-1">
                  {isCreating ? 'Criando...' : 'Criar Funil'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {funnelToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm p-6 shadow-2xl">
            <h2 className="mb-2 text-xl font-bold text-red-600">Excluir Funil?</h2>
            <p className="mb-6 text-slate-500">Esta ação não pode ser desfeita. Todos os dados e leads vinculados serão perdidos.</p>
            <div className="flex gap-3">
              <Button onClick={() => setFunnelToDelete(null)} variant="secondary" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={() => deleteFunnel(funnelToDelete)} className="flex-1 bg-red-600 hover:bg-red-700">
                Excluir
              </Button>
            </div>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : funnels.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Layout className="mb-4 h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">Nenhum funil criado</h3>
          <p className="mb-6 text-slate-500">Comece criando seu primeiro diagnóstico interativo.</p>
          <Button onClick={() => setIsCreateModalOpen(true)} variant="secondary">
            Criar meu primeiro funil
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {funnels.map((funnel) => (
            <div key={funnel.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Layout className="h-6 w-6 text-blue-600" />
                  </div>
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    funnel.status === 'published' ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {funnel.status === 'published' ? 'Publicado' : 'Rascunho'}
                  </span>
                </div>
                <h3 className="mb-1 text-lg font-semibold text-slate-900">{funnel.name}</h3>
                <p className="mb-4 text-sm text-slate-500">/{funnel.slug}</p>
                
                <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Visitas</p>
                    <p className="text-lg font-bold text-slate-700">{funnel.views || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Conversão</p>
                    <p className="text-lg font-bold text-blue-600">
                      {funnel.views ? ((funnel.leadsCount || 0) / funnel.views * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={() => onEdit(funnel.id)} variant="secondary" className="flex-1">
                    <Edit2 className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button onClick={() => setFunnelToDelete(funnel.id)} variant="ghost" className="text-red-500 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <BarChart2 className="h-3 w-3" />
                    Analytics
                  </span>
                </div>
                <a 
                  href={`#/f/${funnel.slug}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                >
                  Ver Público
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
