import { useListDailyReports, useGenerateDailyReport } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Button, Badge } from "@/components/ui-components";
import { FileText, Download, PlayCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function ReportsPage() {
  const { data: reports, isLoading, error } = useListDailyReports();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const generateMutation = useGenerateDailyReport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/reports/daily"] });
        toast({ title: "Daily report generated and saved." });
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  });

  const handleGenerateToday = () => {
    generateMutation.mutate({ data: { date: new Date().toISOString().split('T')[0] } });
  };

  if (isLoading && !reports) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const selectedReport = reports?.find(r => r.id === selectedReportId);

  const exportUrl = selectedReport
    ? `/api/reports/daily/${selectedReport.reportDate}/export?format=csv`
    : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">End of Day Reports</h2>
          <p className="text-slate-500 mt-1 text-sm">Daily Robin-ready data payloads</p>
        </div>
        <Button
          onClick={handleGenerateToday}
          isLoading={generateMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700 shadow-blue-600/25 border-none text-white w-full sm:w-auto justify-center"
        >
          <PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Generate Today's Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Report List */}
        <div className="lg:col-span-1 space-y-3">
          {reports?.map((report) => (
            <Card
              key={report.id}
              className={`cursor-pointer transition-all !p-4 ${selectedReportId === report.id ? 'border-primary ring-1 ring-primary shadow-md' : 'hover:border-slate-300'}`}
              onClick={() => setSelectedReportId(report.id)}
            >
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  {formatDate(report.reportDate)}
                </span>
                {report.webhookSent && <Badge variant="success">Sent</Badge>}
              </div>
              <div className="text-xs sm:text-sm text-slate-500 flex justify-between">
                <span>Rev: {formatCurrency(report.revenueSold)}</span>
                <span>Jobs: {report.jobsCompleted}</span>
              </div>
            </Card>
          ))}
          {reports?.length === 0 && (
            <div className="py-10 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl text-sm">
              No reports generated yet.
            </div>
          )}
        </div>

        {/* Report Detail */}
        <div className="lg:col-span-2">
          {selectedReport ? (
            <Card className="!p-0 overflow-hidden border-2 border-slate-200 shadow-xl bg-slate-50">
              <div className="px-4 py-3 sm:p-6 bg-slate-900 text-white flex justify-between items-center gap-3">
                <div>
                  <h3 className="font-bold text-base sm:text-xl">Report Payload</h3>
                  <p className="text-slate-400 text-xs sm:text-sm mt-0.5">{formatDate(selectedReport.reportDate)}</p>
                </div>
                <a href={exportUrl ?? '#'} download className="inline-flex">
                  <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white shrink-0">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                  </Button>
                </a>
              </div>
              <div className="p-4 sm:p-6 bg-[#0d1117] text-[#c9d1d9] font-mono text-xs sm:text-sm overflow-auto max-h-[50vh] lg:max-h-[60vh]">
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify({
                    business_name: "Healthy Home",
                    report_date: selectedReport.reportDate,
                    sales_metrics: {
                      doors_knocked: selectedReport.doorsKnocked,
                      good_conversations: selectedReport.goodConversations,
                      quotes_given: selectedReport.quotesGiven,
                      closes: selectedReport.closes,
                      close_rate_pct: selectedReport.closeRate,
                      revenue_sold: selectedReport.revenueSold,
                      bundles_sold: selectedReport.bundlesSold,
                    },
                    fulfillment_metrics: {
                      jobs_completed: selectedReport.jobsCompleted,
                      cash_collected: selectedReport.cashCollected,
                    },
                    review_metrics: {
                      satisfaction_requests_sent: selectedReport.reviewRequestsSent,
                      positive_responses: selectedReport.positiveSatisfactionResponses,
                      negative_responses: selectedReport.negativeSatisfactionResponses,
                      reviews_received: selectedReport.reviewsReceived,
                    },
                    open_issues: { count: selectedReport.openIssuesCount },
                    anomaly_notes: selectedReport.anomaliesNotes,
                  }, null, 2)}
                </pre>
              </div>
            </Card>
          ) : (
            <div className="min-h-[200px] lg:min-h-[400px] flex items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 bg-slate-50/50">
              <div className="text-center px-6">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Select a report to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
