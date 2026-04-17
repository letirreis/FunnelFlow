import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, writeBatch, getDocs, addDoc, getDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Lead, WebhookConfig } from '../types';
import { Card, Input } from '../components/ui';
import { format } from 'date-fns';
import { Mail, Phone, Building, Download, Filter, X, Search, Trash2, AlertTriangle, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../components/ui';

const FIRESTORE_BATCH_LIMIT = 500;

function getWebhookEventForStatus(status: Lead['status']): 'response_submitted' | 'lead_captured' {
  return status === 'completed' ? 'response_submitted' : 'lead_captured';
}

interface LeadsListProps {
  funnelId: string;
  webhooks?: WebhookConfig[];
  funnelName?: string;
}

export function LeadsList({ funnelId, webhooks = [], funnelName = '' }: LeadsListProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [resendingWebhookLeadId, setResendingWebhookLeadId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<{ leadId: string; status: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'leads'), 
      where('funnelId', '==', funnelId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead)));
      setLoading(false);
    });
    return unsubscribe;
  }, [funnelId]);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchesSearch = 
        lead.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        lead.email.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesStatus = !filters.status || lead.status === filters.status;
      const matchesSource = !filters.utm_source || lead.utm_source?.toLowerCase().includes(filters.utm_source.toLowerCase());
      const matchesMedium = !filters.utm_medium || lead.utm_medium?.toLowerCase().includes(filters.utm_medium.toLowerCase());
      const matchesCampaign = !filters.utm_campaign || lead.utm_campaign?.toLowerCase().includes(filters.utm_campaign.toLowerCase());

      return matchesSearch && matchesStatus && matchesSource && matchesMedium && matchesCampaign;
    });
  }, [leads, filters]);

  const exportCSV = () => {
    const headers = ['Nome', 'Email', 'Telefone', 'Empresa', 'Cargo', 'Status', 'Variante', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Data'];
    const rows = filteredLeads.map(l => [
      l.name,
      l.email,
      l.phone || '',
      l.company || '',
      l.role || '',
      l.status || 'completed',
      l.variant || 'A',
      l.utm_source || '',
      l.utm_medium || '',
      l.utm_campaign || '',
      format(new Date(l.createdAt), 'dd/MM/yyyy HH:mm')
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_${funnelId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteLead = async (id: string) => {
    await deleteDoc(doc(db, 'leads', id));
    setLeadToDelete(null);
  };

  const deleteAllLeads = async () => {
    setIsDeletingAll(true);
    try {
      const snap = await getDocs(query(collection(db, 'leads'), where('funnelId', '==', funnelId)));
      for (let i = 0; i < snap.docs.length; i += FIRESTORE_BATCH_LIMIT) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      setShowDeleteAllConfirm(false);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const resendWebhook = async (lead: Lead) => {
    const isCompleted = lead.status === 'completed';
    const eventType = getWebhookEventForStatus(lead.status);

    const activeWebhooks = webhooks.filter(w => w.enabled && w.events.includes(eventType));
    if (activeWebhooks.length === 0) return;

    setResendingWebhookLeadId(lead.id);
    setResendResult(null);

    const now = new Date().toISOString();

    const leadBlock = {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      ...(lead.phone ? { phone: lead.phone } : {}),
      ...(lead.company ? { company: lead.company } : {}),
      ...(lead.revenue ? { revenue: lead.revenue } : {}),
      ...(lead.role ? { role: lead.role } : {}),
      ...(lead.customFields ? { customFields: lead.customFields } : {}),
      consent: lead.consent,
    };

    const trackingBlock = {
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      utm_content: lead.utm_content,
      utm_term: lead.utm_term,
      referrer: lead.referrer,
      device: lead.device,
    };

    let payload: Record<string, unknown>;

    if (isCompleted) {
      // Fetch the latest response document for this lead
      let responseScore = 0;
      let responseIsDisqualified: boolean = lead.isDisqualified ?? false;
      let responseDisqualifiedReason: string | null = lead.disqualifiedReason ?? null;
      let diagnosisTitle = 'N/A';
      let diagnosisDescription = '';
      let diagnosisId: string | null = null;

      try {
        const qResponse = query(
          collection(db, 'responses'),
          where('leadId', '==', lead.id),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const responseSnap = await getDocs(qResponse);
        if (!responseSnap.empty) {
          const rd = responseSnap.docs[0].data();
          responseScore = rd.score ?? 0;
          responseIsDisqualified = rd.isDisqualified ?? responseIsDisqualified;
          responseDisqualifiedReason = rd.disqualifiedReason ?? responseDisqualifiedReason;
          diagnosisId = rd.diagnosisId || null;
        }
      } catch (err) {
        console.error('Failed to fetch response for webhook resend:', err);
      }

      if (diagnosisId && diagnosisId !== 'none' && diagnosisId !== '') {
        try {
          const diagSnap = await getDoc(doc(db, 'funnels', funnelId, 'diagnoses', diagnosisId));
          if (diagSnap.exists()) {
            const dd = diagSnap.data();
            diagnosisTitle = dd.title || 'N/A';
            diagnosisDescription = dd.description || '';
          }
        } catch (err) {
          console.error('Failed to fetch diagnosis for webhook resend:', err);
        }
      }

      payload = {
        metadata: {
          event: 'response_submitted',
          source: 'FunnelBuilder Pro',
          version: '1.0',
          timestamp: now,
        },
        funnel: {
          id: funnelId,
          name: funnelName,
        },
        lead: leadBlock,
        tracking: trackingBlock,
        results: {
          score: responseScore,
          isDisqualified: responseIsDisqualified,
          disqualifiedReason: responseDisqualifiedReason,
          diagnosis: {
            title: diagnosisTitle,
            description: diagnosisDescription,
          },
        },
      };
    } else {
      payload = {
        metadata: {
          event: 'lead_captured',
          source: 'FunnelBuilder Pro',
          version: '1.0',
          timestamp: now,
        },
        funnel: {
          id: funnelId,
          name: funnelName,
        },
        lead: leadBlock,
        tracking: trackingBlock,
      };
    }

    let anySuccess = false;
    await Promise.all(activeWebhooks.map(async (webhook) => {
      let status: 'success' | 'error' = 'error';
      let statusCode: number | undefined;
      let errorMessage: string | undefined;

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhook.secret || '' },
          body: JSON.stringify({ ...payload, security: { secret: webhook.secret } }),
        });
        statusCode = response.status;
        status = response.ok ? 'success' : 'error';
        if (!response.ok) errorMessage = `HTTP ${response.status}`;
        if (response.ok) anySuccess = true;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      try {
        await addDoc(collection(db, 'funnels', funnelId, 'webhookLogs'), {
          funnelId,
          webhookId: webhook.id,
          webhookUrl: webhook.url,
          event: eventType,
          payload,
          status,
          ...(statusCode !== undefined ? { statusCode } : {}),
          ...(errorMessage ? { errorMessage } : {}),
          attemptCount: 1,
          createdAt: now,
          lastAttemptAt: now,
        });
      } catch (logErr) {
        console.error('Failed to write webhook log:', logErr);
      }
    }));

    setResendResult({ leadId: lead.id, status: anySuccess ? 'success' : 'error' });
    setResendingWebhookLeadId(null);
    setTimeout(() => setResendResult(null), 3000);
  };

  if (loading) return <div className="p-8 text-center">Carregando leads...</div>;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Leads Capturados</h2>
          <p className="text-sm text-slate-500">{filteredLeads.length} de {leads.length} leads encontrados</p>
        </div>
        <div className="flex items-center gap-3">
          {showDeleteAllConfirm ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 shadow-sm">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">Excluir todos os leads?</span>
              <button
                onClick={deleteAllLeads}
                disabled={isDeletingAll}
                className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isDeletingAll ? 'Excluindo...' : 'Confirmar'}
              </button>
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteAllConfirm(true)}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Excluir Todos
            </button>
          )}
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              showFilters ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Filter className="h-4 w-4" />
            Filtros
          </button>
          <button 
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {showFilters && (
        <Card className="mb-6 p-4 bg-slate-50 border-slate-200">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Busca Geral</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input 
                  placeholder="Nome ou email..." 
                  className="pl-9"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Status</label>
              <select 
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
              >
                <option value="">Todos</option>
                <option value="completed">Completo</option>
                <option value="incomplete">Incompleto</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">UTM Source</label>
              <Input 
                placeholder="Ex: facebook, google..." 
                value={filters.utm_source}
                onChange={(e) => setFilters({...filters, utm_source: e.target.value})}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">UTM Medium</label>
              <Input 
                placeholder="Ex: cpc, email..." 
                value={filters.utm_medium}
                onChange={(e) => setFilters({...filters, utm_medium: e.target.value})}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">UTM Campaign</label>
              <Input 
                placeholder="Nome da campanha..." 
                value={filters.utm_campaign}
                onChange={(e) => setFilters({...filters, utm_campaign: e.target.value})}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button 
              onClick={() => setFilters({ search: '', status: '', utm_source: '', utm_medium: '', utm_campaign: '' })}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Limpar Filtros
            </button>
          </div>
        </Card>
      )}

      {filteredLeads.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Mail className="mb-4 h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">Nenhum lead encontrado</h3>
          <p className="text-slate-500">Tente ajustar seus filtros ou divulgue seu funil.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900">Nome</th>
                <th className="px-6 py-3 font-semibold text-slate-900">Contato</th>
                <th className="px-6 py-3 font-semibold text-slate-900">Status</th>
                <th className="px-6 py-3 font-semibold text-slate-900 whitespace-nowrap">UTM Source</th>
                <th className="px-6 py-3 font-semibold text-slate-900 whitespace-nowrap">UTM Medium</th>
                <th className="px-6 py-3 font-semibold text-slate-900">Variante</th>
                <th className="px-6 py-3 font-semibold text-slate-900">Data</th>
                <th className="px-6 py-3 font-semibold text-slate-900" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{lead.name}</div>
                    <div className="text-xs text-slate-500">{lead.role}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Mail className="h-3 w-3" />
                      {lead.email}
                    </div>
                    {lead.phone && (
                      <div className="flex items-center gap-1 text-slate-500 text-xs mt-1">
                        <Phone className="h-3 w-3" />
                        {lead.phone}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      lead.status === 'incomplete' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    )}>
                      {lead.status === 'incomplete' ? 'Incompleto' : 'Completo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {lead.utm_source ? (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {lead.utm_source}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-600 text-xs">{lead.utm_medium || '-'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      lead.variant === 'B' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {lead.variant || 'A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                    {format(new Date(lead.createdAt), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {webhooks.some(w => w.enabled && w.events.includes(getWebhookEventForStatus(lead.status))) && (
                        leadToDelete !== lead.id && (
                          resendResult?.leadId === lead.id ? (
                            <span className={cn(
                              "flex items-center gap-1 text-[10px] font-medium",
                              resendResult.status === 'success' ? "text-emerald-600" : "text-red-500"
                            )}>
                              {resendResult.status === 'success'
                                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Enviado</>
                                : <><AlertCircle className="h-3.5 w-3.5" /> Erro</>}
                            </span>
                          ) : (
                            <button
                              onClick={() => resendWebhook(lead)}
                              disabled={resendingWebhookLeadId === lead.id}
                              title="Reenviar Webhook"
                              className="flex items-center gap-1 rounded p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                            >
                              <RefreshCw className={cn("h-4 w-4", resendingWebhookLeadId === lead.id && "animate-spin")} />
                            </button>
                          )
                        )
                      )}
                      {leadToDelete === lead.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => deleteLead(lead.id)}
                            className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700"
                          >
                            Sim
                          </button>
                          <button
                            onClick={() => setLeadToDelete(null)}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setLeadToDelete(lead.id)}
                          className="rounded p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
