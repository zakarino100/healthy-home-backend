import { useGetDashboardToday } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { StatCard, PageLoader, ErrorState, Card } from "@/components/ui-components";
import { CheckCircle2, TrendingUp, AlertCircle, Calendar } from "lucide-react";

export default function DashboardToday() {
  const { data, isLoading, error } = useGetDashboardToday();

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in-stagger delay-100">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900">Today's Performance</h2>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {data.date}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200/60">
          <TrendingUp className="w-5 h-5 text-primary" />
          <span className="font-bold text-slate-700">Pacing well against targets</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Revenue Sold" 
          value={formatCurrency(data.revenueSold)} 
          target={formatCurrency(data.kpiTargets?.revenueSold)} 
          delay="delay-100"
        />
        <StatCard 
          title="Good Conversations" 
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in-stagger delay-500">
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-xl font-display font-bold text-slate-900">Activity Pipeline</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="!p-6 bg-gradient-to-br from-slate-800 to-slate-900 !border-none text-white">
              <p className="text-slate-400 font-medium mb-2">Doors Knocked</p>
              <p className="text-4xl font-display font-bold">{data.doorsKnocked}</p>
            </Card>
            <Card className="!p-6 bg-gradient-to-br from-slate-800 to-slate-900 !border-none text-white">
              <p className="text-slate-400 font-medium mb-2">Quotes Given</p>
              <p className="text-4xl font-display font-bold">{data.quotesGiven}</p>
            </Card>
            <Card className="!p-6 bg-gradient-to-br from-primary to-emerald-600 !border-none text-white">
              <p className="text-emerald-100 font-medium mb-2">Avg Ticket</p>
              <p className="text-4xl font-display font-bold">{formatCurrency(data.averageTicket)}</p>
            </Card>
          </div>

          <h3 className="text-xl font-display font-bold text-slate-900 pt-4">Fulfillment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="!p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-500 font-medium mb-1">Jobs Completed</p>
                <p className="text-3xl font-display font-bold text-slate-900">{data.jobsCompleted}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </Card>
            <Card className="!p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-500 font-medium mb-1">Cash Collected</p>
                <p className="text-3xl font-display font-bold text-slate-900">{formatCurrency(data.cashCollected)}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <span className="font-bold text-xl">$</span>
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-xl font-display font-bold text-slate-900">Health Checks</h3>
          
          <Card className="!p-6">
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">Reviews & Issues</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-700 font-medium">Requests Sent</span>
                <span className="font-bold bg-slate-100 px-3 py-1 rounded-full">{data.reviewRequestsSent}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-700 font-medium">Reviews Received</span>
                <span className="font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">{data.reviewsReceived}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-700 font-medium flex items-center gap-2">
                  Unresolved Issues
                  {data.unresolvedIssues > 0 && <AlertCircle className="w-4 h-4 text-red-500" />}
                </span>
                <span className={`font-bold px-3 py-1 rounded-full ${data.unresolvedIssues > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`}>
                  {data.unresolvedIssues}
                </span>
              </div>
            </div>
          </Card>

          <Card className="!p-6 bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200/60">
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Tomorrow's Schedule</h4>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-5xl font-display font-extrabold text-slate-900">{data.tomorrowScheduledJobs}</span>
              <span className="text-slate-500 font-medium">Jobs</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
