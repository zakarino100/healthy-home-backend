import { useState, useEffect } from "react";
import { useListReviewWorkflows, useRecordSatisfaction, useResolveIssue } from "@workspace/api-client-react";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Label } from "@/components/ui-components";
import { Star, AlertCircle, MessageSquareText, CheckCircle2, ToggleLeft, ToggleRight, CalendarRange, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Auto-send toggle ─────────────────────────────────────────────────────────

function useAutoSend() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`${API_BASE}/api/reviews/settings`)
      .then(r => r.json())
      .then(d => setEnabled(d.autoSendEnabled))
      .catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    const next = !enabled;
    try {
      const r = await fetch(`${API_BASE}/api/reviews/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSendEnabled: next }),
      });
      const d = await r.json();
      setEnabled(d.autoSendEnabled);
      toast({ title: d.autoSendEnabled ? "Auto-send enabled" : "Auto-send disabled" });
    } catch {
      toast({ title: "Failed to update setting", variant: "destructive" });
    }
  };

  return { enabled, toggle };
}

// ─── Date-range batch trigger ─────────────────────────────────────────────────

function BatchTriggerPanel() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!startDate || !endDate) {
      toast({ title: "Select a start and end date", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/reviews/campaign/date-range`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const d = await r.json();
      toast({ title: `Queued ${d.queued} review requests (${d.skipped} skipped)` });
    } catch {
      toast({ title: "Batch trigger failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="!p-4 sm:!p-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarRange className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-base text-slate-900">Manual Batch Trigger</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Queue review requests for all completed jobs in a date range. Sends at next 10 AM window.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <Label>Start Date</Label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-primary focus:outline-none text-sm"
          />
        </div>
        <div className="flex-1">
          <Label>End Date</Label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-primary focus:outline-none text-sm"
          />
        </div>
        <Button onClick={handleSend} isLoading={loading} className="sm:mb-0 w-full sm:w-auto">
          <Send className="w-4 h-4 mr-2" /> Queue Requests
        </Button>
      </div>
    </Card>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function ReviewStats({ workflows }: { workflows: any[] }) {
  const total = workflows.length;
  const sent = workflows.filter(w => w.satisfactionSentAt).length;
  const responded = workflows.filter(w => w.satisfactionScore).length;
  const positive = workflows.filter(w => w.satisfactionScore && w.satisfactionScore >= 4).length;
  const received = workflows.filter(w => w.status === "review_received" || w.reviewCompletedAt).length;
  const issues = workflows.filter(w => w.isIssueFlagged).length;

  const stats = [
    { label: "Total", value: total, color: "text-slate-900" },
    { label: "Sent", value: sent, color: "text-blue-600" },
    { label: "Responded", value: responded, color: "text-indigo-600" },
    { label: "Positive (4-5★)", value: positive, color: "text-amber-500" },
    { label: "Reviews Received", value: received, color: "text-green-600" },
    { label: "Issues Flagged", value: issues, color: "text-red-500" },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {stats.map(s => (
        <Card key={s.label} className="!p-3 sm:!p-4 text-center">
          <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
        </Card>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const { data: workflows, isLoading, error } = useListReviewWorkflows();
  const [selectedWorkflow, setSelectedWorkflow] = useState<number | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const { enabled: autoSendEnabled, toggle: toggleAutoSend } = useAutoSend();

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const recordMutation = useRecordSatisfaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
        toast({ title: "Satisfaction recorded" });
      }
    }
  });

  if (isLoading && !workflows) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Review Automation</h2>
          <p className="text-slate-500 mt-1 text-sm">Manage satisfaction requests and Google reviews</p>
        </div>

        {/* Auto-send toggle */}
        <button
          onClick={toggleAutoSend}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-medium text-sm transition-all ${
            autoSendEnabled
              ? "border-green-400 bg-green-50 text-green-700 hover:bg-green-100"
              : "border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
          }`}
        >
          {autoSendEnabled
            ? <><ToggleRight className="w-5 h-5" /> Auto-Send ON</>
            : <><ToggleLeft className="w-5 h-5" /> Auto-Send OFF</>
          }
        </button>
      </div>

      {/* Auto-send explanation */}
      <div className={`text-sm px-4 py-3 rounded-xl border ${autoSendEnabled ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
        {autoSendEnabled
          ? "✅ Auto-send is ON — review requests will be automatically scheduled when jobs are marked complete, sending the next day at 10 AM."
          : "⏸ Auto-send is OFF — no review requests will be sent automatically. Use the manual trigger below to send for specific date ranges."}
      </div>

      {/* Stats */}
      {workflows && workflows.length > 0 && <ReviewStats workflows={workflows} />}

      {/* Batch trigger */}
      <BatchTriggerPanel />

      {/* Workflow list */}
      <div>
        <h3 className="font-bold text-lg text-slate-900 mb-3">Workflow Log</h3>
        <div className="space-y-3 sm:space-y-4">
          {workflows?.map((w) => (
            <Card
              key={w.id}
              className={`!p-4 sm:!p-6 transition-all ${w.isIssueFlagged ? 'border-2 border-red-400 shadow-red-100' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h3 className="font-bold text-base sm:text-lg text-slate-900">Job #{w.jobId}</h3>
                <Badge variant={
                  w.status === 'pending' ? 'neutral' :
                  w.status === 'review_received' ? 'success' :
                  w.status === 'resolved' ? 'success' :
                  w.status === 'issue_flagged' ? 'destructive' : 'default'
                }>
                  {w.status.replace(/_/g, ' ')}
                </Badge>
                {w.isIssueFlagged && (
                  <Badge variant="destructive" className="animate-pulse flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Needs Attention
                  </Badge>
                )}
                {(w.status === 'review_received' || w.reviewCompletedAt) && (
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Google Review Received
                  </Badge>
                )}
              </div>

              <p className="text-sm text-slate-500 mb-1">Customer #{w.customerId}</p>
              {w.satisfactionSentAt && (
                <p className="text-xs text-slate-400 mb-3">
                  Sent: {new Date(w.satisfactionSentAt).toLocaleDateString()}
                  {w.satisfactionResponseAt && ` · Responded: ${new Date(w.satisfactionResponseAt).toLocaleDateString()}`}
                  {w.reviewCompletedAt && ` · Review: ${new Date(w.reviewCompletedAt).toLocaleDateString()}`}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {!w.satisfactionScore ? (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">Rate this job manually</p>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex gap-1 w-fit">
                      {[1, 2, 3, 4, 5].map(score => (
                        <button
                          key={score}
                          onClick={() => recordMutation.mutate({ id: w.id, data: { score } })}
                          className="p-1.5 text-slate-300 hover:text-amber-400 active:text-amber-500 transition-colors focus:outline-none"
                        >
                          <Star className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{w.satisfactionScore}.0</span>
                    <div className="flex text-amber-400">
                      {[1, 2, 3, 4, 5].map(score => (
                        <Star key={score} className={`w-5 h-5 ${score <= (w.satisfactionScore || 0) ? 'fill-current' : 'text-slate-200 fill-slate-200'}`} />
                      ))}
                    </div>
                  </div>
                )}

                {w.isIssueFlagged && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setSelectedWorkflow(w.id); setIsResolveModalOpen(true); }}
                    className="w-full sm:w-auto"
                  >
                    <MessageSquareText className="w-4 h-4 mr-2" /> Resolve Issue
                  </Button>
                )}
              </div>
            </Card>
          ))}

          {workflows?.length === 0 && (
            <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No review workflows yet.</p>
              <p className="text-sm mt-1">Complete a job to trigger a workflow, or use the batch trigger above.</p>
            </div>
          )}
        </div>
      </div>

      <ResolveIssueModal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        workflowId={selectedWorkflow}
      />
    </div>
  );
}

// ─── Resolve modal ────────────────────────────────────────────────────────────

function ResolveIssueModal({ isOpen, onClose, workflowId }: { isOpen: boolean, onClose: () => void, workflowId: number | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resolveMutation = useResolveIssue({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
        toast({ title: "Issue resolved successfully" });
        onClose();
      }
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!workflowId) return;
    const fd = new FormData(e.currentTarget);
    resolveMutation.mutate({ id: workflowId, data: { notes: fd.get("notes") as string } });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Resolve Customer Issue">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 sm:p-4 rounded-xl text-sm">
          Describe how the customer's issue was resolved. This will update the workflow status.
        </div>
        <div>
          <Label>Resolution Notes</Label>
          <textarea
            name="notes"
            required
            rows={4}
            className="w-full px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-primary focus:outline-none text-base resize-none"
            placeholder="e.g. Returned to property to re-clean missed spots. Customer is happy now."
          />
        </div>
        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={resolveMutation.isPending}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Resolved
          </Button>
        </div>
      </form>
    </Modal>
  );
}
