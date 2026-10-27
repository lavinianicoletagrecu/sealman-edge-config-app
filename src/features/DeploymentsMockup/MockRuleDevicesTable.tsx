import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DeviceLink, SourceBadge, SyncBadge } from "./components"
import { deviceStatus, type MockDeployment, type MockDevice, type MockDeviceDeployment, type MockExecution } from "./mockData"

const availableColumns = [
  ["city", "City"],
  ["line", "Line"],
  ["endpoints", "Endpoints"],
  ["deployment", "Current deployment"],
  ["source", "Source"],
  ["status", "Status"],
] as const

type Column = (typeof availableColumns)[number][0]

export function MockRuleDevicesTable({
  devices,
  deviceDeployments,
  deployments,
  executions,
  matchingDeviceIds,
  selectedDeviceIds,
  onToggle,
}: {
  devices: MockDevice[]
  deviceDeployments: MockDeviceDeployment[]
  deployments: MockDeployment[]
  executions: MockExecution[]
  matchingDeviceIds?: Set<string>
  selectedDeviceIds?: Set<string>
  onToggle?: (deviceId: string, selected: boolean) => void
}) {
  const [search, setSearch] = useState("")
  const [visibleColumns, setVisibleColumns] = useState<Set<Column>>(() => new Set(availableColumns.map(([key]) => key)))
  const selectable = Boolean(onToggle && matchingDeviceIds && selectedDeviceIds)
  const executionState = { executions, deviceDeployments }

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...devices]
      .sort((a, b) => {
        const aAssigned = deviceDeployments.some((d) => d.device_id === a.device_id) || executions.some((e) => e.device_id === a.device_id)
        const bAssigned = deviceDeployments.some((d) => d.device_id === b.device_id) || executions.some((e) => e.device_id === b.device_id)
        return Number(aAssigned) - Number(bAssigned) || a.device_id.localeCompare(b.device_id)
      })
      .filter((device) => {
        if (!query) return true
        const assignment = deviceDeployments.find((d) => d.device_id === device.device_id)
        const deploymentName = deployments.find((d) => d.id === assignment?.deployment_id)?.name ?? ""
        const haystack = [
          device.device_id,
          ...Object.values(device.meta),
          ...device.endpoints.flatMap((endpoint) => [endpoint.type, endpoint.vendor]),
          deploymentName,
        ]
        return haystack.some((value) => value.toLowerCase().includes(query))
      })
  }, [search, devices, deviceDeployments, deployments, executions])

  const visibleUnassignedCount = devices.filter(
    (device) =>
      selectable &&
      matchingDeviceIds!.has(device.device_id) &&
      selectedDeviceIds!.has(device.device_id) &&
      !deviceDeployments.some((d) => d.device_id === device.device_id) &&
      !executions.some((e) => e.device_id === device.device_id),
  ).length

  const toggleColumn = (column: Column) => {
    setVisibleColumns((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <Input
          className="max-w-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search devices by ID, metadata, or deployment"
          aria-label="Search devices"
        />
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <legend className="sr-only">Visible device columns</legend>
          <span className="font-medium">Columns:</span>
          {availableColumns.map(([key, label]) => (
            <label key={key} className="flex items-center gap-1">
              <input type="checkbox" checked={visibleColumns.has(key)} onChange={() => toggleColumn(key)} />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
      {visibleUnassignedCount > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          {visibleUnassignedCount} selected device{visibleUnassignedCount === 1 ? "" : "s"} have never received a deployment.
          Nothing has been deployed to these devices yet — are you sure you want to include them?
        </p>
      )}
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && <TableHead>Include</TableHead>}
              <TableHead>Device</TableHead>
              {visibleColumns.has("city") && <TableHead>City</TableHead>}
              {visibleColumns.has("line") && <TableHead>Line</TableHead>}
              {visibleColumns.has("endpoints") && <TableHead>Endpoints</TableHead>}
              {visibleColumns.has("deployment") && <TableHead>Current deployment</TableHead>}
              {visibleColumns.has("source") && <TableHead>Source</TableHead>}
              {visibleColumns.has("status") && <TableHead>Status</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((device) => {
              const eligible = matchingDeviceIds?.has(device.device_id) ?? true
              const included = selectedDeviceIds?.has(device.device_id) ?? false
              const assignment = deviceDeployments.find((d) => d.device_id === device.device_id)
              const deployment = deployments.find((d) => d.id === assignment?.deployment_id)
              const hasEverReceivedDeployment =
                Boolean(assignment) || executions.some((execution) => execution.device_id === device.device_id)
              return (
                <TableRow key={device.device_id} className={!hasEverReceivedDeployment && selectable ? "bg-amber-50/50" : undefined}>
                  {selectable && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={eligible && included}
                        disabled={!eligible}
                        onChange={(event) => onToggle!(device.device_id, event.target.checked)}
                        aria-label={`Include device ${device.device_id} in deployment`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <DeviceLink id={device.device_id} />
                    {selectable && !hasEverReceivedDeployment && <div className="text-[11px] font-normal text-amber-800">Never deployed</div>}
                    {selectable && !eligible && <div className="text-[11px] font-normal text-muted-foreground">Does not match rule</div>}
                    {selectable && eligible && !included && <div className="text-[11px] font-normal text-muted-foreground">Excluded from this rule</div>}
                  </TableCell>
                  {visibleColumns.has("city") && <TableCell>{device.meta.city ?? "–"}</TableCell>}
                  {visibleColumns.has("line") && <TableCell>{device.meta.line ?? "–"}</TableCell>}
                  {visibleColumns.has("endpoints") && (
                    <TableCell className="text-xs">{device.endpoints.map((endpoint) => `${endpoint.type} (${endpoint.vendor})`).join(", ") || "–"}</TableCell>
                  )}
                  {visibleColumns.has("deployment") && (
                    <TableCell>
                      {assignment
                        ? `${deployment?.name ?? assignment.deployment_id} v${assignment.version}${assignment.desired_state === "ABSENT" ? " (cleared)" : ""}`
                        : "Never deployed"}
                    </TableCell>
                  )}
                  {visibleColumns.has("source") && (
                    <TableCell>{assignment ? <SourceBadge source={assignment.source} ruleId={assignment.rule_id} /> : "–"}</TableCell>
                  )}
                  {visibleColumns.has("status") && (
                    <TableCell>
                      <SyncBadge status={deployment?.type === "COMPOSE" ? null : deviceStatus(executionState, device.device_id)} />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={(selectable ? 1 : 0) + 1 + visibleColumns.size} className="text-muted-foreground">
                  No devices match this search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
