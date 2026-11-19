import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Clock3, Layers3, Plus, Rocket, Search, Target, Users } from "lucide-react";
import PageTitle from "@/components/Typography/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { edgeConfigApi } from "@/api/edgeConfig/edgeConfigApi";

type Deployment = { id: number; name: string; deployment_type: "IOTEDGE" | "COMPOSE"; version_count: number };
type DeploymentVersion = { id: number; version: number; change_note: string; created_at: string };
type Rule = { id: number; name: string; version: { id: number; version: number } };
type PreviewDevice = { device_id: string; device_type: string; metadata: Record<string, unknown>; endpoints: Record<string, unknown>[]; services: string[]; maintenance_mode?: boolean };
type RunPreview = {
  deployment_id: number;
  deployment_name: string;
  deployment_type: "IOTEDGE" | "COMPOSE";
  deployment_version_id: number;
  deployment_version: number;
  rule_id: number;
  rule_name: string;
  rule_version_id: number;
  rule_version: number;
  matching_devices: PreviewDevice[];
};
type Run = {
  id: string;
  deployment_id: number;
  deployment_name: string;
  deployment_type: "IOTEDGE" | "COMPOSE";
  deployment_version_id: number;
  deployment_version: number;
  rule_id: number;
  rule_name: string;
  rule_version_id: number;
  rule_version: number;
  triggered_at: string;
  total_devices: number;
  succeeded: number;
  failed: number;
  pending: number;
  queued: number;
  state: string;
};
type RunDetail = Run & {
  devices: {
    device_id: string;
    device_type: string;
    metadata: Record<string, unknown>;
    state: string;
    generation: number;
  }[];
};

const EMPTY_RUNS: Run[] = [];

const stateStyle: Record<string, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-700",
  QUEUED: "border-slate-200 bg-slate-50 text-slate-700",
  DISPATCHING: "border-blue-200 bg-blue-50 text-blue-800",
  SUBMITTED: "border-violet-200 bg-violet-50 text-violet-800",
  APPLIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  SUPERSEDED: "border-amber-200 bg-amber-50 text-amber-800",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-800",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  COMPLETED_WITH_ERRORS: "border-amber-200 bg-amber-50 text-amber-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function TypeBadge({ type }: { type: Deployment["deployment_type"] }) {
  return <Badge variant="outline" className={type === "IOTEDGE" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-violet-200 bg-violet-50 text-violet-800"}>{type === "IOTEDGE" ? "IoT Edge" : "Compose"}</Badge>;
}

function statusLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DeploymentExecutions() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deploymentId, setDeploymentId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const definitionsQuery = useQuery({
    queryKey: ["deployment-definitions"],
    queryFn: edgeConfigApi.getDeploymentDefinitions,
  });
  const rulesQuery = useQuery({
    queryKey: ["deployment-target-rules"],
    queryFn: edgeConfigApi.getTargetRules,
  });
  const versionsQuery = useQuery({
    queryKey: ["deployment-versions", deploymentId],
    queryFn: () => edgeConfigApi.getDeploymentVersions(Number(deploymentId)),
    enabled: Boolean(deploymentId),
  });
  const runsQuery = useQuery({
    queryKey: ["deployment-runs"],
    queryFn: () => edgeConfigApi.getDeploymentRuns(100),
    refetchInterval: (query) => query.state.data?.items?.some((run: Run) => run.pending > 0 || run.queued > 0) ? 5000 : false,
  });
  const detailQuery = useQuery({
    queryKey: ["deployment-run", selectedId],
    queryFn: () => edgeConfigApi.getDeploymentRun(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: (query) => query.state.data?.pending > 0 || query.state.data?.queued > 0 ? 5000 : false,
  });
  const retryMutation = useMutation({
    mutationFn: (deviceId: string) => {
      if (!selectedId) throw new Error("Select an execution before retrying a device");
      return edgeConfigApi.retryDeploymentDispatch(selectedId, deviceId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deployment-run", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["deployment-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["deployment-history"] }),
      ]);
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => edgeConfigApi.previewDeploymentRun({
      deployment_version_id: Number(versionId),
      rule_id: Number(ruleId),
    }),
    onSuccess: (data) => {
      setPreview(data as RunPreview);
      setIdempotencyKey(crypto.randomUUID());
    },
  });
  const createMutation = useMutation({
    mutationFn: () => {
      if (!preview || !idempotencyKey) throw new Error("Preview the rollout before confirming it");
      return edgeConfigApi.createDeploymentRun({
        deployment_version_id: preview.deployment_version_id,
        rule_version_id: preview.rule_version_id,
        idempotency_key: idempotencyKey,
      });
    },
    onSuccess: async (data) => {
      const createdRun = data as Run;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deployment-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["deployment-history"] }),
      ]);
      setSelectedId(createdRun.id);
      closeDialog();
    },
  });

  const definitions = (definitionsQuery.data ?? []) as Deployment[];
  const rules = (rulesQuery.data ?? []) as Rule[];
  const versions = (versionsQuery.data ?? []) as DeploymentVersion[];
  const runsResponse = runsQuery.data as { items: Run[]; total: number } | undefined;
  const runs = runsResponse?.items ?? EMPTY_RUNS;
  const detail = detailQuery.data as RunDetail | undefined;
  const visibleRuns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return runs.filter((run) =>
      !query || [run.id, run.deployment_name, run.rule_name, statusLabel(run.state)]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [runs, search]);

  function resetPreview() {
    setPreview(null);
    setIdempotencyKey(null);
    previewMutation.reset();
    createMutation.reset();
  }

  function closeDialog() {
    setDialogOpen(false);
    setDeploymentId("");
    setVersionId("");
    setRuleId("");
    resetPreview();
  }

  function openDialog() {
    setDeploymentId("");
    setVersionId("");
    setRuleId("");
    resetPreview();
    setDialogOpen(true);
  }

  if (runsQuery.isLoading) return <LoadingState label="Loading deployment executions..." />;
  if (runsQuery.isError) {
    return <ErrorState title="Could not load deployment executions" message="Check your connection and permissions, then try again." onRetry={() => { void runsQuery.refetch(); }} />;
  }

  if (selectedId) {
    if (detailQuery.isLoading) return <LoadingState label="Loading execution details..." />;
    if (detailQuery.isError || !detail) {
      return <ErrorState title="Could not load execution details" message="The execution may have been removed or you may no longer have access to its devices." onRetry={() => { void detailQuery.refetch(); }} />;
    }
    return (
      <div className="space-y-6 p-1">
        <Button variant="ghost" onClick={() => setSelectedId(null)}><ArrowLeft className="mr-2 h-4 w-4" />All executions</Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageTitle title={`${detail.deployment_name} · v${detail.deployment_version}`} description={`${detail.id} · Started ${formatDate(detail.triggered_at)}`} />
          <Badge variant="outline" className={stateStyle[detail.state] ?? stateStyle.PENDING}>{statusLabel(detail.state)}</Badge>
        </div>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Target rule snapshot</p>
              <div className="mt-1 flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-blue-600" />{detail.rule_name} · v{detail.rule_version}</div>
            </div>
            <TypeBadge type={detail.deployment_type} />
          </div>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-sm"><span>IoT Edge deployment progress</span><span className="font-medium">{detail.pending + detail.queued} awaiting application of {detail.total_devices} devices</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-slate-400" style={{ width: `${detail.total_devices ? Math.round(((detail.pending + detail.queued) / detail.total_devices) * 100) : 0}%` }} /></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={stateStyle.APPLIED}>{detail.succeeded} applied</Badge>
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">{detail.failed} failed</Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{detail.pending} pending</Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{detail.queued} queued</Badge>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Submitted means IoT Hub accepted the twin update; a device is counted as applied only after the Edge Agent reports that desired version.</p>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Target devices</h2>
            <p className="mt-1 text-sm text-muted-foreground">Device membership and delivery status are snapshotted for this run.</p>
          </div>
          <Table>
            <TableHeader><TableRow className="bg-muted/30"><TableHead>Device</TableHead><TableHead>Customer / site</TableHead><TableHead>Device type</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {detail.devices.map((device) => (
                <TableRow key={device.device_id}>
                  <TableCell className="font-mono text-xs font-medium">{device.device_id}</TableCell>
                  <TableCell>{String(device.metadata.customer ?? device.metadata.site ?? device.metadata.name ?? "—")}</TableCell>
                  <TableCell>{device.device_type}</TableCell>
                  <TableCell><Badge variant="outline" className={stateStyle[device.state] ?? stateStyle.PENDING}>{statusLabel(device.state)}</Badge></TableCell>
                  <TableCell>{device.state === "FAILED" && <Button size="sm" variant="outline" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate(device.device_id)}>{retryMutation.isPending && retryMutation.variables === device.device_id ? "Queueing..." : "Retry"}</Button>}</TableCell>
                </TableRow>
              ))}
              {!detail.devices.length && <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">No visible devices are attached to this execution.</TableCell></TableRow>}
            </TableBody>
          </Table>
          {retryMutation.isError && <p className="border-t px-5 py-3 text-sm text-destructive">Could not queue the retry. The assignment may have been superseded; refresh the execution and try again.</p>}
        </section>
      </div>
    );
  }

  const activeRuns = runs.filter((run) => ["PENDING", "IN_PROGRESS"].includes(run.state)).length;
  const latestTargeted = runs[0]?.total_devices ?? 0;

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Deployment Executions" description="Review an IoT Edge deployment and target rule, then dispatch the selected version to matching devices." />
        <Button onClick={openDialog}><Plus className="mr-2 h-4 w-4" />New execution</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total executions" value={String(runsResponse?.total ?? 0)} caption="Saved rollout records" icon={<Rocket className="h-4 w-4" />} tone="blue" />
        <StatCard label="Active rollouts" value={String(activeRuns)} caption="Queued, submitting, or awaiting device reports" icon={<Clock3 className="h-4 w-4" />} tone="violet" />
        <StatCard label="Devices targeted" value={String(latestTargeted)} caption="In the latest visible rollout" icon={<Users className="h-4 w-4" />} tone="emerald" />
        <StatCard label="IoT Edge definitions" value={String(definitions.filter((deployment) => deployment.deployment_type === "IOTEDGE").length)} caption="Compose definitions are not executable" icon={<Layers3 className="h-4 w-4" />} tone="amber" />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div><h2 className="font-semibold">Recent executions</h2><p className="mt-1 text-sm text-muted-foreground">Select an execution to inspect its snapshotted device list.</p></div>
          <div className="relative w-full sm:w-72"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search deployments or rules" aria-label="Search executions" /></div>
        </div>
        <Table>
          <TableHeader><TableRow className="bg-muted/30"><TableHead>Execution</TableHead><TableHead>Deployment</TableHead><TableHead>Target rule</TableHead><TableHead>Applied</TableHead><TableHead>Failed</TableHead><TableHead>Pending</TableHead><TableHead>Queued</TableHead><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
          <TableBody>
            {visibleRuns.map((run) => (
              <TableRow key={run.id}>
                <TableCell><button className="font-mono text-xs font-semibold text-blue-700 hover:underline" onClick={() => setSelectedId(run.id)}>{run.id.slice(0, 8)}</button></TableCell>
                <TableCell><div className="font-medium">{run.deployment_name}</div><div className="mt-1 flex items-center gap-2"><TypeBadge type={run.deployment_type} /><span className="text-xs text-muted-foreground">v{run.deployment_version}</span></div></TableCell>
                <TableCell>{run.rule_name}<div className="text-xs text-muted-foreground">v{run.rule_version}</div></TableCell>
                <TableCell><span className="font-medium text-emerald-700">{run.succeeded}</span></TableCell>
                <TableCell><span className="font-medium text-red-700">{run.failed}</span></TableCell>
                <TableCell><span className="font-medium text-blue-700">{run.pending}</span></TableCell>
                <TableCell><span className="font-medium text-slate-600">{run.queued}</span></TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(run.triggered_at)}</TableCell>
                <TableCell><Badge variant="outline" className={stateStyle[run.state] ?? stateStyle.PENDING}>{statusLabel(run.state)}</Badge></TableCell>
                <TableCell><Button variant="ghost" size="icon" aria-label={`View execution ${run.id}`} onClick={() => setSelectedId(run.id)}><ArrowUpRight className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
            {!visibleRuns.length && <TableRow><TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">{search ? "No executions match that search." : "No deployment executions have been created yet."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Start a deployment execution</DialogTitle>
            <DialogDescription>Choose an immutable deployment version and target rule. Review the matching devices before confirming.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {(definitionsQuery.isError || rulesQuery.isError) && <p className="text-sm text-destructive">Could not load deployment definitions or target rules. Close and reopen this dialog to retry.</p>}
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm font-medium">Deployment
                <select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={deploymentId} onChange={(event) => { setDeploymentId(event.target.value); setVersionId(""); resetPreview(); }}>
                  <option value="">Select deployment</option>
                  {definitions.filter((deployment) => deployment.deployment_type === "IOTEDGE" && deployment.version_count > 0).map((deployment) => <option key={deployment.id} value={deployment.id}>{deployment.name}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">Version
                <select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={versionId} onChange={(event) => { setVersionId(event.target.value); resetPreview(); }} disabled={!deploymentId || versionsQuery.isLoading}>
                  <option value="">{versionsQuery.isLoading ? "Loading versions..." : "Select version"}</option>
                  {versions.map((version) => <option key={version.id} value={version.id}>v{version.version} · {version.change_note}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">Target rule
                <select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={ruleId} onChange={(event) => { setRuleId(event.target.value); resetPreview(); }}>
                  <option value="">Select target rule</option>
                  {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} · v{rule.version.version}</option>)}
                </select>
              </label>
            </div>

            {previewMutation.isPending && <LoadingState label="Calculating matching devices..." />}
            {previewMutation.isError && <p className="text-sm text-destructive">Could not preview the target devices. Check permissions and try again.</p>}
            {preview && (
              <section className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="font-semibold">Review target devices</h3><p className="text-sm text-muted-foreground">{preview.deployment_name} v{preview.deployment_version} · {preview.rule_name} v{preview.rule_version}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{preview.matching_devices.filter((device) => !device.maintenance_mode).length} eligible</Badge>
                    {!!preview.matching_devices.filter((device) => device.maintenance_mode).length && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                        {preview.matching_devices.filter((device) => device.maintenance_mode).length} skipped · maintenance mode
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Maintenance-mode devices are skipped and will not be included in this execution. Confirming queues durable IoT Hub twin updates for eligible devices; they remain pending until the Edge Agent reports the selected desired version.</p>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Device</TableHead><TableHead>Customer / site</TableHead><TableHead>Device type</TableHead><TableHead>Services</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {preview.matching_devices.map((device) => <TableRow key={device.device_id} className={device.maintenance_mode ? "bg-amber-50/60" : undefined}><TableCell className="font-mono text-xs">{device.device_id}</TableCell><TableCell>{String(device.metadata.customer ?? device.metadata.site ?? device.metadata.name ?? "—")}</TableCell><TableCell>{device.device_type}</TableCell><TableCell>{device.services.join(", ") || "—"}</TableCell><TableCell className="text-xs">{device.maintenance_mode ? <span className="font-medium text-amber-800">Skipped · maintenance mode</span> : <span className="text-emerald-700">Eligible</span>}</TableCell></TableRow>)}
                      {!preview.matching_devices.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No visible devices match this rule. Choose a rule with matching devices to continue.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
                {preview.matching_devices.length > 0 && !preview.matching_devices.some((device) => !device.maintenance_mode) && (
                  <p className="text-sm font-medium text-amber-800">All matching devices are in maintenance mode. Turn maintenance mode off for at least one device before creating an execution.</p>
                )}
              </section>
            )}
            {createMutation.isError && <p className="text-sm text-destructive">Could not record the rollout. Your preview is preserved; retry or cancel.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            {!preview ? (
              <Button disabled={!versionId || !ruleId || previewMutation.isPending} onClick={() => previewMutation.mutate()}>Preview devices</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { resetPreview(); }}>Change selection</Button>
                <Button disabled={!preview.matching_devices.some((device) => !device.maintenance_mode) || createMutation.isPending} onClick={() => createMutation.mutate()}>
                  {createMutation.isPending ? "Recording rollout..." : "Confirm rollout"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-xs text-muted-foreground">Only IoT Edge definitions are executable. Compose definitions remain available for management but are skipped by the rollout flow.</p>
    </div>
  );
}

function StatCard({ label, value, caption, icon, tone }: { label: string; value: string; caption: string; icon: ReactNode; tone: "blue" | "violet" | "emerald" | "amber" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-start justify-between"><div className="text-sm text-muted-foreground">{label}</div><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span></div><div className="mt-3 text-2xl font-semibold">{value}</div><p className="mt-1 text-xs text-muted-foreground">{caption}</p></section>;
}
