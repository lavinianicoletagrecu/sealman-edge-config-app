import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { edgeConfigApi } from "@/api/edgeConfig/edgeConfigApi";

type MaintenanceModeResponse = {
  device_id: string;
  maintenance_mode: boolean;
};

export default function MaintenanceMode({
  deviceId,
  canEdit,
}: {
  deviceId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const modeQuery = useQuery({
    queryKey: ["device-maintenance-mode", deviceId],
    queryFn: () => edgeConfigApi.getDeviceMaintenanceMode(deviceId),
    enabled: Boolean(deviceId),
  });
  const mode = modeQuery.data as MaintenanceModeResponse | undefined;
  const updateMutation = useMutation({
    mutationFn: (maintenanceMode: boolean) =>
      edgeConfigApi.setDeviceMaintenanceMode(deviceId, maintenanceMode),
    onSuccess: async (_result, maintenanceMode) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["device-maintenance-mode", deviceId],
        }),
        queryClient.invalidateQueries({ queryKey: ["device-maintenance-modes"] }),
        queryClient.invalidateQueries({
          queryKey: ["deployment-target-rule-values"],
        }),
        queryClient.invalidateQueries({ queryKey: ["deployment-target-rules"] }),
      ]);
      setConfirmOpen(false);
      toast.success(
        maintenanceMode
          ? "Maintenance mode enabled"
          : "Maintenance mode disabled",
      );
    },
    onError: () => toast.error("Could not update maintenance mode"),
  });

  const nextMode = !mode?.maintenance_mode;

  return (
    <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-yellow-200 bg-yellow-50/70 p-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-yellow-950">Maintenance mode</h2>
          {mode?.maintenance_mode && (
            <Badge className="border-yellow-300 bg-yellow-100 text-yellow-900">
              On
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-yellow-900/80">
          {mode?.maintenance_mode
            ? "Target rules will mark this device as skipped while maintenance mode is on."
            : "Enable this to skip the device in future target-rule deployments."}
          {" "}Running applications are not stopped.
        </p>
        {modeQuery.isError && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            Could not load this device's maintenance mode.
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        className="border-yellow-400 bg-yellow-100 text-yellow-950 hover:bg-yellow-200"
        disabled={!canEdit || modeQuery.isLoading || modeQuery.isError || updateMutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        <Wrench className="mr-2 h-4 w-4" />
        {updateMutation.isPending
          ? "Saving..."
          : mode?.maintenance_mode
            ? "Turn maintenance mode off"
            : "Set maintenance mode"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nextMode ? "Set maintenance mode?" : "Turn maintenance mode off?"}
            </DialogTitle>
            <DialogDescription>
              {nextMode
                ? `Enable maintenance mode for device ${deviceId}? It will be shown as skipped in matching target rules and excluded from new deployment execution snapshots. Existing applications will keep running.`
                : `Disable maintenance mode for device ${deviceId}? Matching target rules may include it in future deployment executions.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-yellow-600 text-white hover:bg-yellow-700"
              onClick={() => updateMutation.mutate(nextMode)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
