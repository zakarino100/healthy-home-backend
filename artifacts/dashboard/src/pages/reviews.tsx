import { useState } from "react";
import { useListReviewWorkflows, useRecordSatisfaction, useResolveIssue } from "@workspace/api-client-react";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Label } from "@/components/ui-components";
import { Star, AlertCircle, MessageSquareText, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ReviewsPage() {
  const { data: workflows, isLoading, error } = useListReviewWorkflows();
  const [selectedWorkflow, setSelectedWorkflow] = useState<number | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);

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
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Review Workflows</h2>
        <p className="text-slate-500 mt-1 text-sm">Manage satisfaction scores and online reviews</p>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {workflows?.map((w) => (
          <Card
            key={w.id}
            className={`!p-4 sm:!p-6 transition-all ${w.isIssueFlagged ? 'border-2 border-red-400 shadow-red-100' : ''}`}
          >
            {/* Top row: job info + badges */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="font-bold text-base sm:text-lg text-slate-900">Job #{w.jobId}</h3>
              <Badge variant={
                w.status === 'pending' ? 'neutral' :
                w.status === 'review_completed' ? 'success' :
                w.status === 'issue_flagged' ? 'destructive' : 'default'
              }>
                {w.status.replace(/_/g, ' ')}
              </Badge>
              {w.isIssueFlagged && (
                <Badge variant="destructive" className="animate-pulse flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Needs Attention
                </Badge>
              )}
            </div>

            <p className="text-sm text-slate-500 mb-4">Customer #{w.customerId}</p>

            {/* Satisfaction + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {!w.satisfactionScore ? (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">Rate this job</p>
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
            <p className="text-sm mt-1">Complete a job to trigger a workflow.</p>
          </div>
        )}
      </div>

      <ResolveIssueModal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        workflowId={selectedWorkflow}
      />
    </div>
  );
}

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
