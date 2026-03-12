import { useGetDashboardWeekly } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage, formatDate } from "@/lib/utils";
import { StatCard, PageLoader, ErrorState, Card } from "@/components/ui-components";
import { Trophy, TrendingUp, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function DashboardWeekly() {
  const { data, isLoading, error } = useGetDashboardWeekly();

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} />;

  // Prepare data for the chart from leaderboard
  const chartData = data.canvasserLeaderboard.map(entry => ({
    name: entry.canvasser,
    revenue: typeof entry.revenueSold === 'string' ? parseFloat(entry.revenueSold) : entry.revenueSold
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in-stagger delay-100">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900">Weekly Overview</h2>
          <p className="text-slate-500 mt-1">
            {formatDate(data.startDate)} — {formatDate(data.endDate)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Sold" value={formatCurrency(data.totalSold)} delay="delay-100" />
        <StatCard title="Cash Collected" value={formatCurrency(data.totalCollected)} delay="delay-200" />
        <StatCard title="Jobs Completed" value={data.totalCompleted} delay="delay-300" />
        <StatCard title="Avg Close Rate" value={formatPercentage(data.closeRate)} delay="delay-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in-stagger delay-500">
        <Card className="lg:col-span-2 flex flex-col">
          <h3 className="text-xl font-display font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> 
            Canvasser Leaderboard
          </h3>
          
          <div className="flex-1 min-h-[300px] mb-8">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} dy={10} />
                <YAxis tickFormatter={(val) => `$${val/1000}k`} axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#22c55e' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="pb-3 font-semibold">Canvasser</th>
                  <th className="pb-3 font-semibold">Revenue</th>
                  <th className="pb-3 font-semibold">Closes</th>
                  <th className="pb-3 font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y border-slate-100">
                {data.canvasserLeaderboard.map((entry, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                    <td className="py-4 font-bold text-slate-900 flex items-center gap-2">
                      {idx === 0 && <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs">1</span>}
                      {entry.canvasser}
                    </td>
                    <td className="py-4 font-medium text-slate-700">{formatCurrency(entry.revenueSold)}</td>
                    <td className="py-4 text-slate-600">{entry.closes}</td>
                    <td className="py-4 text-slate-600">{formatPercentage(entry.closeRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="!p-6 bg-slate-900 text-white border-none relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
            <h3 className="text-xl font-display font-bold mb-6 text-white relative z-10">Tech Production</h3>
            <div className="space-y-5 relative z-10">
              {data.techCompletionStats.map((tech, idx) => (
                <div key={idx}>
                  <div className="flex justify-between items-end mb-2">
                    <span className="font-bold">{tech.technician}</span>
                    <span className="text-sm text-slate-400">{tech.jobsCompleted} jobs</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-xl">
                    <span className="text-sm text-slate-400">Collected</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(tech.cashCollected)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card className="!p-5 border-none shadow-md bg-gradient-to-b from-white to-slate-50">
              <p className="text-sm font-bold text-slate-500 uppercase mb-2">Review Growth</p>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-display font-bold text-emerald-600">+{data.reviewGrowth}</span>
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
            </Card>
            <Card className="!p-5 border-none shadow-md bg-gradient-to-b from-white to-red-50/30">
              <p className="text-sm font-bold text-slate-500 uppercase mb-2">Open Issues</p>
              <div className="flex items-center gap-2">
                <span className={cn("text-3xl font-display font-bold", data.unresolvedIssues > 0 ? "text-red-600" : "text-slate-900")}>
                  {data.unresolvedIssues}
                </span>
                {data.unresolvedIssues > 0 && <AlertTriangle className="w-5 h-5 text-red-500" />}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
