import { useState } from "react";
import { useListCanvassingSessions, useCreateCanvassingSession } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Input, Label } from "@/components/ui-components";
import { Plus, MapPin, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function CanvassingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: sessions, isLoading, error } = useListCanvassingSessions();

  if (isLoading && !sessions) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Canvassing Sessions</h2>
          <p className="text-slate-500 mt-1 text-sm">Track daily door-knocking performance</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1" /> Log Session
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {sessions?.map((session) => (
          <Card key={session.id} className="relative overflow-hidden !p-4 sm:!p-6">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <MapPin className="w-24 h-24 sm:w-32 sm:h-32" />
            </div>

            <div className="flex justify-between items-start mb-4 sm:mb-6 relative z-10 gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-lg sm:text-xl text-slate-900 truncate">{session.canvasser}</h3>
                <p className="text-slate-500 text-sm mt-0.5">{formatDate(session.sessionDate)}{session.neighborhood ? ` · ${session.neighborhood}` : ''}</p>
              </div>
              <Badge variant="success" className="shrink-0 text-xs sm:text-sm">
                {formatCurrency(session.revenueSold)} Sold
              </Badge>
            </div>

            {/* Stats — 2×2 on mobile, 4-across on sm+ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6 relative z-10">
              <div className="bg-slate-50 rounded-xl p-2.5 sm:p-3 text-center border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Doors</p>
                <p className="text-lg sm:text-xl font-display font-bold text-slate-900 mt-0.5">{session.doorsKnocked}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 sm:p-3 text-center border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Convos</p>
                <p className="text-lg sm:text-xl font-display font-bold text-slate-900 mt-0.5">{session.goodConversations}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 sm:p-3 text-center border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Quotes</p>
                <p className="text-lg sm:text-xl font-display font-bold text-slate-900 mt-0.5">{session.quotesGiven}</p>
              </div>
              <div className="bg-primary/5 rounded-xl p-2.5 sm:p-3 text-center border border-primary/20">
                <p className="text-xs font-bold text-primary uppercase">Closes</p>
                <p className="text-lg sm:text-xl font-display font-bold text-primary mt-0.5">{session.closes}</p>
              </div>
            </div>

            <div className="flex gap-3 text-sm text-slate-600 border-t border-slate-100 pt-3 sm:pt-4 relative z-10">
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {session.peopleReached} Reached</span>
              <span>·</span>
              <span>{session.bundleCount} Bundle{session.bundleCount !== 1 ? 's' : ''}</span>
            </div>
          </Card>
        ))}
        {sessions?.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400">
            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No canvassing sessions logged yet.</p>
          </div>
        )}
      </div>

      <CreateSessionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

function CreateSessionModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateCanvassingSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/canvassing/sessions"] });
        toast({ title: "Session logged successfully" });
        onClose();
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        canvasser: fd.get("canvasser") as string,
        sessionDate: fd.get("sessionDate") as string,
        neighborhood: fd.get("neighborhood") as string,
        doorsKnocked: parseInt(fd.get("doorsKnocked") as string) || 0,
        peopleReached: parseInt(fd.get("peopleReached") as string) || 0,
        goodConversations: parseInt(fd.get("goodConversations") as string) || 0,
        quotesGiven: parseInt(fd.get("quotesGiven") as string) || 0,
        closes: parseInt(fd.get("closes") as string) || 0,
        revenueSold: fd.get("revenueSold") as string || "0",
        bundleCount: parseInt(fd.get("bundleCount") as string) || 0,
        driveawayAddOnCount: parseInt(fd.get("driveawayAddOnCount") as string) || 0,
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Canvassing Session">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Canvasser Name</Label>
            <Input name="canvasser" required placeholder="Full name" />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" name="sessionDate" required defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
        </div>

        <div>
          <Label>Neighborhood / Route</Label>
          <Input name="neighborhood" placeholder="e.g. Oakridge Estates" />
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Activity Numbers</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Doors Knocked</Label><Input type="number" name="doorsKnocked" min="0" defaultValue="0" inputMode="numeric" /></div>
            <div><Label>People Reached</Label><Input type="number" name="peopleReached" min="0" defaultValue="0" inputMode="numeric" /></div>
            <div><Label>Good Convos</Label><Input type="number" name="goodConversations" min="0" defaultValue="0" inputMode="numeric" /></div>
            <div><Label>Quotes Given</Label><Input type="number" name="quotesGiven" min="0" defaultValue="0" inputMode="numeric" /></div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Sales Results</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Closes</Label><Input type="number" name="closes" min="0" defaultValue="0" inputMode="numeric" /></div>
            <div><Label>Revenue Sold ($)</Label><Input type="number" step="0.01" name="revenueSold" defaultValue="0.00" inputMode="decimal" /></div>
            <div><Label>Bundles Sold</Label><Input type="number" name="bundleCount" min="0" defaultValue="0" inputMode="numeric" /></div>
            <div><Label>Driveway Add-ons</Label><Input type="number" name="driveawayAddOnCount" min="0" defaultValue="0" inputMode="numeric" /></div>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Save Session</Button>
        </div>
      </form>
    </Modal>
  );
}
