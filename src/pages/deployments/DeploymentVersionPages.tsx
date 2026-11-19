import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, PackageSearch, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import PageTitle from "@/components/Typography/PageTitle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { edgeConfigApi } from "@/api/edgeConfig/edgeConfigApi";
import { getErrorMessage } from "@/lib/errors";

type DeploymentType = "IOTEDGE" | "COMPOSE";
type Deployment = {
  id: number;
  name: string;
  deployment_type: DeploymentType;
  description: string | null;
  created_at: string;
  latest_version: number | null;
  version_count: number;
};
type KeyValues = Record<string, string>;
type Module = {
  name: string;
  image: string;
  env: KeyValues;
  create_options: Record<string, unknown>;
  desired_properties: Record<string, unknown>;
  restart_policy: "always" | "on-failure" | "on-unhealthy" | "never";
  status: "running" | "stopped";
  image_pull_policy: "on-create" | "never";
  startup_order: number | null;
};
type RuntimeComponent = { image: string; env: KeyValues; create_options: Record<string, unknown> };
type EdgeDefinition = {
  runtime: {
    edge_agent: RuntimeComponent;
    edge_hub: RuntimeComponent & { store_and_forward_ttl_secs: number };
    routes: Record<string, string>;
  };
  modules: Module[];
};
type ComposeService = {
  name: string;
  image: string;
  version: string;
  env: KeyValues;
  ports: KeyValues;
  volumes: KeyValues;
  restart: string;
  command: string;
  networks: KeyValues;
  depends_on: KeyValues;
};
type ComposeDefinition = { services: ComposeService[] };
type DeploymentVersion = {
  id: number;
  version: number;
  content_hash: string;
  change_note: string;
  created_at: string;
  created_by: string | null;
  definition: EdgeDefinition | ComposeDefinition;
};
type RegistryRepositoryList = { registry: string; repositories: string[] };
type RegistryTagList = { repository: string; tags: string[] };

const emptyRuntimeComponent = (image: string): RuntimeComponent => ({ image, env: {}, create_options: {} });
const emptyEdgeDefinition = (): EdgeDefinition => ({
  runtime: {
    edge_agent: emptyRuntimeComponent("mcr.microsoft.com/azureiotedge-agent:1.5"),
    edge_hub: { ...emptyRuntimeComponent("mcr.microsoft.com/azureiotedge-hub:1.5"), store_and_forward_ttl_secs: 7200 },
    routes: {},
  },
  modules: [],
});
const emptyComposeService = (): ComposeService => ({
  name: "web",
  image: "nginx",
  version: "1.27",
  env: {},
  ports: { "8080": "80" },
  volumes: {},
  restart: "always",
  command: "",
  networks: {},
  depends_on: {},
});
const emptyComposeDefinition = (): ComposeDefinition => ({ services: [emptyComposeService()] });

const formatDate = (date: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

function KeyValueEditor({
  value,
  onChange,
  keyLabel,
  valueLabel,
}: {
  value: KeyValues;
  onChange: (value: KeyValues) => void;
  keyLabel: string;
  valueLabel: string;
}) {
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(value));
  const signature = JSON.stringify(value);
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setRows(Object.entries(value));
  }
  const change = (nextRows: [string, string][]) => {
    setRows(nextRows);
    onChange(Object.fromEntries(nextRows.filter(([key]) => key.trim())));
  };
  return (
    <div className="space-y-2">
      {rows.map(([key, rowValue], index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <Input aria-label={keyLabel} placeholder={keyLabel} value={key} onChange={(event) => change(rows.map((row, i) => i === index ? [event.target.value, rowValue] : row))} />
          <Input aria-label={valueLabel} placeholder={valueLabel} value={rowValue} onChange={(event) => change(rows.map((row, i) => i === index ? [key, event.target.value] : row))} />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => change(rows.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, ["", ""]])}><Plus className="mr-1 h-4 w-4" />Add row</Button>
    </div>
  );
}

function JsonEditor({
  id,
  label,
  value,
  onChange,
  onValidityChange,
}: {
  id: string;
  label: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange: (id: string, valid: boolean) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState(false);
  const signature = JSON.stringify(value, null, 2);
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setText(signature);
    setError(false);
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Textarea
        rows={4}
        className={`font-mono text-xs ${error ? "border-destructive" : ""}`}
        value={text}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          try {
            const parsed: unknown = JSON.parse(nextText || "{}");
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object");
            onChange(parsed as Record<string, unknown>);
            setError(false);
            onValidityChange(id, true);
          } catch {
            setError(true);
            onValidityChange(id, false);
          }
        }}
      />
      {error && <p className="text-xs text-destructive">Enter a valid JSON object.</p>}
    </div>
  );
}

function ModuleEditor({
  module,
  index,
  onChange,
  onRemove,
  onValidityChange,
}: {
  module: Module;
  index: number;
  onChange: (module: Module) => void;
  onRemove: () => void;
  onValidityChange: (id: string, valid: boolean) => void;
}) {
  const set = <K extends keyof Module>(key: K, value: Module[K]) => onChange({ ...module, [key]: value });
  const image = module.image.match(/^(.*):([^/:]+)$/);
  const imageName = image?.[1] ?? module.image;
  const imageVersion = image?.[2] ?? "";
  const [open, setOpen] = useState(true);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [selectedRepository, setSelectedRepository] = useState("");
  const repositoriesQuery = useQuery({
    queryKey: ["deployment-registry-repositories"],
    queryFn: edgeConfigApi.getDeploymentRegistryRepositories,
    enabled: registryOpen,
    staleTime: 60_000,
  });
  const tagsQuery = useQuery({
    queryKey: ["deployment-registry-tags", selectedRepository],
    queryFn: () => edgeConfigApi.getDeploymentRegistryTags(selectedRepository),
    enabled: registryOpen && Boolean(selectedRepository),
    staleTime: 60_000,
  });
  const registry = repositoriesQuery.data as RegistryRepositoryList | undefined;
  const repositoryTags = tagsQuery.data as RegistryTagList | undefined;
  const visibleRepositories = (registry?.repositories ?? []).filter((repository) =>
    repository.toLowerCase().includes(registrySearch.trim().toLowerCase()),
  );
  const visibleTags = (repositoryTags?.tags ?? []).filter((tag) =>
    tag.toLowerCase().includes(tagSearch.trim().toLowerCase()),
  );
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
        <button type="button" className="font-medium" onClick={() => setOpen((current) => !current)}>{module.name || `New module ${index + 1}`}</button>
        <span className="truncate text-xs text-muted-foreground">{module.image}</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={`Remove module ${module.name || index + 1}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {open && <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-1"><Label>Name</Label><Input value={module.name} onChange={(event) => set("name", event.target.value)} placeholder="telegraf" /></div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label>Image name</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => {
              setRegistryOpen(true);
              setRegistrySearch("");
              setTagSearch("");
              setSelectedRepository("");
            }}>
              <PackageSearch className="mr-2 h-4 w-4" />Browse Azure CR
            </Button>
          </div>
          <Input value={imageName} onChange={(event) => set("image", `${event.target.value}${imageVersion ? `:${imageVersion}` : ""}`)} placeholder="registry.example.com/telegraf" />
          <p className="text-xs text-muted-foreground">You can also enter Microsoft or another public/private image directly. Images in the configured private registry use API-side credentials; don't enter credentials here.</p>
        </div>
        <div className="space-y-1"><Label>Version</Label><Input value={imageVersion} onChange={(event) => set("image", `${imageName}${event.target.value ? `:${event.target.value}` : ""}`)} placeholder="1.3.0" /></div>
        <div className="space-y-1"><Label>Restart policy</Label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={module.restart_policy} onChange={(event) => set("restart_policy", event.target.value as Module["restart_policy"])}>{["always", "on-failure", "on-unhealthy", "never"].map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="space-y-1"><Label>Status</Label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={module.status} onChange={(event) => set("status", event.target.value as Module["status"])}><option value="running">running</option><option value="stopped">stopped</option></select></div>
        <div className="space-y-1"><Label>Image pull policy</Label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={module.image_pull_policy} onChange={(event) => set("image_pull_policy", event.target.value as Module["image_pull_policy"])}><option value="on-create">on-create</option><option value="never">never</option></select></div>
        <div className="space-y-1"><Label>Startup order</Label><Input type="number" min={0} value={module.startup_order ?? ""} onChange={(event) => set("startup_order", event.target.value === "" ? null : Number(event.target.value))} /></div>
        <div className="space-y-2 md:col-span-2"><Label className="text-xs">Environment</Label><KeyValueEditor value={module.env} onChange={(value) => set("env", value)} keyLabel="Variable name" valueLabel="Value" /></div>
        <div className="space-y-1">
          <JsonEditor id={`module-${index}-create`} label="Create options (Docker JSON)" value={module.create_options} onChange={(value) => set("create_options", value)} onValidityChange={onValidityChange} />
          <p className="text-xs text-muted-foreground">Enter a JSON object. The API stringifies it for the Edge Agent; string values are preserved, including long environment values.</p>
        </div>
        <JsonEditor id={`module-${index}-desired`} label="Desired properties (module twin JSON)" value={module.desired_properties} onChange={(value) => set("desired_properties", value)} onValidityChange={onValidityChange} />
      </div>}
      <Dialog
        open={registryOpen}
        onOpenChange={(isOpen) => {
          setRegistryOpen(isOpen);
          if (!isOpen) {
            setSelectedRepository("");
            setTagSearch("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Browse Azure Container Registry</DialogTitle>
            <DialogDescription>Select a repository and tag. You can still use any image by entering it manually.</DialogDescription>
          </DialogHeader>
          {repositoriesQuery.isLoading ? (
            <LoadingState label="Loading registry repositories..." />
          ) : repositoriesQuery.isError ? (
            <ErrorState
              title="Could not load registry repositories"
              message="Check the API registry configuration and catalog permissions, then try again."
              onRetry={() => { void repositoriesQuery.refetch(); }}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Input
                  value={registrySearch}
                  onChange={(event) => setRegistrySearch(event.target.value)}
                  placeholder="Filter repositories"
                  aria-label="Filter registry repositories"
                />
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-1">
                  {visibleRepositories.map((repository) => (
                    <button
                      type="button"
                      key={repository}
                      className={`w-full rounded px-2 py-2 text-left text-sm hover:bg-muted ${selectedRepository === repository ? "bg-muted font-medium" : ""}`}
                      onClick={() => {
                        setSelectedRepository(repository);
                        setTagSearch("");
                      }}
                    >
                      {repository}
                    </button>
                  ))}
                  {!visibleRepositories.length && <p className="p-3 text-sm text-muted-foreground">No repositories found.</p>}
                </div>
              </div>
              <div className="space-y-2 rounded-md border p-2">
                {!selectedRepository ? (
                  <p className="p-3 text-sm text-muted-foreground">Select a repository to view its tags.</p>
                ) : tagsQuery.isLoading ? (
                  <LoadingState label="Loading image tags..." />
                ) : tagsQuery.isError ? (
                  <ErrorState
                    title="Could not load image tags"
                    message="Check the repository permissions, then select it again."
                    onRetry={() => { void tagsQuery.refetch(); }}
                  />
                ) : (
                  <>
                    <p className="truncate px-2 text-xs text-muted-foreground">{selectedRepository}</p>
                    <Input
                      value={tagSearch}
                      onChange={(event) => setTagSearch(event.target.value)}
                      placeholder="Filter tags"
                      aria-label="Filter image tags"
                    />
                    <div className="max-h-72 space-y-1 overflow-y-auto">
                    {visibleTags.map((tag) => (
                      <Button
                        type="button"
                        key={tag}
                        variant="ghost"
                        className="w-full justify-start font-mono text-xs"
                        onClick={() => {
                          set("image", `${registry?.registry}/${selectedRepository}:${tag}`);
                          setRegistryOpen(false);
                          setSelectedRepository("");
                        }}
                      >
                        {tag}
                      </Button>
                    ))}
                    {!visibleTags.length && <p className="p-3 text-sm text-muted-foreground">{repositoryTags?.tags.length ? "No tags match that filter." : "No tags found."}</p>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComposeServiceEditor({
  service,
  index,
  onChange,
  onRemove,
}: {
  service: ComposeService;
  index: number;
  onChange: (service: ComposeService) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof ComposeService>(key: K, value: ComposeService[K]) => onChange({ ...service, [key]: value });
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
        <button type="button" className="font-medium" onClick={() => setOpen((current) => !current)}>{service.name || `New service ${index + 1}`}</button>
        <span className="truncate text-xs text-muted-foreground">{service.image}{service.version && `:${service.version}`}</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={`Remove service ${service.name || index + 1}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {open && <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-1"><Label>Service name</Label><Input value={service.name} onChange={(event) => set("name", event.target.value)} placeholder="web" /></div>
        <div className="space-y-1"><Label>Image name</Label><Input value={service.image} onChange={(event) => set("image", event.target.value)} placeholder="nginx" /></div>
        <div className="space-y-1"><Label>Version</Label><Input value={service.version} onChange={(event) => set("version", event.target.value)} placeholder="1.27" /></div>
        <div className="space-y-1"><Label>Restart policy</Label><Input value={service.restart} onChange={(event) => set("restart", event.target.value)} placeholder="always" /></div>
        <div className="space-y-1 md:col-span-2"><Label>Command</Label><Input value={service.command} onChange={(event) => set("command", event.target.value)} placeholder="npm start" /></div>
        <div className="space-y-2"><Label className="text-xs">Environment</Label><KeyValueEditor value={service.env} onChange={(value) => set("env", value)} keyLabel="Variable name" valueLabel="Value" /></div>
        <div className="space-y-2"><Label className="text-xs">Ports (host to container)</Label><KeyValueEditor value={service.ports} onChange={(value) => set("ports", value)} keyLabel="External port" valueLabel="Internal port" /></div>
        <div className="space-y-2"><Label className="text-xs">Volumes</Label><KeyValueEditor value={service.volumes} onChange={(value) => set("volumes", value)} keyLabel="Host path or volume" valueLabel="Container path" /></div>
        <div className="space-y-2"><Label className="text-xs">Networks</Label><KeyValueEditor value={service.networks} onChange={(value) => set("networks", value)} keyLabel="Network name" valueLabel="Alias (optional)" /></div>
        <div className="space-y-2 md:col-span-2"><Label className="text-xs">Depends on</Label><KeyValueEditor value={service.depends_on} onChange={(value) => set("depends_on", value)} keyLabel="Service name" valueLabel="Condition (e.g. service_healthy)" /></div>
      </div>}
    </div>
  );
}

function composeYaml(services: ComposeService[]) {
  if (!services.length) return "services: {}\n";
  const lines = ["services:"];
  for (const [index, service] of services.entries()) {
    if (index) lines.push("");
    lines.push(`  ${JSON.stringify(service.name || "unnamed")}:`);
    const image = service.version ? `${service.image}:${service.version}` : service.image;
    lines.push(`    image: ${JSON.stringify(image)}`);
    if (service.restart) lines.push(`    restart: ${JSON.stringify(service.restart)}`);
    if (service.command) lines.push(`    command: ${JSON.stringify(service.command)}`);
    const entries = (key: string, values: KeyValues, format: (pair: [string, string]) => string) => {
      const active = Object.entries(values).filter(([first, second]) => first && second);
      if (!active.length) return;
      lines.push(`    ${key}:`);
      active.forEach(([first, second]) => lines.push(`      - ${JSON.stringify(format([first, second]))}`));
    };
    entries("ports", service.ports, ([host, container]) => `${host}:${container}`);
    entries("volumes", service.volumes, ([host, container]) => `${host}:${container}`);
    if (Object.keys(service.env).length) {
      lines.push("    environment:");
      Object.entries(service.env).forEach(([key, value]) => lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(value)}`));
    }
    if (Object.keys(service.networks).length) {
      lines.push("    networks:");
      Object.entries(service.networks).forEach(([network, alias]) => {
        if (alias) lines.push(`      ${JSON.stringify(network)}:`, "        aliases:", `          - ${JSON.stringify(alias)}`);
        else lines.push(`      ${JSON.stringify(network)}: {}`);
      });
    }
    const dependencies = Object.entries(service.depends_on).filter(([name]) => name);
    if (dependencies.length) {
      lines.push("    depends_on:");
      dependencies.forEach(([name, condition]) => lines.push(`      ${JSON.stringify(name)}:`, `        condition: ${JSON.stringify(condition || "service_started")}`));
    }
  }
  const networks = [...new Set(services.flatMap((service) => Object.keys(service.networks)))];
  if (networks.length) {
    lines.push("", "networks:");
    networks.forEach((network) => lines.push(`  ${JSON.stringify(network)}: {}`));
  }
  return `${lines.join("\n")}\n`;
}

function edgeManifest(definition: EdgeDefinition) {
  const env = (values: KeyValues) => Object.keys(values).length
    ? Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]))
    : undefined;
  const modulesContent: Record<string, unknown> = {
    $edgeAgent: { "properties.desired": {
      schemaVersion: "1.1",
      runtime: { type: "docker", settings: {} },
      systemModules: {
        edgeAgent: { type: "docker", settings: { image: definition.runtime.edge_agent.image, createOptions: JSON.stringify(definition.runtime.edge_agent.create_options) }, env: env(definition.runtime.edge_agent.env) },
        edgeHub: { type: "docker", status: "running", restartPolicy: "always", settings: { image: definition.runtime.edge_hub.image, createOptions: JSON.stringify(definition.runtime.edge_hub.create_options) }, env: env(definition.runtime.edge_hub.env) },
      },
      modules: Object.fromEntries(definition.modules.map((module) => [module.name, {
        type: "docker",
        version: "1.0",
        status: module.status,
        restartPolicy: module.restart_policy,
        imagePullPolicy: module.image_pull_policy,
        ...(module.startup_order != null ? { startupOrder: module.startup_order } : {}),
        settings: { image: module.image, createOptions: JSON.stringify(module.create_options) },
        env: env(module.env),
      }])),
    } },
    $edgeHub: { "properties.desired": {
      schemaVersion: "1.1",
      routes: definition.runtime.routes,
      storeAndForwardConfiguration: { timeToLiveSecs: definition.runtime.edge_hub.store_and_forward_ttl_secs },
    } },
  };
  definition.modules.forEach((module) => {
    if (Object.keys(module.desired_properties).length) modulesContent[module.name] = { "properties.desired": module.desired_properties };
  });
  return { modulesContent };
}

function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{action}</div>{children}</section>;
}

function useDeploymentData(id: number) {
  const definitions = useQuery({ queryKey: ["deployment-definitions"], queryFn: edgeConfigApi.getDeploymentDefinitions });
  const versions = useQuery({ queryKey: ["deployment-versions", id], queryFn: () => edgeConfigApi.getDeploymentVersions(id) });
  const deployment = ((definitions.data ?? []) as Deployment[]).find((item) => item.id === id);
  return { definitions, versions, deployment };
}

export function DeploymentDetail() {
  const { deploymentId = "" } = useParams();
  const id = Number(deploymentId);
  const navigate = useNavigate();
  const { definitions, versions, deployment } = useDeploymentData(id);
  if (!Number.isInteger(id) || id < 1) return <ErrorState title="Invalid deployment" />;
  if (definitions.isLoading || versions.isLoading) return <LoadingState label="Loading deployment versions..." />;
  if (definitions.isError || versions.isError) return <ErrorState title="Could not load this deployment" onRetry={() => { void definitions.refetch(); void versions.refetch(); }} />;
  if (!deployment) return <ErrorState title="Deployment not found" />;
  const versionList = (versions.data ?? []) as DeploymentVersion[];
  return (
    <div className="space-y-6 p-1">
      <Button variant="ghost" onClick={() => navigate("/deployments/management")}><ArrowLeft className="mr-2 h-4 w-4" />All definitions</Button>
      <PageTitle title={deployment.name} description={deployment.description || "Deployment definition"} />
      <Section title="Versions" description="Versions are immutable. Change a definition by saving a new version; existing versions remain available.">
        {versionList.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Version</th><th className="p-3">Change note</th><th className="p-3">{deployment.deployment_type === "IOTEDGE" ? "Modules" : "Services"}</th><th className="p-3">Created</th><th className="p-3 text-right">Show</th></tr></thead><tbody>
          {versionList.map((version) => {
            const definition = version.definition as EdgeDefinition | ComposeDefinition;
            const count = deployment.deployment_type === "IOTEDGE"
              ? (definition as EdgeDefinition).modules?.length ?? 0
              : (definition as ComposeDefinition).services?.length ?? 0;
            return <tr key={version.id} className="border-b last:border-0"><td className="p-3 font-semibold">v{version.version}</td><td className="p-3">{version.change_note}</td><td className="p-3">{count || "—"}</td><td className="p-3 whitespace-nowrap">{formatDate(version.created_at)}</td><td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/deployments/management/${id}/versions/${version.version}`)}><Eye className="mr-2 h-4 w-4" />Show</Button></td></tr>;
          })}
        </tbody></table></div> : <p className="py-8 text-center text-sm text-muted-foreground">No versions yet. Create the first version to define modules or services.</p>}
        <div className="flex justify-end"><Button onClick={() => navigate(`/deployments/management/${id}/versions/new`)}><Plus className="mr-2 h-4 w-4" />{versionList.length ? "New version" : "Add version 1"}</Button></div>
      </Section>
    </div>
  );
}

export function DeploymentVersionEditor() {
  const { deploymentId = "" } = useParams();
  const id = Number(deploymentId);
  const { definitions, versions, deployment } = useDeploymentData(id);
  const versionList = (versions.data ?? []) as DeploymentVersion[];
  const isPendingData = definitions.isLoading || versions.isLoading;
  if (!Number.isInteger(id) || id < 1) return <ErrorState title="Invalid deployment" />;
  if (isPendingData) return <LoadingState label="Loading deployment editor..." />;
  if (definitions.isError || versions.isError) return <ErrorState title="Could not load this deployment" onRetry={() => { void definitions.refetch(); void versions.refetch(); }} />;
  if (!deployment) return <ErrorState title="Deployment not found" />;
  return <DeploymentVersionEditorForm key={id} id={id} deployment={deployment} versions={versionList} />;
}

function DeploymentVersionEditorForm({
  id,
  deployment,
  versions,
}: {
  id: number;
  deployment: Deployment;
  versions: DeploymentVersion[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseVersion = versions[0];
  const [edgeDefinition, setEdgeDefinition] = useState<EdgeDefinition>(() =>
    deployment.deployment_type === "IOTEDGE" && baseVersion
      ? baseVersion.definition as EdgeDefinition
      : emptyEdgeDefinition(),
  );
  const [composeDefinition, setComposeDefinition] = useState<ComposeDefinition>(() =>
    deployment.deployment_type === "COMPOSE" && baseVersion
      ? baseVersion.definition as ComposeDefinition
      : emptyComposeDefinition(),
  );
  const [routesText, setRoutesText] = useState(() => {
    const definition = baseVersion?.definition as EdgeDefinition | undefined;
    return deployment.deployment_type === "IOTEDGE"
      ? Object.entries(definition?.runtime?.routes ?? {}).map(([name, route]) => `${name}=${route}`).join("\n")
      : "";
  });
  const [changeNote, setChangeNote] = useState("");
  const [invalidJson, setInvalidJson] = useState<Record<string, boolean>>({});
  const manifest = useMemo(() => edgeManifest(edgeDefinition), [edgeDefinition]);
  const yaml = useMemo(() => composeYaml(composeDefinition.services), [composeDefinition.services]);
  const validityChanged = useCallback((key: string, valid: boolean) => setInvalidJson((current) => {
    if (valid) {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    }
    return { ...current, [key]: true };
  }), []);
  const saveMutation = useMutation({
    mutationFn: () => edgeConfigApi.createDeploymentVersion(id, {
      change_note: changeNote.trim(),
      definition: deployment.deployment_type === "IOTEDGE"
        ? edgeDefinition
        : composeDefinition,
    }),
    onSuccess: async (created: DeploymentVersion) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deployment-definitions"] }),
        queryClient.invalidateQueries({ queryKey: ["deployment-versions", id] }),
      ]);
      toast.success(`Saved ${deployment.name} v${created.version}`);
      navigate(`/deployments/management/${id}`);
    },
    onError: (error) => toast.error(`Could not save this deployment version: ${getErrorMessage(error)}`),
  });
  const isEdge = deployment.deployment_type === "IOTEDGE";
  const nextVersion = (baseVersion?.version ?? 0) + 1;
  const addModule = () => setEdgeDefinition((current) => ({
    ...current,
    modules: [...current.modules, {
      name: "", image: "", env: {}, create_options: {}, desired_properties: {},
      restart_policy: "always", status: "running", image_pull_policy: "on-create", startup_order: null,
    }],
  }));
  const removeModule = (index: number) => {
    setEdgeDefinition((current) => ({ ...current, modules: current.modules.filter((_, position) => position !== index) }));
    setInvalidJson((current) => Object.fromEntries(
      Object.entries(current).flatMap(([key, valid]) => {
        const match = key.match(/^module-(\d+)-(create|desired)$/);
        if (!match) return [[key, valid]];
        const moduleIndex = Number(match[1]);
        if (moduleIndex === index) return [];
        return [[`module-${moduleIndex > index ? moduleIndex - 1 : moduleIndex}-${match[2]}`, valid]];
      }),
    ));
  };
  const addService = () => setComposeDefinition((current) => ({
    ...current,
    services: [...current.services, { ...emptyComposeService(), name: "" }],
  }));
  const setRouteText = (value: string) => {
    setRoutesText(value);
    const routes = Object.fromEntries(value.split("\n").map((line) => {
      const split = line.indexOf("=");
      return split < 0 ? ["", ""] : [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }).filter(([name]) => name));
    setEdgeDefinition((current) => ({ ...current, runtime: { ...current.runtime, routes } }));
  };
  const stableSerialize = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  const unchanged = Boolean(baseVersion && stableSerialize(baseVersion.definition) === stableSerialize(isEdge ? edgeDefinition : composeDefinition));
  const configuredItems = isEdge ? edgeDefinition.modules : composeDefinition.services;
  const hasValidItems = configuredItems.every((item) => item.name.trim() && item.image.trim())
    && new Set(configuredItems.map((item) => item.name.trim())).size === configuredItems.length;
  const canSave = Boolean(changeNote.trim()) && hasValidItems && !Object.keys(invalidJson).length && !unchanged && !saveMutation.isPending;

  return (
    <div className="space-y-6 p-1">
      <Button variant="ghost" onClick={() => navigate(`/deployments/management/${id}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to versions</Button>
      <PageTitle title={`${deployment.name}: new version (v${nextVersion})`} description={baseVersion ? `Starts as a copy of v${baseVersion.version}. Existing versions never change.` : "First version. Add modules or services and configure the deployment."} />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          {isEdge ? <>
            <Section title={`Modules (${edgeDefinition.modules.length})`} description="Configure module images, environment, Docker options, desired properties, and runtime policies." action={<Button variant="outline" size="sm" onClick={addModule}><Plus className="mr-2 h-4 w-4" />Add module</Button>}>
              {edgeDefinition.modules.length ? <div className="space-y-3">{edgeDefinition.modules.map((module, index) => <ModuleEditor key={index} module={module} index={index} onChange={(updated) => setEdgeDefinition((current) => ({ ...current, modules: current.modules.map((item, i) => i === index ? updated : item) }))} onRemove={() => removeModule(index)} onValidityChange={validityChanged} />)}</div> : <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">No modules added yet.</p>}
            </Section>
            <Section title="IoT Edge routes" description="Enter one route per line using name=FROM … INTO … syntax.">
              <Label htmlFor="edge-routes" className="sr-only">Routes</Label>
              <Textarea id="edge-routes" rows={5} className="font-mono text-xs" value={routesText} onChange={(event) => setRouteText(event.target.value)} placeholder={"toCloud=FROM /messages/modules/telegraf/* INTO $upstream"} />
            </Section>
          </> : <Section title={`Services (${composeDefinition.services.length})`} description="Configure Compose service images, environment, ports, volumes, networks, and dependencies." action={<Button variant="outline" size="sm" onClick={addService}><Plus className="mr-2 h-4 w-4" />Add service</Button>}>
            {composeDefinition.services.length ? <div className="space-y-3">{composeDefinition.services.map((service, index) => <ComposeServiceEditor key={index} service={service} index={index} onChange={(updated) => setComposeDefinition((current) => ({ ...current, services: current.services.map((item, i) => i === index ? updated : item) }))} onRemove={() => setComposeDefinition((current) => ({ ...current, services: current.services.filter((_, i) => i !== index) }))} />)}</div> : <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">No services added yet.</p>}
          </Section>}
          <Section title="Save version">
            <div className="space-y-2">
              <Label htmlFor="change-note">What changed? (required)</Label>
              <Input id="change-note" value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="Add Telegraf module 1.3.0" maxLength={2000} />
            </div>
            {unchanged && <p className="text-xs text-amber-700">This version has no content changes from the current version and cannot be saved.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate(`/deployments/management/${id}`)}>Cancel</Button>
              <Button disabled={!canSave} onClick={() => saveMutation.mutate()}><Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? "Saving..." : `Save as v${nextVersion}`}</Button>
            </div>
          </Section>
        </div>
        <Section title={isEdge ? "IoT Edge manifest preview (JSON)" : "docker-compose.yaml preview"} description="Read-only preview generated from the form.">
          <pre className="max-h-[78vh] min-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-200">{isEdge ? JSON.stringify(manifest, null, 2) : yaml}</pre>
        </Section>
      </div>
    </div>
  );
}

export function DeploymentVersionPreview() {
  const { deploymentId = "", version: versionParam = "" } = useParams();
  const id = Number(deploymentId);
  const versionNumber = Number(versionParam);
  const navigate = useNavigate();
  const { definitions, versions, deployment } = useDeploymentData(id);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(versionNumber)) return <ErrorState title="Invalid deployment version" />;
  if (definitions.isLoading || versions.isLoading) return <LoadingState label="Loading deployment version..." />;
  if (definitions.isError || versions.isError) return <ErrorState title="Could not load this version" onRetry={() => { void definitions.refetch(); void versions.refetch(); }} />;
  if (!deployment) return <ErrorState title="Deployment not found" />;
  const selected = ((versions.data ?? []) as DeploymentVersion[]).find((item) => item.version === versionNumber);
  if (!selected) return <ErrorState title="Deployment version not found" />;
  const edge = deployment.deployment_type === "IOTEDGE";
  return (
    <div className="space-y-6 p-1">
      <Button variant="ghost" onClick={() => navigate(`/deployments/management/${id}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to versions</Button>
      <PageTitle title={`${deployment.name} · v${selected.version}`} description={`${selected.change_note} · ${formatDate(selected.created_at)}`} />
      <Section title={edge ? "IoT Edge manifest definition" : "Docker Compose definition"} description={`Content hash: ${selected.content_hash}`}>
        <pre className="max-h-[75vh] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-200">{edge ? JSON.stringify(edgeManifest(selected.definition as EdgeDefinition), null, 2) : composeYaml((selected.definition as ComposeDefinition).services)}</pre>
      </Section>
    </div>
  );
}
