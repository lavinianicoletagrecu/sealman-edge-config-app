import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Eye, Pencil, Plus, Rocket, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DeviceLink,
  ExecutionBadge,
  ExpressionChips,
  MockPage,
  Section,
  TypeBadge,
} from "./components"
import { deviceStatus, fmt, matches, plan, useMockStore } from "./mockData"
import { MockRuleDevicesTable } from "./MockRuleDevicesTable"

export default function MockDeploymentDetail() {
  const { deploymentId } = useParams()
  const navigate = useNavigate()
  const store = useMockStore()

  const deployment = store.deployments.find((d) => d.id === deploymentId)
  const [devicesExpanded, setDevicesExpanded] = useState(false)
  const deploymentPlan = useMemo(() => plan(store), [store.devices, store.rules, store.deviceDeployments])
  if (!deployment) return <MockPage title="Not found">Unknown deployment.</MockPage>

  const rules = store.rules.filter((r) => r.deployment_id === deployment.id)
  const onDevices = store.deviceDeployments.filter((d) => d.deployment_id === deployment.id)
  const executions = store.executions.filter((e) => e.deployment_id === deployment.id).slice(0, 12)
  const failed = onDevices.filter((d) => deviceStatus(store, d.device_id) === "FAILED").map((d) => d.device_id)
  const isEdge = deployment.type === "IOTEDGE"
  const deploymentDeviceIds = new Set([
    ...onDevices.filter((d) => d.desired_state === "RUNNING").map((d) => d.device_id),
    ...deploymentPlan
      .filter((row) => row.after?.deployment_id === deployment.id && row.after.desired_state === "RUNNING")
      .map((row) => row.device_id),
  ])
  const deploymentDevices = store.devices.filter((device) => deploymentDeviceIds.has(device.device_id))

  return (
    <MockPage
      title={
        <span className="flex items-center gap-2">
          {deployment.name} <TypeBadge type={deployment.type} />
        </span>
      }
      subtitle={deployment.description}
      crumbs={[{ label: "Deployments", to: "/mockups/deployments" }]}
    >
      <Section
        title="Versions"
        description="Immutable. To change something, save a new version; to roll back, point a rule at an older version."
        actions={
          <Button size="sm" variant="outline" onClick={() => navigate(`/mockups/deployments/${deployment.id}/versions/new`)}>
            <Plus className="h-4 w-4 mr-1" />
            New version
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Change note</TableHead>
              <TableHead>{isEdge ? "Modules" : "Services"}</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Show</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deployment.versions.map((v) => (
              <TableRow key={v.version}>
                <TableCell className="font-medium">v{v.version}</TableCell>
                <TableCell>{v.change_note}</TableCell>
                <TableCell className="text-xs">
                  {isEdge
                    ? v.definition?.modules.map((m) => m.name).join(", ") || "–"
                    : v.compose_services?.map((service) => service.name).join(", ") || "docker-compose.yaml"}
                </TableCell>
                <TableCell>{v.created_by_name}</TableCell>
                <TableCell>{fmt(v.created_at)}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/mockups/deployments/${deployment.id}/versions/${v.version}`)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Show
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Target rules"
        description="Live: re-evaluated whenever a device, endpoint, service or rule changes. If rules of different deployments match one device, the newest rule wins."
        actions={
          <Button size="sm" variant="outline" disabled={!deployment.versions.length} onClick={() => navigate(`/mockups/deployments/${deployment.id}/rules/new`)}>
            <Plus className="h-4 w-4 mr-1" />
            New target rule
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Devices where</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Matches now</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Last change</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.id}</TableCell>
                <TableCell>
                  <ExpressionChips expression={r.expression} />
                </TableCell>
                <TableCell>v{r.version}</TableCell>
                <TableCell>
                  {store.devices.filter((device) => matches(device, r.expression) && !r.excluded_device_ids?.includes(device.device_id)).length}
                </TableCell>
                <TableCell>
                  <Switch checked={r.enabled} onCheckedChange={(v) => store.setRuleEnabled(r.id, v)} />
                </TableCell>
                <TableCell className="text-xs">{fmt(r.updated_at)}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/mockups/deployments/${deployment.id}/rules/${r.id}`)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => store.deleteRule(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No rules yet. Devices only get this deployment through a rule or a manual assignment.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Deployments"
        description="Rules define the target devices; deploying is a separate, explicit action. The device list is read-only here."
        actions={
          <>
            {isEdge && (
              <Button size="sm" variant="outline" disabled={!failed.length} onClick={() => store.redeliver(failed)}>
                <RotateCcw className="mr-1 h-4 w-4" />
                Redeliver failed ({failed.length})
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={!rules.some((rule) => rule.enabled)} onClick={() => store.deployRules(deployment.id)}>
              <Rocket className="mr-1 h-4 w-4" />
              Deploy
            </Button>
          </>
        }
      >
        <details open={devicesExpanded} onToggle={(event) => setDevicesExpanded(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-medium">
            Devices to watch ({deploymentDevices.length})
          </summary>
          <div className="mt-3">
            {deploymentDevices.length ? (
              <MockRuleDevicesTable
                devices={deploymentDevices}
                deviceDeployments={store.deviceDeployments}
                deployments={store.deployments}
                executions={store.executions}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No devices are currently targeted or running this deployment.</p>
            )}
          </div>
        </details>
      </Section>

      {isEdge && (
        <Section title="Recent executions" description="One row per apply to one device: what triggered it and how it ended. Updates live.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Triggered by</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{fmt(e.created_at)}</TableCell>
                  <TableCell>
                    <DeviceLink id={e.device_id} />
                  </TableCell>
                  <TableCell className="text-xs">{e.action === "CLEAR" ? "Clear" : `v${e.version}`}</TableCell>
                  <TableCell className="text-xs">{e.trigger}</TableCell>
                  <TableCell>
                    <ExecutionBadge state={e.state} />
                  </TableCell>
                  <TableCell className="text-xs text-red-700">{e.error}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

    </MockPage>
  )
}
