import { useGetDashboardToday } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { StatCard, PageLoader, ErrorState, Card } from "@/components/ui-components";
import { CheckCircle2, TrendingUp, AlertCircle, Calendar } from "lucide-react";

export default function DashboardToday() {
  const { data, isLoading, error } = useGetDashboardToday();

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} />;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Today's Performance</h2>
          <p className="text-slate-500 mt-1 flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4" />
            {data.date}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl shadow-sm border border-slate-200/60 self-start sm:self-auto">
          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <span className="font-bold text-slate-700 text-sm sm:text-base">Pacing against targets</span>
        </div>
      </div>

      {/* KPI Cards — 2 columns on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          title="Revenue Sold"
          value={formatCurrency(data.revenueSold)}
          target={data.kpiTargets?.revenueSold}
          delay="delay-100"
        />
        <StatCard
          title="Conversations"
          value={data.goodConversations}
          target={data.kpiTargets?.goodConversations}
          delay="delay-200"
        />
        <StatCard
          title="Closes"
          value={data.closes}
          target={data.kpiTargets?.closes}
          delay="delay-300"
        />
        <StatCard
          title="Close Rate"
          value={formatPercentage(data.closeRate)}
          delay="delay-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        <div className="lg:col-span-2 space-y-5 sm:space-y-6">
          <h3 className="text-lg sm:text-xl font-display font-bold text-slate-900">Activity Pipeline</h3>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Card className="!p-4 sm:!p-6 bg-gradient-to-br from-slate-800 to-slate-900 !border-none text-white">
              <p className="text-slate-400 font-medium mb-1 text-xs sm:text-sm">Doors Knocked</p>
              <p className="text-2xl sm:text-4xl font-display font-bold">{data.doorsKnocked}</p>
            </Card>
            <Card className="!p-4 sm:!p-6 bg-gradient-to-br from-slate-800 to-slate-900 !border-none text-white">
              <p className="text-slate-400 font-medium mb-1 text-xs sm:text-sm">Quotes Given</p>
              <p className="text-2xl sm:text-4xl font-display font-bold">{data.quotesGiven}</p>
            </Card>
            <Card className="!p-4 sm:!p-6 bg-gradient-to-br from-primary to-emerald-600 !border-none text-white">
              <p className="text-emerald-100 font-medium mb-1 text-xs sm:text-sm">Avg Ticket</p>
              <p className="text-2xl sm:text-4xl font-display font-bold">{formatCurrency(data.averageTicket)}</p>
            </Card>
          </div>

          <h3 className="text-lg sm:text-xl font-display font-bold text-slate-900 pt-2">Fulfillment</h3>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card className="!p-4 sm:!p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-500 font-medium mb-1 text-xs sm:text-sm">Jobs Completed</p>
                <p className="text-2xl sm:text-3xl font-display font-bold text-slate-900">{data.jobsCompleted}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </Card>
            <Card className="!p-4 sm:!p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-500 font-medium mb-1 text-xs sm:text-sm">Cash Collected</p>
                <p className="text-2xl sm:text-3xl font-display font-bold text-slate-900">{formatCurrency(data.cashCollected)}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <span className="font-bold text-lg sm:text-xl">$</span>
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <h3 className="text-lg sm:text-xl font-display font-bold text-slate-900">Health Checks</h3>
          
          <Card className="!p-4 sm:!p-6">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Reviews & Issues</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <span className="text-slate-700 font-medium text-sm">Requests Sent</span>
                <span className="font-bold bg-slate-100 px-3 py-1 rounded-full text-sm">{data.reviewRequestsSent}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <span className="text-slate-700 font-medium text-sm">Reviews Received</span>
                <span className="font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm">{data.reviewsReceived}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-700 font-medium flex items-center gap-2 text-sm">
                  Unresolved Issues
                  {data.unresolvedIssues > 0 && <AlertCircle className="w-4 h-4 text-red-500" />}
                </span>
                <span className={`font-bold px-3 py-1 rounded-full text-sm ${data.unresolvedIssues > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`}>
                  {data.unresolvedIssues}
                </span>
              </div>
            </div>
          </Card>

          <Card className="!p-4 sm:!p-6 bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200/60">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Tomorrow's Schedule</h4>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-4xl sm:text-5xl font-display font-extrabold text-slate-900">{data.tomorrowScheduledJobs}</span>
              <span className="text-slate-500 font-medium">Jobs</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
