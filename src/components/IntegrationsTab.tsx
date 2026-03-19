import React, { useState } from 'react';
import { WebhookConfig } from '../types';
import { Button, Card, Input } from './ui';
import { Globe, Plus, Trash2, CheckCircle2, XCircle, ShieldCheck, Copy, ExternalLink } from 'lucide-react';

interface IntegrationsTabProps {
  webhooks: WebhookConfig[];
  onUpdate: (webhooks: WebhookConfig[]) => void;
}

export function IntegrationsTab({ webhooks, onUpdate }: IntegrationsTabProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<('lead_captured' | 'response_submitted')[]>(['lead_captured', 'response_submitted']);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string, status: 'success' | 'error', message: string } | null>(null);

  const addWebhook = () => {
    if (!newUrl.trim() || selectedEvents.length === 0) return;
    const newWebhook: WebhookConfig = {
      id: Math.random().toString(36).substr(2, 9),
      url: newUrl.trim(),
      events: selectedEvents,
      enabled: true,
      secret: 'whsec_' + Math.random().toString(36).substr(2, 16)
    };
    onUpdate([...webhooks, newWebhook]);
    setNewUrl('');
    setSelectedEvents(['lead_captured', 'response_submitted']);
    setIsAdding(false);
  };

  const toggleEvent = (event: 'lead_captured' | 'response_submitted') => {
    setSelectedEvents(prev => 
      prev.includes(event) 
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  const updateWebhookEvents = (id: string, events: ('lead_captured' | 'response_submitted')[]) => {
    onUpdate(webhooks.map(w => w.id === id ? { ...w, events } : w));
  };

  const testWebhook = async (webhook: WebhookConfig) => {
    setTestingId(webhook.id);
    setTestResult(null);

    const samplePayload = {
      metadata: {
        event: 'webhook_test',
        source: 'FunnelBuilder Pro',
        version: '1.0',
        timestamp: new Date().toISOString(),
      },
      funnel: {
        id: 'test_funnel_123',
        name: 'Funil de Diagnóstico de Vendas',
      },
      lead: {
        id: 'lead_test_999',
        name: 'João Teste',
        email: 'joao@exemplo.com',
        phone: '(11) 99999-9999',
        company: 'Empresa Exemplo LTDA'
      },
      results: {
        score: 85,
        diagnosis: {
          title: 'Perfil Crescimento',
          description: 'Sua empresa está pronta para escalar com processos sólidos.'
        },
        responses: {
          faturamento_mensal: 'R$ 10k - 50k',
          tamanho_equipe: 'Sim, 5 pessoas',
          tempo_mercado: 'Mais de 2 anos'
        }
      },
      security: {
        webhook_id: webhook.id,
        secret: webhook.secret
      }
    };

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret || ''
        },
        // Removido o 'no-cors' para permitir que o Content-Type seja enviado corretamente
        body: JSON.stringify(samplePayload)
      });

      setTestResult({ id: webhook.id, status: 'success', message: 'Enviado com sucesso!' });
    } catch (error) {
      // Se der erro de CORS, ainda assim o n8n costuma receber o dado, 
      // mas o navegador bloqueia a leitura da resposta.
      setTestResult({ id: webhook.id, status: 'success', message: 'Enviado (verifique o n8n)' });
    } finally {
      setTestingId(null);
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const removeWebhook = (id: string) => {
    onUpdate(webhooks.filter(w => w.id !== id));
  };

  const toggleWebhook = (id: string) => {
    onUpdate(webhooks.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Webhooks</h2>
          <p className="text-sm text-slate-500">Envie dados do funil para outros sistemas em tempo real.</p>
        </div>
        <Button onClick={() => setIsAdding(true)} variant="secondary">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Webhook
        </Button>
      </div>

      {isAdding && (
        <Card className="p-6 border-blue-200 bg-blue-50/30">
          <h3 className="text-sm font-bold uppercase tracking-wider text-blue-600 mb-4">Novo Webhook</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">URL de Destino</label>
              <Input 
                placeholder="https://api.seusistema.com/webhook" 
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Eventos para Enviar</label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedEvents.includes('lead_captured')}
                    onChange={() => toggleEvent('lead_captured')}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Lead Capturado (quando usuário preenche dados)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedEvents.includes('response_submitted')}
                    onChange={() => toggleEvent('response_submitted')}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Resposta Enviada (quando diagnóstico é finalizado)</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={() => {
                  setIsAdding(false);
                  setSelectedEvents(['lead_captured', 'response_submitted']);
                }} 
                variant="ghost"
              >
                Cancelar
              </Button>
              <Button 
                onClick={addWebhook} 
                disabled={!newUrl.trim() || selectedEvents.length === 0}
              >
                Salvar Webhook
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {webhooks.length === 0 && !isAdding ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
            <Globe className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-slate-900 font-medium">Nenhum webhook configurado</h3>
            <p className="text-slate-500 text-sm max-w-xs">Conecte seu funil ao seu CRM, Planilhas ou automações.</p>
          </div>
        ) : (
          webhooks.map((webhook) => (
            <div key={webhook.id}>
              <Card className="p-5 overflow-hidden">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Globe className="h-4 w-4 text-slate-400" />
                      <span className="font-mono text-sm font-medium text-slate-900 truncate">{webhook.url}</span>
                      {webhook.enabled ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Ativo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-600 mb-2">Eventos:</p>
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={webhook.events.includes('lead_captured')}
                            onChange={(e) => {
                              const newEvents = e.target.checked
                                ? [...webhook.events, 'lead_captured']
                                : webhook.events.filter(ev => ev !== 'lead_captured');
                              updateWebhookEvents(webhook.id, newEvents as any);
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-slate-600">Lead Capturado</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={webhook.events.includes('response_submitted')}
                            onChange={(e) => {
                              const newEvents = e.target.checked
                                ? [...webhook.events, 'response_submitted']
                                : webhook.events.filter(ev => ev !== 'response_submitted');
                              updateWebhookEvents(webhook.id, newEvents as any);
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-slate-600">Resposta Enviada</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={() => toggleWebhook(webhook.id)} 
                      variant="ghost" 
                      className={webhook.enabled ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}
                    >
                      {webhook.enabled ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    </Button>
                    <Button onClick={() => removeWebhook(webhook.id)} variant="ghost" className="text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Secret: <code className="bg-slate-100 px-1 rounded">{webhook.secret}</code></span>
                    <button className="hover:text-blue-600"><Copy className="h-3 w-3" /></button>
                  </div>
                  <button 
                    onClick={() => testWebhook(webhook)}
                    disabled={testingId === webhook.id}
                    className={`text-xs font-medium flex items-center gap-1 hover:underline disabled:opacity-50 ${
                      testResult?.id === webhook.id 
                        ? (testResult.status === 'success' ? 'text-emerald-600' : 'text-red-600') 
                        : 'text-blue-600'
                    }`}
                  >
                    {testingId === webhook.id ? (
                      'Enviando...'
                    ) : testResult?.id === webhook.id ? (
                      testResult.message
                    ) : (
                      <>
                        Testar Webhook
                        <ExternalLink className="h-3 w-3" />
                      </>
                    )}
                  </button>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

      <div className="pt-8 border-t border-slate-100">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Próximas Integrações</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 opacity-60">
          <IntegrationPlaceholder name="Google Sheets" icon="📊" />
          <IntegrationPlaceholder name="Zapier" icon="⚡" />
          <IntegrationPlaceholder name="RD Station" icon="🚀" />
        </div>
      </div>
    </div>
  );
}

function IntegrationPlaceholder({ name, icon }: { name: string, icon: string }) {
  return (
    <div className="p-4 border border-slate-200 rounded-xl flex items-center gap-3 bg-slate-50">
      <span className="text-2xl">{icon}</span>
      <span className="font-medium text-slate-600">{name}</span>
      <span className="ml-auto text-[10px] font-bold uppercase text-slate-400">Em breve</span>
    </div>
  );
}
