import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import PageTitle from "@/components/Typography/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { edgeConfigApi } from "@/api/edgeConfig/edgeConfigApi";

type DeviceMaintenanceMode = {
  device_id: string;
  device_type: string;
  metadata: Record<string, unknown>;
  maintenance_mode: boolean;
};

export default function MaintenanceModePage() {
  const [search, setSearch] = useState("");
  const devicesQuery = useQuery({
    queryKey: ["device-maintenance-modes"],
    queryFn: edgeConfigApi.getDeviceMaintenanceModes,
  });
  const devices = (devicesQuery.data ?? []) as DeviceMaintenanceMode[];
  const visibleDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return devices.filter((device) =>
      !query || [
        device.device_id,
        device.device_type,
        String(device.metadata.customer ?? ""),
        String(device.metadata.site ?? ""),
        String(device.metadata.name ?? ""),
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [devices, search]);

  if (devicesQuery.isLoading) return <LoadingState label="Loading maintenance mode devices..." />;
  if (devicesQuery.isError) {
    return (
      <ErrorState
        title="Could not load maintenance mode devices"
        message="Check your connection and permissions, then try again."
        onRetry={() => { void devicesQuery.refetch(); }}
      />
    );
  }

  const enabledCount = devices.filter((device) => device.maintenance_mode).length;

  return (
    <div className="space-y-6 p-1">
      <PageTitle
        title="Maintenance mode"
        description={`${enabledCount} of ${devices.length} devices currently excluded from new target-rule executions.`}
      />
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-yellow-50 to-white px-5 py-4">
          <div>
            <h2 className="font-semibold">Devices</h2>
            <p className="mt-1 text-sm text-muted-foreground">Maintenance mode does not stop applications already running on a device.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search devices" aria-label="Search maintenance mode devices" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Device</TableHead>
              <TableHead>Customer / site</TableHead>
              <TableHead>Device type</TableHead>
              <TableHead>Maintenance mode</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleDevices.map((device) => (
              <TableRow key={device.device_id}>
                <TableCell className="font-mono text-xs font-medium">{device.device_id}</TableCell>
                <TableCell>{String(device.metadata.customer ?? device.metadata.site ?? device.metadata.name ?? "—")}</TableCell>
                <TableCell>{device.device_type}</TableCell>
                <TableCell>
                  {device.maintenance_mode
                    ? <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-900">On</Badge>
                    : <Badge variant="outline">Off</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {!visibleDevices.length && (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  {devices.length ? "No devices match that search." : "No visible devices are available."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
