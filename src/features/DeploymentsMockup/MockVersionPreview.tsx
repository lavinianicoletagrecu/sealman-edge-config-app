import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MockPage, Section, TypeBadge } from "./components"
import { manifestForVersion, useMockStore, type MockComposeService, type MockDefinition, type MockModule } from "./mockData"

function KeyValues({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values)
  if (!entries.length) return <span className="text-sm text-muted-foreground">None</span>
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded bg-gray-50 px-2 py-1">
          <dt className="text-xs text-muted-foreground">{key}</dt>
          <dd className="break-all font-mono text-xs">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function ModulePreview({ module }: { module: MockModule }) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <h3 className="font-medium">{module.name || "Unnamed module"}</h3>
        <p className="break-all font-mono text-xs text-muted-foreground">{module.image}</p>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p><span className="text-muted-foreground">Status:</span> {module.status}</p>
        <p><span className="text-muted-foreground">Restart:</span> {module.restart_policy}</p>
        <p><span className="text-muted-foreground">Image pull:</span> {module.image_pull_policy}</p>
        <p><span className="text-muted-foreground">Startup order:</span> {module.startup_order ?? "–"}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Environment</p>
        <KeyValues values={module.env} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Create options</p>
        <KeyValues values={module.create_options} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Desired properties</p>
        <KeyValues values={module.desired_properties} />
      </div>
    </div>
  )
}

function ComposeServicePreview({ service }: { service: MockComposeService }) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <h3 className="font-medium">{service.name || "Unnamed service"}</h3>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {service.image}{service.version && `:${service.version}`}
        </p>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p><span className="text-muted-foreground">Restart:</span> {service.restart || "–"}</p>
        <p><span className="text-muted-foreground">Command:</span> {service.command || "–"}</p>
        <p><span className="text-muted-foreground">Ports:</span> {service.ports.join(", ") || "–"}</p>
        <p><span className="text-muted-foreground">Volumes:</span> {service.volumes.join(", ") || "–"}</p>
        <p><span className="text-muted-foreground">Networks:</span> {service.networks.join(", ") || "–"}</p>
        <p><span className="text-muted-foreground">Depends on:</span> {service.depends_on.join(", ") || "–"}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Environment</p>
        <KeyValues values={service.env} />
      </div>
    </div>
  )
}

function IoTEdgeForm({ definition }: { definition: MockDefinition }) {
  return (
    <div className="space-y-4">
      <Section title={`Modules (${definition.modules.length})`}>
        <div className="space-y-3">
          {definition.modules.map((module, index) => <ModulePreview key={`${module.name}-${index}`} module={module} />)}
          {!definition.modules.length && <p className="text-sm text-muted-foreground">No application modules.</p>}
        </div>
      </Section>
      <Section title="IoT Edge options">
        <div className="space-y-3">
          <div>
            <h3 className="mb-1 text-xs font-medium">Routes</h3>
            <KeyValues values={definition.runtime.routes} />
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">Edge agent image:</span> {definition.runtime.edge_agent.image}</p>
            <p><span className="text-muted-foreground">Edge hub image:</span> {definition.runtime.edge_hub.image}</p>
            <p><span className="text-muted-foreground">Store and forward TTL:</span> {definition.runtime.edge_hub.store_and_forward_ttl_secs}s</p>
          </div>
        </div>
      </Section>
    </div>
  )
}

export default function MockVersionPreview() {
  const { deploymentId, version: versionParam } = useParams()
  const navigate = useNavigate()
  const deployment = useMockStore((store) => store.deployments.find((item) => item.id === deploymentId))
  const version = deployment?.versions.find((item) => String(item.version) === versionParam)

  if (!deployment || !version) return <MockPage title="Not found">Unknown deployment version.</MockPage>

  const isEdge = deployment.type === "IOTEDGE"
  const unsynced = isEdge ? version.manifest_override !== undefined : version.compose_yaml_override === true
  const file = isEdge ? manifestForVersion(version) : version.compose_yaml

  return (
    <MockPage
      title={
        <span className="flex items-center gap-2">
          {deployment.name} v{version.version} <TypeBadge type={deployment.type} />
        </span>
      }
      subtitle={`${version.change_note} · Created by ${version.created_by_name}`}
      crumbs={[
        { label: "Deployments", to: "/mockups/deployments" },
        { label: deployment.name, to: `/mockups/deployments/${deployment.id}` },
        { label: `Version ${version.version}`, to: `/mockups/deployments/${deployment.id}/versions/${version.version}` },
      ]}
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => navigate(`/mockups/deployments/${deployment.id}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/mockups/deployments/${deployment.id}/versions/new`)}>
            <Pencil className="mr-1 h-4 w-4" />
            Create new version
          </Button>
        </>
      }
    >
      {unsynced && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          The form values are shown for reference. The edited {isEdge ? "manifest" : "Compose YAML"} on the right is authoritative.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={`space-y-4 ${unsynced ? "opacity-60 grayscale" : ""}`}>
          {isEdge ? (
            version.definition ? (
              <IoTEdgeForm definition={version.definition} />
            ) : (
              <Section title="Form values"><p className="text-sm text-muted-foreground">No form values were saved for this version.</p></Section>
            )
          ) : version.compose_services ? (
            <Section title={`Services (${version.compose_services.length})`}>
              <div className="space-y-3">
                {version.compose_services.map((service, index) => (
                  <ComposeServicePreview key={`${service.name}-${index}`} service={service} />
                ))}
              </div>
            </Section>
          ) : (
            <Section title="Form values"><p className="text-sm text-muted-foreground">No form values were saved for this version.</p></Section>
          )}
        </div>
        <Section
          title={isEdge ? "Manifest" : "docker-compose.yaml"}
          description={unsynced ? "This saved file takes precedence over the form values." : "Generated from the saved form values."}
        >
          <pre className="max-h-[75vh] min-h-96 overflow-auto rounded bg-gray-950 p-4 text-xs text-green-200">
            {typeof file === "string" ? file : JSON.stringify(file, null, 2) ?? "No file content saved."}
          </pre>
        </Section>
      </div>
    </MockPage>
  )
}
