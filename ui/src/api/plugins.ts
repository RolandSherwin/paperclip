import type { Plugin, PluginListItem } from "@paperclipai/shared";
import { api } from "./client";

export const pluginsApi = {
  list: (companyId: string, status?: string) =>
    api.get<PluginListItem[]>(
      `/companies/${companyId}/plugins${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  get: (companyId: string, pluginId: string) =>
    api.get<Plugin>(`/companies/${companyId}/plugins/${pluginId}`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Plugin>(`/companies/${companyId}/plugins`, data),
  update: (companyId: string, pluginId: string, data: Record<string, unknown>) =>
    api.patch<Plugin>(`/companies/${companyId}/plugins/${pluginId}`, data),
  remove: (companyId: string, pluginId: string) =>
    api.delete<void>(`/companies/${companyId}/plugins/${pluginId}`),
  proxy: (
    companyId: string,
    pluginId: string,
    request: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    },
  ) =>
    api.post<{ status: number; headers: Record<string, string>; body: unknown }>(
      `/companies/${companyId}/plugins/${pluginId}/proxy`,
      request,
    ),
};
