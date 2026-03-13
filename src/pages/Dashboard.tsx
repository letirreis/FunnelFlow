import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Funnel } from '../types';
import { Button, Card } from '../components/ui';
import { Plus, Edit2, Trash2, BarChart2, ExternalLink, Layout } from 'lucide-react';

export function Dashboard({ onEdit }: { onEdit: (id: string) => void }) {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'funnels'), where('ownerId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Funnel));
      setFunnels(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const createFunnel = async () => {
    if (!auth.currentUser) return;
    const name = prompt('Nome do Funil:');
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    await addDoc(collection(db, 'funnels'), {
      ownerId: auth.currentUser.uid,
      name,
      slug,
      status: 'draft',
      branding: { primaryColor: '#0B84FF' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  const deleteFunnel = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este funil?')) {
      await deleteDoc(doc(db, 'funnels', id));
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meus Funis</h1>
          <p className="text-slate-500">Gerencie seus diagnósticos e leads.</p>
        </div>
        <Button onClick={createFunnel}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Funil
        </Button>
      </header>

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
          <Button onClick={createFunnel} variant="secondary">
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
                <p className="mb-6 text-sm text-slate-500">/{funnel.slug}</p>
                
                <div className="flex items-center gap-2">
                  <Button onClick={() => onEdit(funnel.id)} variant="secondary" className="flex-1">
                    <Edit2 className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button onClick={() => deleteFunnel(funnel.id)} variant="ghost" className="text-red-500 hover:bg-red-50">
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
