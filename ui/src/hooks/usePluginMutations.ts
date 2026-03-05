import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pluginsApi } from "../api/plugins";
import { queryKeys } from "../lib/queryKeys";
import type { PluginStatus } from "@paperclipai/shared";

export function usePluginMutations(
  companyId: string | null,
  options?: { onDeleteSuccess?: () => void },
) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({ pluginId, newStatus }: { pluginId: string; newStatus: PluginStatus }) =>
      pluginsApi.update(companyId!, pluginId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.list(companyId!) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsApi.remove(companyId!, pluginId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.list(companyId!) });
      options?.onDeleteSuccess?.();
    },
  });

  return { toggleMutation, deleteMutation };
}
