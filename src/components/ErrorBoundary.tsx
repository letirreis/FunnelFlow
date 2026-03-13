import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let errorMessage = 'Ocorreu um erro inesperado.';
      try {
        const parsed = JSON.parse(error?.message || '');
        if (parsed.error) {
          errorMessage = `Erro no Firestore: ${parsed.error}`;
        }
      } catch {
        // Not a JSON error
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">Ops! Algo deu errado.</h2>
          <p className="mb-6 text-slate-600">{errorMessage}</p>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
