import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Lead } from '../types';
import { Card } from '../components/ui';
import { format } from 'date-fns';
import { Mail, Phone, Building, Download } from 'lucide-react';

export function LeadsList({ funnelId }: { funnelId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="p-8 text-center">Carregando leads...</div>;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Leads Capturados</h2>
        <button className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      {leads.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Mail className="mb-4 h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">Nenhum lead ainda</h3>
          <p className="text-slate-500">Divulgue seu funil para começar a capturar contatos.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900">Nome</th>
                <th className="px-6 py-3 font-semibold text-slate-900">Contato</th>
                <th className="px-6 py-3 font-semibold text-slate-900">Empresa</th>
                <th className="px-6 py-3 font-semibold text-slate-900">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
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
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Building className="h-3 w-3" />
                      {lead.company || '-'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{lead.revenue}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
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
