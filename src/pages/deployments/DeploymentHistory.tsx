import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, CircleAlert, Clock3, Search, XCircle } from "lucide-react";
import PageTitle from "@/components/Typography/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { edgeConfigApi } from "@/api/edgeConfig/edgeConfigApi";

type Deployment = { id: number; name: string };
type HistoryItem = {
  id: string;
  run_id: string;
  device_id: string;
  device_type: string;
  metadata: Record<string, unknown>;
  deployment_id: number;
  deployment_name: string;
  deployment_type: string;
  deployment_version: number;
  generation: number;
  state: string;
  triggered_at: string;
  trigger_source: string;
};
type HistoryResponse = { items: HistoryItem[]; total: number; limit: number; offset: number };

const statusClass: Record<string, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-700",
  QUEUED: "border-slate-200 bg-slate-50 text-slate-700",
  DISPATCHING: "border-blue-200 bg-blue-50 text-blue-800",
  SUBMITTED: "border-violet-200 bg-violet-50 text-violet-800",
  APPLIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  SUPERSEDED: "border-amber-200 bg-amber-50 text-amber-800",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-800",
  SUCCEEDED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  ERROR: "border-red-200 bg-red-50 text-red-800",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DeploymentHistory() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [deployment, setDeployment] = useState("all");
  const definitionsQuery = useQuery({
    queryKey: ["deployment-definitions"],
    queryFn: edgeConfigApi.getDeploymentDefinitions,
  });
  const historyQuery = useQuery({
    queryKey: ["deployment-history", query, status, deployment],
    queryFn: () => edgeConfigApi.getDeploymentHistory({
      limit: 100,
      search: query.trim() || undefined,
      status: status === "all" ? undefined : status,
      deployment_id: deployment === "all" ? undefined : Number(deployment),
    }),
  });

  if (historyQuery.isLoading) return <LoadingState label="Loading deployment history..." />;
  if (historyQuery.isError) {
    return <ErrorState title="Could not load deployment history" message="Check your connection and permissions, then try again." onRetry={() => { void historyQuery.refetch(); }} />;
  }

  const history = historyQuery.data as HistoryResponse;
  const definitions = (definitionsQuery.data ?? []) as Deployment[];
  const records = history.items;
  const succeeded = records.filter((row) => ["APPLIED", "SUCCESS", "SUCCEEDED"].includes(row.state.toUpperCase())).length;
  const failed = records.filter((row) => ["FAILED", "ERROR", "SUPERSEDED"].includes(row.state.toUpperCase())).length;
  const pending = records.filter((row) => !["APPLIED", "SUCCESS", "SUCCEEDED", "FAILED", "ERROR", "SUPERSEDED"].includes(row.state.toUpperCase())).length;

  return (
    <div className="space-y-6 p-1">
      <PageTitle title="Deployment History" description="Review per-device rollout records and delivery status across deployments." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HistoryStat label="Delivery records" value={String(history.total)} caption="Matching saved history" icon={<CalendarDays className="h-4 w-4" />} tone="slate" />
        <HistoryStat label="Succeeded" value={String(succeeded)} caption="On the current page" icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
        <HistoryStat label="Failed" value={String(failed)} caption="On the current page" icon={<XCircle className="h-4 w-4" />} tone="red" />
        <HistoryStat label="Pending" value={String(pending)} caption="Awaiting device confirmation" icon={<Clock3 className="h-4 w-4" />} tone="blue" />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="space-y-4 border-b bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div><h2 className="font-semibold">Device delivery history</h2><p className="mt-1 text-sm text-muted-foreground">Search device outcomes, deployment versions, and rollout IDs.</p></div>
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px_240px]">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search device, deployment, execution…" aria-label="Search delivery history" /></div>
            <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filter by delivery status"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="QUEUED">Queued</SelectItem><SelectItem value="DISPATCHING">Dispatching</SelectItem><SelectItem value="SUBMITTED">Submitted</SelectItem><SelectItem value="APPLIED">Applied</SelectItem><SelectItem value="FAILED">Failed</SelectItem><SelectItem value="SUPERSEDED">Superseded</SelectItem></SelectContent></Select>
            <Select value={deployment} onValueChange={setDeployment}><SelectTrigger aria-label="Filter by deployment"><SelectValue placeholder="All deployments" /></SelectTrigger><SelectContent><SelectItem value="all">All deployments</SelectItem>{definitions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select>
          </div>
          {definitionsQuery.isError && <p className="text-xs text-muted-foreground">Deployment names could not be loaded; search and status filters are still available.</p>}
        </div>
        <Table>
          <TableHeader><TableRow className="bg-muted/30"><TableHead>Device</TableHead><TableHead>Deployment</TableHead><TableHead>Execution / generation</TableHead><TableHead>Result</TableHead><TableHead>Event details</TableHead><TableHead className="whitespace-nowrap">Date &amp; time</TableHead></TableRow></TableHeader>
          <TableBody>
            {records.map((row) => {
              const status = row.state.toUpperCase();
              const isPending = !["APPLIED", "SUCCESS", "SUCCEEDED", "FAILED", "ERROR", "SUPERSEDED"].includes(status);
              const eventDetail = status === "SUBMITTED"
                ? "IoT Hub accepted the twin update; waiting for the Edge Agent report."
                : status === "QUEUED"
                  ? "Dispatch is durably queued and waiting for an available worker."
                  : status === "APPLIED"
                    ? "The Edge Agent reported the requested desired-twin version."
                    : isPending
                      ? "Deployment has not yet been confirmed as applied."
                      : `Execution status: ${statusLabel(row.state)}.`;
              return (
                <TableRow key={row.id}>
                  <TableCell><div className="font-mono text-xs font-semibold">{row.device_id}</div><div className="mt-1 text-xs text-muted-foreground">{String(row.metadata.customer ?? row.metadata.site ?? row.metadata.name ?? "—")} · {row.device_type}</div></TableCell>
                  <TableCell><div className="font-medium">{row.deployment_name}</div><div className="mt-1 text-xs text-muted-foreground">{row.deployment_type === "IOTEDGE" ? "IoT Edge" : "Compose"} · v{row.deployment_version}</div></TableCell>
                  <TableCell><div className="font-mono text-xs text-blue-700">{row.run_id.slice(0, 8)}</div><div className="mt-1 text-xs text-muted-foreground">Generation {row.generation}</div></TableCell>
                  <TableCell><Badge variant="outline" className={statusClass[row.state.toUpperCase()] ?? statusClass.PENDING}>{statusLabel(row.state)}</Badge></TableCell>
                  <TableCell><div className="flex max-w-sm items-start gap-2 text-sm"><span className="mt-0.5 shrink-0">{isPending ? <CircleAlert className="h-4 w-4 text-slate-500" /> : <Clock3 className="h-4 w-4 text-blue-600" />}</span><span>{eventDetail}</span></div></TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.triggered_at)}</TableCell>
                </TableRow>
              );
            })}
            {!records.length && <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No deployment history matches the selected filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground"><span>Showing {records.length} of {history.total} events</span><span>Newest events first · API-backed history</span></div>
      </section>
      <p className="text-xs text-muted-foreground">Only IoT Edge definitions are dispatched. Compose definitions remain excluded until a separate delivery path is implemented.</p>
    </div>
  );
}

function HistoryStat({ label, value, caption, icon, tone }: { label: string; value: string; caption: string; icon: ReactNode; tone: "slate" | "emerald" | "red" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-start justify-between"><div className="text-sm text-muted-foreground">{label}</div><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span></div><div className="mt-3 text-2xl font-semibold">{value}</div><p className="mt-1 text-xs text-muted-foreground">{caption}</p></section>;
}
