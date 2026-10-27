import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DeviceLink, ExpressionChips, MockPage, PlanLabel, Section } from "./components"
import { matches, plan, useMockStore, type Expression, type ExpressionCondition } from "./mockData"
import { MockRuleDevicesTable } from "./MockRuleDevicesTable"

const keys = ["device.city", "device.line", "endpoint.type", "endpoint.vendor"]

interface Row {
  key: string
  values: string[]
  operator: "AND" | "OR"
}

const toRows = (expression: Expression): Row[] => expression.map(({ key, values, operator }) => ({ key, values, operator }))
const toExpression = (rows: Row[]): Expression => rows
  .filter((row) => row.values.length)
  .map(({ key, values, operator }): ExpressionCondition => ({ key, values, operator }))

export default function MockRuleEditor() {
  const { deploymentId, ruleId } = useParams()
  const navigate = useNavigate()
  const store = useMockStore()
  const deployment = store.deployments.find((d) => d.id === deploymentId)
  const existing = store.rules.find((r) => r.id === ruleId)

  const [version, setVersion] = useState(String(existing?.version ?? deployment?.versions[0]?.version ?? ""))
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)
  const [rows, setRows] = useState<Row[]>(existing ? toRows(existing.expression) : [])
  const [excludedDeviceIds, setExcludedDeviceIds] = useState<string[]>(existing?.excluded_device_ids ?? [])
  const expression = useMemo(() => toExpression(rows), [rows])
  const matchingDeviceIds = useMemo(
    () => new Set(store.devices.filter((device) => matches(device, expression)).map((device) => device.device_id)),
    [store.devices, expression],
  )
  const valuesFor = (key: string) => {
    if (key === "device.city" || key === "device.line") {
      const field = key.slice("device.".length)
      return [...new Set(store.devices.map((device) => device.meta[field]).filter((value): value is string => Boolean(value)))].sort()
    }
    if (key === "endpoint.type" || key === "endpoint.vendor") {
      const field = key.slice("endpoint.".length) as "type" | "vendor"
      return [...new Set(store.devices.flatMap((device) => device.endpoints.map((endpoint) => endpoint[field])))].sort()
    }
    return []
  }
  const selectedDeviceIds = useMemo(
    () => new Set([...matchingDeviceIds].filter((id) => !excludedDeviceIds.includes(id))),
    [matchingDeviceIds, excludedDeviceIds],
  )

  // Preview = what reconciliation would do if this rule were saved now (POST /target-rules/preview).
  const preview = useMemo(() => {
    if (!deployment) return []
    const draft = {
      id: existing?.id ?? "this-rule",
      deployment_id: deployment.id,
      version: Number(version),
      expression,
      excluded_device_ids: excludedDeviceIds,
      enabled,
      updated_at: new Date().toISOString(),
    }
    const rules = [...store.rules.filter((r) => r.id !== draft.id), draft]
    return plan({ devices: store.devices, rules, deviceDeployments: store.deviceDeployments }).filter(
      (p) => selectedDeviceIds.has(p.device_id) || p.before?.rule_id === draft.id,
    )
  }, [deployment, existing, version, expression, excludedDeviceIds, selectedDeviceIds, enabled, store.rules, store.devices, store.deviceDeployments])

  if (!deployment) return <MockPage title="Not found">Unknown deployment.</MockPage>

  const nameOf = (id: string) => store.deployments.find((d) => d.id === id)?.name ?? id
  const changing = preview.filter((p) => !["UNCHANGED", "SKIPPED_MANUAL"].includes(p.kind)).length

  const save = () => {
    store.saveRule({
      id: existing?.id,
      deployment_id: deployment.id,
      version: Number(version),
      expression,
      excluded_device_ids: excludedDeviceIds,
      enabled,
    })
    navigate(`/mockups/deployments/${deployment.id}`)
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <MockPage
      title={existing ? `Edit ${existing.id}` : "New target rule"}
      subtitle={`${deployment.name}: choose a version, matching devices, and exclusions. Saving the rule does not deploy; trigger it from the deployment page.`}
      crumbs={[
        { label: "Deployments", to: "/mockups/deployments" },
        { label: deployment.name, to: `/mockups/deployments/${deployment.id}` },
      ]}
      actions={
        <Button size="sm" variant="secondary" disabled={!version} onClick={save}>
          <Save className="h-4 w-4 mr-1" />
          Save rule{changing ? ` (changes ${changing} device${changing === 1 ? "" : "s"})` : ""}
        </Button>
      }
    >
      <Section title="Version" description="Rolling back = pointing the rule at an older version.">
        <div className="flex items-center gap-6">
          <Select value={version} onValueChange={setVersion}>
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {deployment.versions.map((v) => (
                <SelectItem key={v.version} value={String(v.version)}>
                  v{v.version} – {v.change_note}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Enabled
          </Label>
        </div>
      </Section>

      <Section
        title="Devices where"
        description="No conditions means all devices. Join conditions with AND or OR; AND is evaluated before OR. Comma-separated values within a condition are alternatives. Devices matching the rule are shown below."
        actions={
          <Button size="sm" variant="outline" onClick={() => setRows([...rows, { key: "device.line", values: [], operator: "AND" }])}>
            <Plus className="h-4 w-4 mr-1" />
            Add condition
          </Button>
        }
      >
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 ? (
                <Select value={r.operator} onValueChange={(operator: "AND" | "OR") => setRow(i, { operator })}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND</SelectItem>
                    <SelectItem value="OR">OR</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className="w-20 text-center text-xs text-muted-foreground">where</span>
              )}
              <Select value={r.key} onValueChange={(key) => setRow(i, { key, values: [] })}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {keys.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">is one of</span>
              <details className="relative min-w-48 rounded-md border bg-white px-3 py-2 text-sm">
                <summary className="cursor-pointer list-none">
                  {r.values.length ? r.values.join(", ") : "Choose existing values"}
                </summary>
                <fieldset className="absolute left-0 top-full z-10 mt-1 max-h-56 min-w-full overflow-auto rounded-md border bg-white p-2 shadow-md">
                  <legend className="sr-only">Existing values for {r.key}</legend>
                  {valuesFor(r.key).length ? (
                    valuesFor(r.key).map((value) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-1 py-1">
                        <input
                          type="checkbox"
                          checked={r.values.includes(value)}
                          onChange={(event) =>
                            setRow(i, {
                              values: event.target.checked
                                ? [...r.values, value]
                                : r.values.filter((selected) => selected !== value),
                            })
                          }
                        />
                        {value}
                      </label>
                    ))
                  ) : (
                    <p className="px-1 py-1 text-xs text-muted-foreground">No existing values for this field.</p>
                  )}
                </fieldset>
              </details>
              <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="pt-2 text-xs text-muted-foreground">
            Stored as <ExpressionChips expression={expression} />
          </div>
        </div>
        {!rows.length && <p className="mb-3 text-xs text-muted-foreground">No conditions are set, so this rule matches every device.</p>}
        <div className="mt-4">
          <MockRuleDevicesTable
            devices={store.devices.filter((device) => matchingDeviceIds.has(device.device_id))}
            deviceDeployments={store.deviceDeployments}
            deployments={store.deployments}
            executions={store.executions}
            matchingDeviceIds={matchingDeviceIds}
            selectedDeviceIds={selectedDeviceIds}
            onToggle={(deviceId, selected) =>
              setExcludedDeviceIds((current) =>
                selected ? current.filter((id) => id !== deviceId) : [...current, deviceId],
              )
            }
          />
        </div>
      </Section>

      <Section title="Preview" description="What would change when you click Deploy. Saving this rule alone does not deploy.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Runs now</TableHead>
              <TableHead>After saving</TableHead>
              <TableHead>Effect</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((p) => (
              <TableRow key={p.device_id}>
                <TableCell>
                  <DeviceLink id={p.device_id} />
                </TableCell>
                <TableCell className="text-xs">
                  {p.before ? `${nameOf(p.before.deployment_id)} v${p.before.version} (${p.before.source}${p.before.desired_state === "ABSENT" ? ", ABSENT" : ""})` : "nothing"}
                </TableCell>
                <TableCell className="text-xs">
                  {p.kind === "SKIPPED_MANUAL"
                    ? "unchanged"
                    : p.after?.desired_state === "ABSENT"
                      ? "modules removed"
                      : p.after && `${nameOf(p.after.deployment_id)} v${p.after.version}`}
                </TableCell>
                <TableCell>
                  <PlanLabel kind={p.kind} />
                </TableCell>
              </TableRow>
            ))}
            {preview.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No device matches.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>
    </MockPage>
  )
}
