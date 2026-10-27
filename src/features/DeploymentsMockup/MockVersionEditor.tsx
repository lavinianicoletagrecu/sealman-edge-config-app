import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "react-toastify"
import { AlertCircle, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MockPage, Section } from "./components"
import {
  buildManifest,
  emptyRuntime,
  useMockStore,
  type MockComposeService,
  type MockDefinition,
  type MockModule,
} from "./mockData"

const emptyDefinition: MockDefinition = { runtime: { ...emptyRuntime, routes: {} }, modules: [] }

const composeTemplate = `services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    restart: always
`

const newModule = (): MockModule => ({
  name: "",
  image: "",
  env: {},
  create_options: {},
  desired_properties: {},
  restart_policy: "always",
  status: "running",
  image_pull_policy: "on-create",
  startup_order: null,
})

const newComposeService = (): MockComposeService => ({
  name: "web",
  image: "nginx",
  version: "1.27",
  env: {},
  ports: ["8080:80"],
  volumes: [],
  restart: "always",
  command: "",
  networks: [],
  depends_on: [],
})

function splitImage(image: string) {
  const separator = image.lastIndexOf(":")
  return separator > image.lastIndexOf("/")
    ? { name: image.slice(0, separator), version: image.slice(separator + 1) }
    : { name: image, version: "" }
}

function toComposeYaml(services: MockComposeService[]) {
  if (!services.length) return "services: {}\n"

  const lines = ["services:"]
  for (const [index, service] of services.entries()) {
    if (index > 0) lines.push("")
    lines.push(`  ${JSON.stringify(service.name || "unnamed")}:`)
    const image = service.version ? `${service.image}:${service.version}` : service.image
    lines.push(`    image: ${JSON.stringify(image)}`)
    if (service.restart) lines.push(`    restart: ${JSON.stringify(service.restart)}`)
    if (service.command) lines.push(`    command: ${JSON.stringify(service.command)}`)
    if (service.ports.length) {
      lines.push("    ports:")
      service.ports.forEach((port) => lines.push(`      - ${JSON.stringify(port)}`))
    }
    if (service.volumes.length) {
      lines.push("    volumes:")
      service.volumes.forEach((volume) => lines.push(`      - ${JSON.stringify(volume)}`))
    }
    if (Object.keys(service.env).length) {
      lines.push("    environment:")
      Object.entries(service.env).forEach(([key, value]) => lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(value)}`))
    }
    if (service.networks.length) {
      lines.push("    networks:")
      service.networks.forEach((network) => lines.push(`      - ${JSON.stringify(network)}`))
    }
    if (service.depends_on.length) {
      lines.push("    depends_on:")
      service.depends_on.forEach((dependency) => lines.push(`      - ${JSON.stringify(dependency)}`))
    }
  }
  const networks = [...new Set(services.flatMap((service) => service.networks))]
  if (networks.length) {
    lines.push("", "networks:")
    networks.forEach((network) => lines.push(`  ${JSON.stringify(network)}: {}`))
  }
  return `${lines.join("\n")}\n`
}

function KeyValueText({ value, onChange, placeholder }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; placeholder: string }) {
  const [text, setText] = useState(Object.entries(value).map(([k, v]) => `${k}=${v}`).join("\n"))
  return (
    <Textarea
      rows={2}
      className="font-mono text-xs"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const entries = e.target.value
          .split("\n")
          .map((l) => l.split("="))
          .filter(([k]) => k?.trim())
          .map(([k, ...v]) => [k.trim(), v.join("=")])
        onChange(Object.fromEntries(entries))
      }}
    />
  )
}

function ListText({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState(value.join("\n"))
  return (
    <Textarea
      rows={2}
      className="font-mono text-xs"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(e.target.value.split("\n").map((line) => line.trim()).filter(Boolean))
      }}
    />
  )
}

function JsonText({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2))
  const [error, setError] = useState(false)
  return (
    <Textarea
      rows={3}
      className={`font-mono text-xs ${error ? "border-red-500" : ""}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        try {
          onChange(JSON.parse(e.target.value || "{}"))
          setError(false)
        } catch {
          setError(true)
        }
      }}
    />
  )
}

function ModuleCard({ module, onChange, onRemove }: { module: MockModule; onChange: (m: MockModule) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(!module.name)
  const set = <K extends keyof MockModule>(k: K, v: MockModule[K]) => onChange({ ...module, [k]: v })
  const image = splitImage(module.image)
  return (
    <div className="rounded border">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
        <button className="flex items-center gap-1 text-sm font-medium" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {module.name || <span className="text-muted-foreground">new module</span>}
        </button>
        <span className="text-xs text-muted-foreground truncate">{module.image}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 p-3">
          <div className="grid gap-1">
            <Label className="text-xs">Name</Label>
            <Input value={module.name} onChange={(e) => set("name", e.target.value)} placeholder="telegraf" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Image name</Label>
            <Input value={image.name} onChange={(e) => set("image", `${e.target.value}${image.version ? `:${image.version}` : ""}`)} placeholder="registry.example.com/telegraf" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Version</Label>
            <Input value={image.version} onChange={(e) => set("image", `${image.name}${e.target.value ? `:${e.target.value}` : ""}`)} placeholder="1.3.0" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Restart policy</Label>
            <Select value={module.restart_policy} onValueChange={(v) => set("restart_policy", v as MockModule["restart_policy"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["always", "on-failure", "on-unhealthy", "never"].map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={module.status} onValueChange={(v) => set("status", v as MockModule["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="running">running</SelectItem>
                  <SelectItem value="stopped">stopped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Pull</Label>
              <Select value={module.image_pull_policy} onValueChange={(v) => set("image_pull_policy", v as MockModule["image_pull_policy"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on-create">on-create</SelectItem>
                  <SelectItem value="never">never</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Startup order</Label>
              <Input
                type="number"
                value={module.startup_order ?? ""}
                onChange={(e) => set("startup_order", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Environment (KEY=value per line)</Label>
            <KeyValueText value={module.env} onChange={(v) => set("env", v)} placeholder="SITE=Berlin" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Create options (Docker, JSON)</Label>
            <JsonText value={module.create_options} onChange={(v) => set("create_options", v)} />
          </div>
          <div className="grid gap-1 col-span-2">
            <Label className="text-xs">Desired properties (module twin, JSON)</Label>
            <JsonText value={module.desired_properties} onChange={(v) => set("desired_properties", v)} />
          </div>
        </div>
      )}
    </div>
  )
}

function ComposeServiceCard({
  service,
  onChange,
  onRemove,
}: {
  service: MockComposeService
  onChange: (service: MockComposeService) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(!service.name)
  const set = <K extends keyof MockComposeService>(key: K, value: MockComposeService[K]) =>
    onChange({ ...service, [key]: value })
  return (
    <div className="rounded border">
      <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
        <button className="flex items-center gap-1 text-sm font-medium" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {service.name || <span className="text-muted-foreground">new service</span>}
        </button>
        <span className="truncate text-xs text-muted-foreground">{service.image}{service.version && `:${service.version}`}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onRemove} aria-label={`Remove ${service.name || "service"}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 p-3">
          <div className="grid gap-1">
            <Label className="text-xs">Service name</Label>
            <Input value={service.name} onChange={(e) => set("name", e.target.value)} placeholder="web" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Image name</Label>
            <Input value={service.image} onChange={(e) => set("image", e.target.value)} placeholder="nginx" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Version</Label>
            <Input value={service.version} onChange={(e) => set("version", e.target.value)} placeholder="1.27" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Restart policy</Label>
            <Input value={service.restart} onChange={(e) => set("restart", e.target.value)} placeholder="always" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Command</Label>
            <Input value={service.command} onChange={(e) => set("command", e.target.value)} placeholder="npm start" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Environment (KEY=value per line)</Label>
            <KeyValueText value={service.env} onChange={(v) => set("env", v)} placeholder="SITE=Berlin" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Ports (one mapping per line)</Label>
            <ListText value={service.ports} onChange={(v) => set("ports", v)} placeholder="8080:80" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Volumes (one mapping per line)</Label>
            <ListText value={service.volumes} onChange={(v) => set("volumes", v)} placeholder="./data:/data" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Networks (one per line)</Label>
            <ListText value={service.networks} onChange={(v) => set("networks", v)} placeholder="backend" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Depends on (one service per line)</Label>
            <ListText value={service.depends_on} onChange={(v) => set("depends_on", v)} placeholder="database" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function MockVersionEditor() {
  const { deploymentId } = useParams()
  const navigate = useNavigate()
  const deployment = useMockStore((s) => s.deployments.find((d) => d.id === deploymentId))
  const addVersion = useMockStore((s) => s.addVersion)
  const base = deployment?.versions[0]
  const [def, setDef] = useState<MockDefinition>(() => structuredClone(base?.definition ?? emptyDefinition))
  const [composeServices, setComposeServices] = useState<MockComposeService[]>(() =>
    structuredClone(base?.compose_services ?? [newComposeService()]),
  )
  const [yamlOverride, setYamlOverride] = useState<string | null>(() =>
    base?.compose_yaml_override ? base.compose_yaml ?? composeTemplate : null,
  )
  const [manifestText, setManifestText] = useState<string | null>(() =>
    base?.manifest_override === undefined ? null : JSON.stringify(base.manifest_override, null, 2),
  )
  const [routesText, setRoutesText] = useState(
    Object.entries(base?.definition?.runtime.routes ?? def.runtime.routes).map(([name, route]) => `${name}=${route}`).join("\n"),
  )
  const [note, setNote] = useState("")
  const [confirmOverrideSave, setConfirmOverrideSave] = useState(false)

  const manifest = useMemo(() => buildManifest(def), [def])
  const generatedManifestText = useMemo(() => JSON.stringify(manifest, null, 2), [manifest])
  const generatedYaml = useMemo(() => toComposeYaml(composeServices), [composeServices])
  const yaml = yamlOverride ?? generatedYaml
  const manifestValid = useMemo(() => {
    if (manifestText === null) return true
    try {
      JSON.parse(manifestText)
      return true
    } catch {
      return false
    }
  }, [manifestText])

  if (!deployment) return <MockPage title="Not found">Unknown deployment.</MockPage>

  const isEdge = deployment.type === "IOTEDGE"
  const manifestOverrideUnchanged =
    manifestText === null
      ? base?.manifest_override === undefined
      : base?.manifest_override !== undefined && manifestText === JSON.stringify(base.manifest_override, null, 2)
  const composeUnchanged =
    (yamlOverride === null &&
      base?.compose_yaml_override !== true &&
      JSON.stringify(base?.compose_services ?? []) === JSON.stringify(composeServices) &&
      base?.compose_yaml === generatedYaml) ||
    (yamlOverride !== null && base?.compose_yaml_override === true && yamlOverride === base.compose_yaml)
  const unchanged = base && (
    isEdge
      ? JSON.stringify(base.definition) === JSON.stringify(def) && manifestOverrideUnchanged
      : composeUnchanged
  )
  const nextVersion = (base?.version ?? 0) + 1
  const crumbs = [
    { label: "Deployments", to: "/mockups/deployments" },
    { label: deployment.name, to: `/mockups/deployments/${deployment.id}` },
  ]

  const persist = () => {
    if (isEdge && !manifestValid) {
      toast.error("The manifest must be valid JSON before it can be saved.")
      return
    }
    if (unchanged) {
      toast.error(`409 DUPLICATE_CONTENT: same content as v${base!.version}`)
      return
    }
    if (isEdge) {
      addVersion(deployment.id, {
        change_note: note,
        definition: def,
        ...(manifestText === null ? {} : { manifest_override: JSON.parse(manifestText) }),
      })
    } else {
      addVersion(deployment.id, {
        change_note: note,
        compose_services: composeServices,
        compose_yaml: yaml,
        compose_yaml_override: yamlOverride !== null,
      })
    }
    toast.success(`Saved ${deployment.name} v${nextVersion}. Point a target rule at it to roll it out.`)
    navigate(`/mockups/deployments/${deployment.id}`)
  }

  const hasUnsyncedOverride = isEdge ? manifestText !== null : yamlOverride !== null
  const save = () => {
    if (hasUnsyncedOverride) {
      setConfirmOverrideSave(true)
      return
    }
    persist()
  }

  const saveSection = (
    <Section title="Save">
      <div className="grid gap-2">
        <Label htmlFor="note">What did you change? (required)</Label>
        <Input id="note" placeholder="telegraf 1.3.0 → 1.4.0" value={note} onChange={(e) => setNote(e.target.value)} />
        {unchanged && (
          <p className="flex items-center gap-1 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            Nothing changed yet: saving now would be rejected as a duplicate of v{base!.version}.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate(`/mockups/deployments/${deployment.id}`)}>
            Cancel
          </Button>
          <Button disabled={!note.trim() || (isEdge && !manifestValid)} onClick={save}>
            Save as v{nextVersion}
          </Button>
        </div>
      </div>
    </Section>
  )

  const subtitle = base ? `Starts as a copy of v${base.version}. v${base.version} itself never changes.` : "First version."

  return (
    <MockPage title={`${deployment.name}: new version (v${nextVersion})`} subtitle={subtitle} crumbs={crumbs}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-4">
          {isEdge ? (
            <>
              <Section
                title={`Modules (${def.modules.length})`}
                actions={
                  <Button size="sm" variant="outline" onClick={() => setDef({ ...def, modules: [...def.modules, newModule()] })}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add module
                  </Button>
                }
              >
                <div className="space-y-2">
                  {def.modules.map((m, i) => (
                    <ModuleCard
                      key={i}
                      module={m}
                      onChange={(nm) => setDef({ ...def, modules: def.modules.map((x, j) => (j === i ? nm : x)) })}
                      onRemove={() => setDef({ ...def, modules: def.modules.filter((_, j) => j !== i) })}
                    />
                  ))}
                </div>
              </Section>
              <Section title="IoT Edge options" description="Routes are specific to IoT Hub deployments.">
                <div className="grid gap-1">
                  <Label className="text-xs">Routes (name=FROM … INTO … per line)</Label>
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    value={routesText}
                    onChange={(event) => {
                      const value = event.target.value
                      setRoutesText(value)
                      const routes = Object.fromEntries(
                        value
                          .split("\n")
                          .map((line) => line.split("="))
                          .filter(([name]) => name?.trim())
                          .map(([name, ...route]) => [name.trim(), route.join("=").trim()]),
                      )
                      setDef({ ...def, runtime: { ...def.runtime, routes } })
                    }}
                  />
                </div>
              </Section>
            </>
          ) : (
            <Section
              title={`Services (${composeServices.length})`}
              description="Common service options are available here. Add any other Compose fields in the YAML editor."
              actions={
                <Button size="sm" variant="outline" onClick={() => setComposeServices([...composeServices, { ...newComposeService(), name: "" }])}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add service
                </Button>
              }
            >
              <div className="space-y-2">
                {composeServices.map((service, i) => (
                  <ComposeServiceCard
                    key={i}
                    service={service}
                    onChange={(updated) => setComposeServices(composeServices.map((item, j) => (j === i ? updated : item)))}
                    onRemove={() => setComposeServices(composeServices.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </Section>
          )}

          {saveSection}
        </div>

        {isEdge ? (
          <Section
            title="Manifest preview (JSON)"
            description="Generated from the form. Editing this JSON takes priority and the edited manifest is saved as supplied."
            actions={
              <Button size="sm" variant="outline" disabled={manifestText === null} onClick={() => setManifestText(null)}>
                <RotateCcw className="mr-1 h-4 w-4" />
                Reset from form
              </Button>
            }
          >
            {manifestText !== null && (
              <p className="mb-2 text-xs text-amber-700">
                Edited manifest takes priority over the module form until reset.
              </p>
            )}
            <Textarea
              rows={30}
              className={`min-h-[65vh] font-mono text-xs ${!manifestValid ? "border-red-500" : ""}`}
              value={manifestText ?? generatedManifestText}
              onChange={(e) => setManifestText(e.target.value)}
              spellCheck={false}
            />
            {!manifestValid && <p className="mt-1 text-xs text-red-600">Enter valid JSON to save this manifest.</p>}
          </Section>
        ) : (
          <Section
            title="docker-compose.yaml"
            description="Generated from the service form. Edit this YAML directly for any Compose options."
            actions={
              <Button size="sm" variant="outline" disabled={yamlOverride === null} onClick={() => setYamlOverride(null)}>
                <RotateCcw className="mr-1 h-4 w-4" />
                Reset from form
              </Button>
            }
          >
            {yamlOverride !== null && (
              <p className="mb-2 text-xs text-amber-700">
                Edited YAML takes priority over the service form and is saved as supplied. Form changes are ignored until reset.
              </p>
            )}
            <Textarea
              rows={30}
              className="min-h-[65vh] font-mono text-xs"
              value={yaml}
              onChange={(e) => setYamlOverride(e.target.value)}
              spellCheck={false}
            />
          </Section>
        )}
      </div>
      <Dialog open={confirmOverrideSave} onOpenChange={setConfirmOverrideSave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save the edited {isEdge ? "manifest" : "Compose file"}?</DialogTitle>
            <DialogDescription>
              The {isEdge ? "manifest" : "Compose YAML"} on the right is not synced with the form on the left. Saving will use the
              right-hand {isEdge ? "manifest" : "file"} as the source of truth; form values will not replace it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOverrideSave(false)}>
              Go back
            </Button>
            <Button
              onClick={() => {
                setConfirmOverrideSave(false)
                persist()
              }}
            >
              Save right-hand file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MockPage>
  )
}
