import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Lead } from '../types';
import { Card, Input } from '../components/ui';
import { format } from 'date-fns';
import { Mail, Phone, Building, Download, Filter, X, Search } from 'lucide-react';
import { cn } from '../components/ui';

export function LeadsList({ funnelId }: { funnelId: string }) {
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

  if (loading) return <div className="p-8 text-center">Carregando leads...</div>;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Leads Capturados</h2>
          <p className="text-sm text-slate-500">{filteredLeads.length} de {leads.length} leads encontrados</p>
        </div>
        <div className="flex items-center gap-3">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
