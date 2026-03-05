import { useEffect } from "react";
import { Link, useNavigate, useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { pluginsApi } from "../api/plugins";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { PluginPanel } from "../components/PluginPanel";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Puzzle } from "lucide-react";
import { timeAgo } from "../lib/timeAgo";
import type { PluginManifest } from "@paperclipai/shared";
import { usePluginMutations } from "../hooks/usePluginMutations";

export function PluginDetail() {
  const { pluginId } = useParams<{ pluginId: string }>();
  const { selectedCompanyId } = useCompany();
  const { openNewPlugin } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const { data: plugin, isLoading } = useQuery({
    queryKey: queryKeys.plugins.detail(selectedCompanyId!, pluginId!),
    queryFn: () => pluginsApi.get(selectedCompanyId!, pluginId!),
    enabled: !!selectedCompanyId && !!pluginId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const manifest = (plugin?.manifest ?? null) as PluginManifest | null;
  const creatorAgent = agents?.find((a) => a.id === plugin?.createdByAgentId);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Plugins", href: "/plugins" },
      { label: plugin?.name ?? pluginId ?? "Plugin" },
    ]);
  }, [setBreadcrumbs, plugin?.name, pluginId]);

  const { toggleMutation, deleteMutation } = usePluginMutations(selectedCompanyId, {
    onDeleteSuccess: () => navigate("/plugins"),
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (!plugin) return <p className="text-sm text-muted-foreground">Plugin not found.</p>;

  const permissions = manifest?.permissions;
  const hasPermissions =
    (permissions?.paperclip && permissions.paperclip.length > 0) ||
    (permissions?.externalHosts && permissions.externalHosts.length > 0) ||
    (permissions?.secrets && permissions.secrets.length > 0);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{plugin.name}</h1>
          <StatusBadge status={plugin.status} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openNewPlugin({
              pluginId: plugin.id,
              name: plugin.name,
              description: plugin.description ?? "",
              assignedAgentId: plugin.createdByAgentId ?? undefined,
            })}
          >
            Edit
          </Button>
          {plugin.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleMutation.mutate({ pluginId: plugin.id, newStatus: "disabled" })}
            >
              Disable
            </Button>
          )}
          {plugin.status === "disabled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleMutation.mutate({ pluginId: plugin.id, newStatus: "active" })}
            >
              Enable
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (!window.confirm(`Delete plugin "${plugin.name}"?`)) return;
              deleteMutation.mutate(plugin.id);
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Description & metadata */}
      {(plugin.description || creatorAgent) && (
        <div className="space-y-2">
          {plugin.description && (
            <p className="text-sm text-muted-foreground">{plugin.description}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {creatorAgent && (
              <>
                <span>Created by</span>
                <Link to={`/agents/${creatorAgent.id}`} className="hover:underline">
                  <Identity name={creatorAgent.name} size="sm" />
                </Link>
                <span>·</span>
              </>
            )}
            <span>{timeAgo(plugin.createdAt)}</span>
            {plugin.approvalId && (
              <>
                <span>·</span>
                <Link
                  to={`/approvals/${plugin.approvalId}`}
                  className="hover:text-foreground underline underline-offset-2"
                >
                  View approval
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Permissions */}
      {hasPermissions && (
        <div className="border border-border rounded-lg p-4 space-y-2">
          {permissions!.paperclip && permissions!.paperclip.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground shrink-0 pt-0.5">Data access</span>
              <div className="flex flex-wrap gap-1">
                {permissions!.paperclip.map((entity) => (
                  <span key={entity} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
                    {entity}
                  </span>
                ))}
              </div>
            </div>
          )}
          {permissions!.externalHosts && permissions!.externalHosts.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground shrink-0 pt-0.5">External hosts</span>
              <div className="flex flex-wrap gap-1">
                {permissions!.externalHosts.map((host) => (
                  <span key={host} className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-2 py-0.5 text-xs font-mono">
                    {host}
                  </span>
                ))}
              </div>
            </div>
          )}
          {permissions!.secrets && permissions!.secrets.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground shrink-0 pt-0.5">Secrets</span>
              <div className="flex flex-wrap gap-1">
                {permissions!.secrets.map((secret) => (
                  <span key={secret} className="inline-flex items-center rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 px-2 py-0.5 text-xs font-mono">
                    {secret}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plugin content */}
      {plugin.status === "active" && (
        <PluginPanel pluginId={plugin.id} />
      )}
    </div>
  );
}
