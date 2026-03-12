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
    generateMutation.mutate({
      data: { date: new Date().toISOString().split('T')[0] }
    });
  };

  if (isLoading && !reports) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const selectedReport = reports?.find(r => r.id === selectedReportId);

  return (
    <div className="space-y-8 animate-in-stagger delay-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900">End of Day Reports</h2>
          <p className="text-slate-500 mt-1">Daily Robin-ready data payloads</p>
        </div>
        <Button onClick={handleGenerateToday} isLoading={generateMutation.isPending} className="bg-blue-600 hover:bg-blue-700 shadow-blue-600/25 border-none text-white">
          <PlayCircle className="w-5 h-5 mr-2" /> Generate Today's Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {reports?.map((report) => (
            <Card 
              key={report.id} 
              className={`cursor-pointer transition-all ${selectedReportId === report.id ? 'border-primary ring-1 ring-primary shadow-md' : 'hover:border-slate-300'}`}
              onClick={() => setSelectedReportId(report.id)}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  {formatDate(report.reportDate)}
                </span>
                {report.webhookSent && <Badge variant="success">Sent</Badge>}
              </div>
              <div className="text-sm text-slate-500 flex justify-between">
                <span>Revenue: {formatCurrency(report.revenueSold)}</span>
                <span>Jobs: {report.jobsCompleted}</span>
              </div>
            </Card>
          ))}
          {reports?.length === 0 && (
            <div className="py-8 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl">
              No reports generated yet.
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedReport ? (
            <Card className="!p-0 overflow-hidden border-2 border-slate-200 shadow-xl bg-slate-50">
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-xl">Report Payload Preview</h3>
                  <p className="text-slate-400 text-sm mt-1">{formatDate(selectedReport.reportDate)}</p>
                </div>
                <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                  <Download className="w-4 h-4 mr-2" /> Export JSON
                </Button>
              </div>
              <div className="p-6 bg-[#0d1117] text-[#c9d1d9] font-mono text-sm overflow-x-auto">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify({
                    businessName: "Healthy Home",
                    reportDate: selectedReport.reportDate,
                    salesMetrics: {
                      doorsKnocked: selectedReport.doorsKnocked,
                      goodConversations: selectedReport.goodConversations,
                      quotesGiven: selectedReport.quotesGiven,
                      closes: selectedReport.closes,
                      revenueSold: selectedReport.revenueSold,
                      bundlesSold: selectedReport.bundlesSold,
                    },
                    fulfillmentMetrics: {
                      jobsCompleted: selectedReport.jobsCompleted,
                      cashCollected: selectedReport.cashCollected,
                    },
                    reviewMetrics: {
                      reviewRequestsSent: selectedReport.reviewRequestsSent,
                      positiveSatisfaction: selectedReport.positiveSatisfactionResponses,
                      negativeSatisfaction: selectedReport.negativeSatisfactionResponses,
                      reviewsReceived: selectedReport.reviewsReceived,
                    },
                    openIssues: selectedReport.openIssuesCount
                  }, null, 2)}
                </pre>
              </div>
            </Card>
          ) : (
            <div className="h-full min-h-[400px] flex items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 bg-slate-50/50">
              Select a report to view payload
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
