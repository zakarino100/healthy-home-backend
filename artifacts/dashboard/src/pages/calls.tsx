import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Badge, Button, Input, Select } from "@/components/ui-components";
import { Phone, RefreshCw, ChevronDown, ChevronUp, Clock, ArrowRight } from "lucide-react";

type CallLog = {
  id: number;
  providerCallId: string | null;
  callerPhone: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  category: string | null;
  transferStatus: string | null;
  answeredByOwner: boolean;
  createdAt: string;
};

type CallDetail = CallLog & {
  transcript: string | null;
  rawPayload: unknown;
};

const TRANSFER_STATUS_LABELS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "default" }> = {
  transferred: { label: "Transferred", variant: "success" },
  not_attempted: { label: "Not Attempted", variant: "default" },
  no_answer: { label: "No Answer", variant: "warning" },
  voicemail: { label: "Voicemail", variant: "warning" },
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "Unknown";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    const n = cleaned.slice(1);
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export default function CallsPage() {
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const params = new URLSearchParams();
  params.set("page", String(page));
  if (dateFilter) params.set("date", dateFilter);
  if (statusFilter) params.set("transferStatus", statusFilter);

  const { data, isLoading, error, refetch } = useQuery<{ page: number; limit: number; results: CallLog[] }>({
    queryKey: ["/api/phone/calls", page, dateFilter, statusFilter, refreshKey],
    queryFn: async () => {
      const r = await fetch(`/api/phone/calls?${params.toString()}`);
      if (!r.ok) throw new Error("Failed to fetch call logs");
      return r.json();
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery<CallDetail>({
    queryKey: ["/api/phone/calls", expandedId],
    queryFn: async () => {
      const r = await fetch(`/api/phone/calls/${expandedId}`);
      if (!r.ok) throw new Error("Failed to fetch call detail");
      return r.json();
    },
    enabled: expandedId !== null,
  });

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    refetch();
  };

  const handleFilter = () => {
    setPage(1);
    setRefreshKey(k => k + 1);
  };

  const calls = data?.results ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Call Log</h2>
          <p className="text-slate-500 mt-1 text-sm">Inbound calls handled by the AI receptionist</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} className="w-fit">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="!p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Date</label>
            <Input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Transfer Status</label>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-44">
              <option value="">All</option>
              <option value="transferred">Transferred</option>
              <option value="not_attempted">Not Attempted</option>
              <option value="no_answer">No Answer</option>
              <option value="voicemail">Voicemail</option>
            </Select>
          </div>
          <Button onClick={handleFilter}>Apply</Button>
          {(dateFilter || statusFilter) && (
            <Button variant="ghost" onClick={() => { setDateFilter(""); setStatusFilter(""); setPage(1); setRefreshKey(k => k + 1); }}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      {isLoading && <PageLoader />}
      {error && <ErrorState error={error} />}

      {!isLoading && !error && (
        <div className="space-y-2">
          {calls.length === 0 && (
            <div className="py-20 text-center text-slate-400">
              <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No calls yet</p>
              <p className="text-sm mt-1">Calls will appear here after the Vapi phone number is configured.</p>
            </div>
          )}

          {calls.map(call => {
            const isExpanded = expandedId === call.id;
            const statusInfo = TRANSFER_STATUS_LABELS[call.transferStatus ?? ""] ?? { label: call.transferStatus ?? "Unknown", variant: "default" as const };

            return (
              <Card
                key={call.id}
                className="!p-0 overflow-hidden"
              >
                {/* Row header */}
                <button
                  className="w-full text-left p-4 sm:p-5 flex items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : call.id)}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    <Phone className="w-4 h-4 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="font-bold text-slate-900 text-sm">{formatPhone(call.callerPhone)}</span>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {call.startedAt ? new Date(call.startedAt).toLocaleString() : formatDate(call.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" />
                        {formatDuration(call.durationSeconds)}
                      </span>
                    </div>
                    {call.summary && (
                      <p className="text-xs text-slate-600 mt-1.5 line-clamp-1">{call.summary}</p>
                    )}
                  </div>

                  <div className="shrink-0 text-slate-400 mt-0.5 sm:mt-0">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 sm:px-5 py-4 space-y-4 bg-slate-50/50">
                    {detailLoading && <p className="text-sm text-slate-400">Loading detail…</p>}

                    {detail && detail.id === call.id && (
                      <>
                        {/* Summary */}
                        {detail.summary && (
                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">AI Summary</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{detail.summary}</p>
                          </div>
                        )}

                        {/* Transcript */}
                        {detail.transcript ? (
                          <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Transcript</p>
                            <pre className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans bg-white border border-slate-200 rounded-xl p-3 max-h-64 overflow-y-auto">
                              {detail.transcript}
                            </pre>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 italic">No transcript available</p>
                        )}

                        {/* Meta */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block">Call ID</span>
                            <span className="text-slate-600 font-mono">{detail.providerCallId ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Started</span>
                            <span className="text-slate-600">{detail.startedAt ? new Date(detail.startedAt).toLocaleTimeString() : "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Ended</span>
                            <span className="text-slate-600">{detail.endedAt ? new Date(detail.endedAt).toLocaleTimeString() : "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Duration</span>
                            <span className="text-slate-600">{formatDuration(detail.durationSeconds)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Owner Answered</span>
                            <span className={detail.answeredByOwner ? "text-emerald-600 font-bold" : "text-slate-600"}>
                              {detail.answeredByOwner ? "Yes" : "No"}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Pagination */}
          {calls.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-500">Page {page}</span>
              <Button
                variant="outline"
                onClick={() => setPage(p => p + 1)}
                disabled={calls.length < 20}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
