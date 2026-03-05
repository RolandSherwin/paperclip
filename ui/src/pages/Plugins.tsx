import { useEffect } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { pluginsApi } from "../api/plugins";
import { queryKeys } from "../lib/queryKeys";
import { usePluginMutations } from "../hooks/usePluginMutations";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Puzzle } from "lucide-react";
export function Plugins() {
  const { selectedCompanyId } = useCompany();
  const { openNewPlugin } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Plugins" }]);
  }, [setBreadcrumbs]);

  const { data: plugins } = useQuery({
    queryKey: queryKeys.plugins.list(selectedCompanyId!, undefined),
    queryFn: () => pluginsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const pendingCount = (plugins ?? []).filter((p) => p.status === "pending_review").length;

  const { toggleMutation, deleteMutation } = usePluginMutations(selectedCompanyId);

  if (!selectedCompanyId) return null;

  if (plugins && plugins.length === 0) {
    return (
      <EmptyState
        icon={Puzzle}
        message="No plugins yet. Create your first plugin to extend Paperclip."
        action="Create your first plugin"
        onAction={() => openNewPlugin()}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Plugins</h1>
        </div>
        <Button size="sm" onClick={() => openNewPlugin()}>
          + New Plugin
        </Button>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <p className="text-sm text-amber-900 dark:text-amber-100 flex-1">
            {pendingCount} plugin{pendingCount > 1 ? "s" : ""} awaiting approval
          </p>
          <Link
            to="/approvals"
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2"
          >
            Review
          </Link>
        </div>
      )}

      <div className="border border-border divide-y divide-border">
        {(plugins ?? []).map((plugin) => (
          <div key={plugin.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Puzzle className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <Link
                  to={`/plugins/${plugin.id}`}
                  className="text-sm font-medium hover:underline text-left"
                >
                  {plugin.name}
                </Link>
                {plugin.description && (
                  <p className="text-xs text-muted-foreground truncate">{plugin.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={plugin.status} />
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
        ))}
      </div>
    </div>
  );
}
