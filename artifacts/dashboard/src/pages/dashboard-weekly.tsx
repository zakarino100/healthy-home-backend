import { useGetDashboardWeekly } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage, formatDate } from "@/lib/utils";
import { StatCard, PageLoader, ErrorState, Card, Badge } from "@/components/ui-components";
import { Trophy, TrendingUp, AlertTriangle, Wrench, CheckCircle2, CalendarClock, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function DashboardWeekly() {
  const { data, isLoading, error } = useGetDashboardWeekly();

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} />;

  const chartData = data.canvasserLeaderboard.map(entry => ({
    name: entry.canvasser.split(' ')[0],
    revenue: typeof entry.revenueSold === 'string' ? parseFloat(entry.revenueSold) : entry.revenueSold
  }));

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Weekly Overview</h2>
          <p className="text-slate-500 mt-1 text-sm">
            {formatDate(data.startDate)} — {formatDate(data.endDate)}
          </p>
        </div>
      </div>

      {/* KPI — 2 cols on mobile/tablet, 4 on xl+ */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <StatCard title="Total Sold" value={formatCurrency(data.totalSold)} delay="delay-100" />
        <StatCard title="Collected" value={formatCurrency(data.totalCollected)} delay="delay-200" />
        <StatCard title="Jobs Done" value={data.totalCompleted} delay="delay-300" />
        <StatCard title="Close Rate" value={formatPercentage(data.closeRate)} delay="delay-400" />
      </div>

      {/* Jobs This Week */}
      <Card className="!p-4 sm:!p-6">
        <h3 className="text-lg sm:text-xl font-display font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-blue-500" />
          Jobs This Week
        </h3>

        {/* Mini stat pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-blue-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarClock className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Scheduled</span>
            </div>
            <p className="text-2xl font-display font-bold text-blue-900">{data.totalScheduled}</p>
            {data.scheduledValue > 0 && (
              <p className="text-xs text-blue-600 mt-0.5">{formatCurrency(data.scheduledValue)} pending</p>
            )}
          </div>
          <div className="bg-emerald-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Serviced</span>
            </div>
            <p className="text-2xl font-display font-bold text-emerald-900">{data.totalCompleted}</p>
            <p className="text-xs text-emerald-600 mt-0.5">jobs done</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 sm:col-span-1 col-span-2">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Cash Collected</span>
            </div>
            <p className="text-2xl font-display font-bold text-slate-900">{formatCurrency(data.totalCollected)}</p>
            <p className="text-xs text-slate-500 mt-0.5">from completed jobs</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 sm:col-span-1 col-span-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Wrench className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Total Jobs</span>
            </div>
            <p className="text-2xl font-display font-bold text-amber-900">{data.totalScheduled + data.totalCompleted}</p>
            <p className="text-xs text-amber-600 mt-0.5">this week</p>
          </div>
        </div>

        {/* Jobs table */}
        {data.weekJobsList.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center">
            <Wrench className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-400">No jobs scheduled or completed this week.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left min-w-[540px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs">
                  <th className="pb-2 font-semibold">Customer</th>
                  <th className="pb-2 font-semibold hidden sm:table-cell">Service</th>
                  <th className="pb-2 font-semibold">Technician</th>
                  <th className="pb-2 font-semibold">Date</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.weekJobsList.map(job => {
                  const dateStr = job.scheduledAt
                    ? new Date(job.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                    : job.completedAt
                      ? new Date(job.completedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                      : "—";
                  const amount = job.status === "completed"
                    ? job.paymentAmountCollected
                    : job.soldPrice;
                  return (
                    <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pr-3">
                        <p className="font-bold text-sm text-slate-900 leading-tight">{job.customerName}</p>
                        {job.customerAddress && (
                          <p className="text-xs text-slate-400 truncate max-w-[140px]">{job.customerAddress}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 hidden sm:table-cell">
                        <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                          {job.serviceType.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-sm text-slate-700">{job.technicianAssigned || "—"}</td>
                      <td className="py-2.5 pr-3 text-xs text-slate-600 whitespace-nowrap">{dateStr}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant={job.status === "completed" ? "success" : "default"}>
                          {job.status === "completed" ? "Serviced" : "Scheduled"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-bold text-sm text-slate-900">
                        {amount ? formatCurrency(amount) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
        <Card className="lg:col-span-2 flex flex-col !p-4 sm:!p-6">
          <h3 className="text-lg sm:text-xl font-display font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Canvasser Leaderboard
          </h3>

          {chartData.length > 0 ? (
            <div className="h-48 sm:h-[260px] mb-5 sm:mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tickFormatter={(val) => `$${val >= 1000 ? val/1000 + 'k' : val}`} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={40} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: 13 }}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#22c55e' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left min-w-[280px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs sm:text-sm">
                  <th className="pb-2 sm:pb-3 font-semibold">Canvasser</th>
                  <th className="pb-2 sm:pb-3 font-semibold">Revenue</th>
                  <th className="pb-2 sm:pb-3 font-semibold">Closes</th>
                  <th className="pb-2 sm:pb-3 font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.canvasserLeaderboard.map((entry, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-bold text-slate-900 text-sm flex items-center gap-2">
                      {idx === 0 && <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs shrink-0">1</span>}
                      <span className="truncate max-w-[100px] sm:max-w-none">{entry.canvasser}</span>
                    </td>
                    <td className="py-3 font-medium text-slate-700 text-sm">{formatCurrency(entry.revenueSold)}</td>
                    <td className="py-3 text-slate-600 text-sm">{entry.closes}</td>
                    <td className="py-3 text-slate-600 text-sm">{formatPercentage(entry.closeRate)}</td>
                  </tr>
                ))}
                {data.canvasserLeaderboard.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400 text-sm">No canvassing data this week.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4 sm:space-y-6">
          <Card className="!p-4 sm:!p-6 bg-slate-900 text-white border-none relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
            <h3 className="text-lg sm:text-xl font-display font-bold mb-4 sm:mb-6 text-white relative z-10">Tech Production</h3>
            <div className="space-y-4 relative z-10">
              {data.techCompletionStats.map((tech, idx) => (
                <div key={idx}>
                  <div className="flex justify-between items-end mb-2">
                    <span className="font-bold text-sm sm:text-base">{tech.technician}</span>
                    <span className="text-xs sm:text-sm text-slate-400">{tech.jobsCompleted} jobs</span>
                  </div>
                  <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-800/50 rounded-xl">
                    <span className="text-xs sm:text-sm text-slate-400">Collected</span>
                    <span className="font-bold text-emerald-400 text-sm sm:text-base">{formatCurrency(tech.cashCollected)}</span>
                  </div>
                </div>
              ))}
              {data.techCompletionStats.length === 0 && (
                <p className="text-slate-400 text-sm">No technician data this week.</p>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card className="!p-4 sm:!p-5 border-none shadow-md bg-gradient-to-b from-white to-slate-50">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Review Growth</p>
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-2xl sm:text-3xl font-display font-bold text-emerald-600">+{data.reviewGrowth}</span>
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
              </div>
            </Card>
            <Card className="!p-4 sm:!p-5 border-none shadow-md bg-gradient-to-b from-white to-red-50/30">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Open Issues</p>
              <div className="flex items-center gap-1 sm:gap-2">
                <span className={cn("text-2xl sm:text-3xl font-display font-bold", data.unresolvedIssues > 0 ? "text-red-600" : "text-slate-900")}>
                  {data.unresolvedIssues}
                </span>
                {data.unresolvedIssues > 0 && <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
