import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { auth } from './firebase';
import { Dashboard } from './pages/Dashboard';
import { Builder } from './pages/Builder';
import { Renderer } from './pages/Renderer';
import { Button } from './components/ui';
import { LogIn, Layout } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<{ type: 'dashboard' | 'builder' | 'renderer'; id?: string }>({ type: 'dashboard' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Simple routing based on URL hash for public funnels
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/f/')) {
        const slug = hash.replace('#/f/', '');
        setView({ type: 'renderer', id: slug });
      } else if (hash === '#/dashboard') {
        setView({ type: 'dashboard' });
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (view.type === 'renderer') {
    return <Renderer slug={view.id!} />;
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="mb-8 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Layout className="h-8 w-8 text-blue-600" />
          <span>FunnelFlow</span>
        </div>
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Transforme visitantes em leads qualificados
        </h1>
        <p className="mb-8 max-w-lg text-lg text-slate-600">
          Crie funis de diagnóstico interativos e entregue recomendações personalizadas em minutos.
        </p>
        <Button onClick={login} className="h-12 px-8 text-lg">
          <LogIn className="mr-2 h-5 w-5" />
          Começar agora com Google
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {view.type === 'dashboard' ? (
        <Dashboard onEdit={(id) => setView({ type: 'builder', id })} />
      ) : (
        <Builder funnelId={view.id!} onBack={() => setView({ type: 'dashboard' })} />
      )}
    </div>
  );
}
