import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Button, Card } from '../components/ui';
import { Layout, Shield, Zap, BarChart3 } from 'lucide-react';

const ADMIN_EMAIL = "letirreis@gmail.com";

export function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user profile exists
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // Create initial profile
        // Default role is 'colaborador' unless it's the admin email
        const role = user.email === ADMIN_EMAIL ? 'admin' : 'colaborador';
        
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err: any) {
      console.error("Erro no login:", err);
      setError("Falha ao entrar com Google. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-200 mb-6">
            <Layout className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">FunnelFlow</h1>
          <p className="mt-2 text-slate-500 font-medium">Plataforma de Diagnósticos Inteligentes</p>
        </div>

        <Card className="p-8 shadow-xl border-slate-200/60 bg-white/80 backdrop-blur-sm">
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-semibold text-slate-800">Bem-vindo de volta</h2>
              <p className="text-sm text-slate-500">Entre com sua conta Google para gerenciar seus funis.</p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100">
                {error}
              </div>
            )}

            <Button 
              onClick={handleLogin} 
              disabled={loading}
              className="w-full py-6 text-lg font-semibold bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3"
              variant="secondary"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              {loading ? 'Entrando...' : 'Entrar com Google'}
            </Button>

            <div className="pt-6 grid grid-cols-3 gap-4 border-t border-slate-100">
              <div className="flex flex-col items-center gap-1">
                <Shield className="h-5 w-5 text-blue-500" />
                <span className="text-[10px] font-bold uppercase text-slate-400">Seguro</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Zap className="h-5 w-5 text-amber-500" />
                <span className="text-[10px] font-bold uppercase text-slate-400">Rápido</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <BarChart3 className="h-5 w-5 text-emerald-500" />
                <span className="text-[10px] font-bold uppercase text-slate-400">Insights</span>
              </div>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-slate-400">
          Ao entrar, você concorda com nossos Termos de Uso e Política de Privacidade.
        </p>
      </div>
    </div>
  );
}
