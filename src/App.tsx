import React, { useState, useEffect, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Renderer } from './pages/Renderer';
import { UserProfile } from './types';

// Lazy-load authenticated-only pages so their heavy dependencies
// (TipTap, DnD Kit, recharts) are never downloaded by public funnel visitors.
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Builder = React.lazy(() => import('./pages/Builder').then(m => ({ default: m.Builder })));
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));

function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<{ type: 'dashboard' | 'builder' | 'renderer'; id?: string }>({ type: 'dashboard' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Fetch user profile from Firestore
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserProfile({ ...userSnap.data() } as UserProfile);
        } else {
          // Profile might still be creating in Login.tsx
          // We'll let Login.tsx handle the creation and then onAuthStateChanged will trigger again if needed
          // or we can just wait. For now, we'll set a basic profile if not found yet
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
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

  if (loading) {
    return <PageSpinner />;
  }

  if (view.type === 'renderer') {
    return <Renderer slug={view.id!} />;
  }

  if (!userProfile) {
    return (
      <Suspense fallback={<PageSpinner />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageSpinner />}>
      <div className="min-h-screen bg-slate-50">
        {view.type === 'dashboard' ? (
          <Dashboard onEdit={(id) => setView({ type: 'builder', id })} />
        ) : (
          <Builder funnelId={view.id!} onBack={() => setView({ type: 'dashboard' })} />
        )}
      </div>
    </Suspense>
  );
}
