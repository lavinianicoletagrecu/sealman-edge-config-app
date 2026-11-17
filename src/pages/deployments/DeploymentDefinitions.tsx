import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Eye, Layers3, Pencil, Plus } from "lucide-react";
import { toast } from "react-toastify";
import PageTitle from "@/components/Typography/PageTitle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { edgeConfigApi } from "@/api/edgeConfig/edgeConfigApi";

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

const typeLabels: Record<DeploymentType, string> = {
  IOTEDGE: "IoT Edge · IoT Hub",
  COMPOSE: "Docker Compose",
};

export default function DeploymentDefinitions() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deployment | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<DeploymentType>("IOTEDGE");

  const definitionsQuery = useQuery({
    queryKey: ["deployment-definitions"],
    queryFn: edgeConfigApi.getDeploymentDefinitions,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), description: description.trim() || null, deployment_type: type };
      return editing
        ? edgeConfigApi.updateDeploymentDefinition(editing.id, payload)
        : edgeConfigApi.createDeploymentDefinition(payload);
    },
    onSuccess: async (created: Deployment) => {
      await queryClient.invalidateQueries({ queryKey: ["deployment-definitions"] });
      toast.success(editing ? "Deployment definition updated" : "Deployment definition created");
      closeDialog();
      if (!editing) navigate(`/deployments/management/${created.id}/versions/new`);
    },
    onError: () => toast.error("Could not save the deployment definition"),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setName("");
    setDescription("");
    setType("IOTEDGE");
  };

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setType("IOTEDGE");
    setDialogOpen(true);
  };

  const openEdit = (deployment: Deployment) => {
    setEditing(deployment);
    setName(deployment.name);
    setDescription(deployment.description ?? "");
    setType(deployment.deployment_type);
    setDialogOpen(true);
  };

  if (definitionsQuery.isLoading) return <LoadingState label="Loading deployment definitions..." />;
  if (definitionsQuery.isError) {
    return <ErrorState title="Could not load deployment definitions" message="Check your connection and permissions, then try again." onRetry={() => definitionsQuery.refetch()} />;
  }

  const deployments = (definitionsQuery.data ?? []) as Deployment[];

  return (
    <div className="space-y-6 p-1">
      <PageTitle
        title="Deployment Definitions"
        description="Create and maintain reusable IoT Edge and Docker Compose deployment definitions."
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-slate-50 to-white px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">Definitions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {deployments.length} deployment{deployments.length === 1 ? "" : "s"} configured
            </p>
          </div>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />New deployment</Button>
        </div>

        {deployments.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Versions</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell className="font-semibold">{deployment.name}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${deployment.deployment_type === "IOTEDGE" ? "bg-blue-50 text-blue-800" : "bg-violet-50 text-violet-800"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${deployment.deployment_type === "IOTEDGE" ? "bg-blue-500" : "bg-violet-500"}`} />
                      {typeLabels[deployment.deployment_type]}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-lg text-muted-foreground">{deployment.description || "—"}</TableCell>
                  <TableCell>
                    {deployment.version_count
                      ? <span className="text-sm">v{deployment.latest_version} <span className="text-muted-foreground">({deployment.version_count} total)</span></span>
                      : <span className="text-sm text-muted-foreground">No versions yet</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(deployment.created_at))}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label={`View versions for ${deployment.name}`} onClick={() => navigate(`/deployments/management/${deployment.id}`)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Edit ${deployment.name}`} onClick={() => openEdit(deployment)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Layers3 className="h-7 w-7" />
            </span>
            <h3 className="font-semibold">No deployment definitions yet</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Create a definition to start organizing the configurations you’ll later pair with target rules.
            </p>
            <Button className="mt-5" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Create your first deployment</Button>
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit deployment definition" : "Create deployment definition"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the name, deployment type, or description." : "Choose a deployment format and give this definition a clear name."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Deployment type</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["IOTEDGE", "COMPOSE"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => value === "IOTEDGE" && setType(value)}
                    disabled={value === "COMPOSE" || Boolean(editing?.version_count)}
                    title={value === "COMPOSE" ? "Docker Compose deployments are not available yet" : undefined}
                    className={`rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${type === value ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500" : "hover:bg-muted/40"}`}
                  >
                    <span className="font-medium">{typeLabels[value]}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {value === "IOTEDGE" ? "Azure IoT Edge deployment manifest" : "Not available yet"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deployment-name">Name</Label>
              <Input id="deployment-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. line-monitoring" maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deployment-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="deployment-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this deployment intended for?" rows={3} maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button disabled={!name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save changes" : "Create definition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
