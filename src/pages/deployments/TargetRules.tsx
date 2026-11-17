import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CirclePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import PageTitle from "@/components/Typography/PageTitle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { edgeConfigApi } from "@/api/edgeConfig/edgeConfigApi";

type Operator = "AND" | "OR";
type Condition = { key: string; values: string[]; operator: Operator };
type Device = { device_id: string; device_type: string; metadata: Record<string, unknown>; endpoints: Record<string, unknown>[]; services: string[] };
type Rule = {
  id: number;
  name: string;
  updated_at: string;
  matching_devices: number;
  version: { version: number; expression: Condition[]; excluded_device_ids: string[] };
  used_deployment?: string | null;
  deployment_count: number;
  is_synced?: boolean | null;
};
type RuleValues = { values: Record<string, string[]>; devices: Device[] };

function matchesCondition(device: Device, condition: Condition) {
  if (!condition.values.length) return false;
  const [scope, ...fieldParts] = condition.key.split(".");
  const field = fieldParts.join(".") || scope;
  const actualScope = fieldParts.length ? scope : "device";
  if (actualScope === "device") {
    const value = field === "device_type" ? device.device_type : device.metadata[field];
    return value !== undefined && value !== null && condition.values.includes(String(value));
  }
  if (actualScope === "endpoint") {
    return device.endpoints.some((endpoint) => endpoint[field] != null && condition.values.includes(String(endpoint[field])));
  }
  return actualScope === "service" && field === "type" && condition.values.some((value) => device.services.includes(value));
}

function matchesRule(device: Device, conditions: Condition[]) {
  const active = conditions.filter((condition) => condition.values.length);
  if (!active.length) return true;
  const groups: Condition[][] = [[]];
  active.forEach((condition, index) => {
    if (index && condition.operator === "OR") groups.push([]);
    groups[groups.length - 1].push(condition);
  });
  return groups.some((group) => group.every((condition) => matchesCondition(device, condition)));
}

const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const fieldLabel = (key: string) => ({
  "device.device_type": "Device type",
  "device.type": "Device metadata type",
  "endpoint.type": "Endpoint type",
  "endpoint.vendor": "Endpoint vendor",
  "service.type": "Service type",
}[key] ?? key);

export default function TargetRules() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const rulesQuery = useQuery({
    queryKey: ["deployment-target-rules"],
    queryFn: edgeConfigApi.getTargetRules,
  });
  const valuesQuery = useQuery({
    queryKey: ["deployment-target-rule-values"],
    queryFn: edgeConfigApi.getTargetRuleValues,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deployment-target-rules"] }),
      queryClient.invalidateQueries({ queryKey: ["deployment-target-rule-values"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        expression: conditions.filter((condition) => condition.values.length),
        excluded_device_ids: excludedIds,
      };
      return editing
        ? edgeConfigApi.updateTargetRule(editing.id, payload)
        : edgeConfigApi.createTargetRule(payload);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(editing ? "Target rule updated" : "Target rule created");
      closeDialog();
    },
    onError: () => toast.error("Could not save the target rule"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => edgeConfigApi.deleteTargetRule(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Target rule deleted");
      setDeletingId(null);
    },
    onError: () => toast.error("Could not delete the target rule"),
  });

  const valuesData = valuesQuery.data as RuleValues | undefined;
  const matchingDevices = useMemo(() => {
    if (!valuesData) return [];
    return valuesData.devices.filter((device) => matchesRule(device, conditions));
  }, [conditions, valuesData]);
  const filteredDevices = useMemo(() => {
    const search = deviceSearch.trim().toLowerCase();
    return search ? matchingDevices.filter((device) => device.device_id.toLowerCase().includes(search)) : matchingDevices;
  }, [deviceSearch, matchingDevices]);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setName("");
    setConditions([]);
    setExcludedIds([]);
    setDeviceSearch("");
  };
  const openNew = () => {
    setEditing(null);
    setName("");
    setConditions([]);
    setExcludedIds([]);
    setDeviceSearch("");
    setDialogOpen(true);
  };
  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setName(rule.name);
    setConditions(rule.version.expression.map((condition) => ({ ...condition, values: [...condition.values] })));
    setExcludedIds([...rule.version.excluded_device_ids]);
    setDeviceSearch("");
    setDialogOpen(true);
  };
  const setCondition = (index: number, patch: Partial<Condition>) => {
    setConditions((current) => current.map((condition, position) => position === index ? { ...condition, ...patch } : condition));
  };
  const toggleExcluded = (deviceId: string) => {
    setExcludedIds((current) => current.includes(deviceId)
      ? current.filter((value) => value !== deviceId)
      : [...current, deviceId]);
  };

  if (rulesQuery.isLoading || valuesQuery.isLoading) return <LoadingState label="Loading target rules..." />;
  if (rulesQuery.isError || valuesQuery.isError) {
    const failedQuery = rulesQuery.isError ? rulesQuery : valuesQuery;
    return <ErrorState title="Could not load target rules" message="Check your connection and permissions, then try again." onRetry={() => { void failedQuery.refetch(); }} />;
  }

  const rules = (rulesQuery.data ?? []) as Rule[];
  const allValues = valuesData?.values ?? {};

  return (
    <div className="space-y-6 p-1">
      <PageTitle
        title="Target Rules"
        description="Build reusable device groups from current device, endpoint, and service values."
      />
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div>
            <h2 className="font-semibold">Reusable target rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">Rules are independent of deployment definitions and can be reused.</p>
          </div>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />New target rule</Button>
        </div>
        {rules.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Matching devices</TableHead>
                <TableHead>Latest version</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="font-semibold">{rule.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{rule.version.expression.length || "All"} condition{rule.version.expression.length === 1 ? "" : "s"}</div>
                  </TableCell>
                  <TableCell><span className="font-semibold">{rule.matching_devices}</span> <span className="text-muted-foreground">devices</span></TableCell>
                  <TableCell><span className="rounded bg-muted px-2 py-1 text-xs font-medium">v{rule.version.version}</span></TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateLabel(rule.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${rule.name}`} onClick={() => openEdit(rule)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${rule.name}`} disabled={deleteMutation.isPending} onClick={() => setDeletingId(rule.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CirclePlus className="h-7 w-7" /></span>
            <h3 className="font-semibold">No target rules yet</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">Create a reusable rule to describe which devices are included in a target group.</p>
            <Button className="mt-5" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Create your first rule</Button>
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit target rule" : "Create target rule"}</DialogTitle>
            <DialogDescription>Combine existing device data with AND/OR conditions, then optionally exclude individual devices.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <Label htmlFor="rule-name">Rule name</Label>
              <Input id="rule-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. North region gateways" maxLength={200} />
            </div>

            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium">Conditions</h3>
                  <p className="text-xs text-muted-foreground">Choose only values currently present in your fleet. Endpoint conditions match when any endpoint on a device has a selected value.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setConditions((current) => [...current, { key: Object.keys(allValues)[0] ?? "", values: [], operator: "AND" }])}>
                  <Plus className="mr-2 h-4 w-4" />Add condition
                </Button>
              </div>
              {conditions.length ? (
                <div className="space-y-3">
                  {conditions.map((condition, index) => (
                    <div key={`${index}-${condition.key}`} className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-[100px_minmax(130px,1fr)_minmax(160px,1.3fr)_auto] sm:items-start">
                      <div className="space-y-1">
                        <Label className="text-xs">{index === 0 ? "Match" : "Combine with"}</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          aria-label={`Condition ${index + 1} operator`}
                          value={condition.operator}
                          onChange={(event) => setCondition(index, { operator: event.target.value as Operator })}
                          disabled={index === 0}
                        >
                          <option value="AND">AND</option><option value="OR">OR</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Field</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          aria-label={`Condition ${index + 1} field`}
                          value={condition.key}
                          onChange={(event) => setCondition(index, { key: event.target.value, values: [] })}
                        >
                          {Object.keys(allValues).map((key) => <option key={key} value={key}>{fieldLabel(key)}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Values</Label>
                        <select
                          multiple
                          size={Math.min(Math.max(allValues[condition.key]?.length ?? 0, 2), 5)}
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          aria-label={`Condition ${index + 1} values`}
                          value={condition.values}
                          onChange={(event) => setCondition(index, { values: Array.from(event.target.selectedOptions, (option) => option.value) })}
                        >
                          {(allValues[condition.key] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                        <p className="text-[11px] text-muted-foreground">Use Ctrl/Cmd to select multiple values.</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="mt-5" aria-label={`Remove condition ${index + 1}`} onClick={() => setConditions((current) => current.filter((_, position) => position !== index))}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed py-5 text-center text-sm text-muted-foreground">No conditions means this rule matches every visible device.</div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-medium">Matching devices <span className="text-muted-foreground">({matchingDevices.length})</span></h3>
                  <p className="text-xs text-muted-foreground">Uncheck devices to exclude them from this rule.</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder="Filter device IDs" aria-label="Filter matching devices" />
                </div>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border">
                {filteredDevices.length ? (
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow><TableHead className="w-12">Include</TableHead><TableHead>Device</TableHead><TableHead>Location</TableHead><TableHead>Type</TableHead><TableHead>Services</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDevices.map((device) => {
                        const city = device.metadata.city;
                        const country = device.metadata.country_code;
                        const location = [city, country].filter(Boolean).join(", ");
                        const type = device.device_type;
                        const included = !excludedIds.includes(device.device_id);
                        return (
                          <TableRow key={device.device_id} className={!included ? "opacity-50" : undefined}>
                            <TableCell><input type="checkbox" aria-label={`Include device ${device.device_id}`} checked={included} onChange={() => toggleExcluded(device.device_id)} /></TableCell>
                            <TableCell className="font-mono text-xs">{device.device_id}</TableCell>
                            <TableCell className="text-sm">{location || "—"}</TableCell>
                            <TableCell className="text-sm">{type ? String(type) : "—"}</TableCell>
                            <TableCell className="text-sm">{device.services.join(", ") || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : <div className="p-6 text-center text-sm text-muted-foreground">{matchingDevices.length ? "No devices match this filter." : "No devices match the current conditions."}</div>}
              </div>
              {excludedIds.length > 0 && <p className="text-xs text-muted-foreground">{excludedIds.length} device{excludedIds.length === 1 ? "" : "s"} excluded.</p>}
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete target rule?</DialogTitle><DialogDescription>This removes the rule from future use. Existing deployment history remains unchanged.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deletingId !== null && deleteMutation.mutate(deletingId)}>
              {deleteMutation.isPending ? "Deleting..." : "Delete rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
