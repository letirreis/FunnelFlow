import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Funnel, Lead, Response, Diagnosis, Question } from '../types';
import { Card } from './ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Users, MousePointer2, Target, TrendingUp, Filter } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function AnalyticsTab({ funnel, questions, diagnoses }: { funnel: Funnel; questions: Question[]; diagnoses: Diagnosis[] }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const qLeads = query(collection(db, 'leads'), where('funnelId', '==', funnel.id));
      const sLeads = await getDocs(qLeads);
      const leadsData = sLeads.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      setLeads(leadsData);

      const qResponses = query(collection(db, 'responses'), where('funnelId', '==', funnel.id));
      const sResponses = await getDocs(qResponses);
      const responsesData = sResponses.docs.map(doc => ({ id: doc.id, ...doc.data() } as Response));
      setResponses(responsesData);

      setLoading(false);
    };
    fetchData();
  }, [funnel.id]);

  if (loading) return <div className="flex h-64 items-center justify-center">Carregando dados...</div>;

  // 1. Conversion Stats
  const conversionRate = funnel.views > 0 ? ((leads.length / funnel.views) * 100).toFixed(1) : 0;

  // 2. Diagnosis Distribution
  const diagnosisData = diagnoses.map(d => ({
    name: d.title,
    value: responses.filter(r => r.diagnosisId === d.id).length
  })).filter(d => d.value > 0);

  // 3. UTM Source Distribution
  const utmSources: Record<string, number> = {};
  leads.forEach(l => {
    const source = l.utm_source || 'Direto / Orgânico';
    utmSources[source] = (utmSources[source] || 0) + 1;
  });
  const utmData = Object.entries(utmSources).map(([name, value]) => ({ name, value }));

  // 4. Drop-off Analysis (Simplified)
  // We can estimate drop-off by looking at how many answers were provided for each question
  const dropOffData = questions.map((q, idx) => {
    const count = responses.filter(r => {
      const answers = JSON.parse(r.answersJson);
      return !!answers[q.id];
    }).length;
    return { name: `P${idx + 1}`, count };
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Visualizações" value={funnel.views} icon={MousePointer2} color="blue" />
        <MetricCard title="Leads Capturados" value={leads.length} icon={Users} color="green" />
        <MetricCard title="Taxa de Conversão" value={`${conversionRate}%`} icon={Target} color="amber" />
        <MetricCard title="Total de Respostas" value={responses.length} icon={TrendingUp} color="purple" />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Diagnosis Distribution */}
        <Card className="p-6">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-500">Distribuição de Resultados</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={diagnosisData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {diagnosisData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {diagnosisData.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="truncate text-slate-600">{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* UTM Sources */}
        <Card className="p-6">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-500">Origem dos Leads (UTM Source)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utmData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} fontSize={10} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Drop-off Analysis */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-500">Engajamento por Pergunta (Retenção)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dropOffData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400 italic">
            Mostra quantos usuários responderam cada pergunta. Quedas bruscas indicam perguntas confusas ou longas demais.
          </p>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h4 className="mt-1 text-2xl font-bold text-slate-900">{value}</h4>
        </div>
        <div className={`rounded-xl p-3 ${colors[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Card>
  );
}
