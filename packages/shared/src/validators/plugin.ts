import { z } from "zod";
import { PLUGIN_STATUSES } from "../constants.js";

export const pluginManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  slot: z.string().min(1),
  size: z
    .object({
      minHeight: z.number().positive().optional(),
    })
    .optional(),
  permissions: z.object({
    paperclip: z.array(z.string()).optional(),
    externalHosts: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
  }),
});

export type PluginManifestInput = z.infer<typeof pluginManifestSchema>;

export const createPluginSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  manifest: pluginManifestSchema,
  uiHtml: z.string().max(512 * 1024),
});

export type CreatePlugin = z.infer<typeof createPluginSchema>;

export const updatePluginSchema = z.object({
  status: z.enum(PLUGIN_STATUSES).optional(),
  uiHtml: z.string().max(512 * 1024).optional(),
  manifest: pluginManifestSchema.optional(),
});

export type UpdatePlugin = z.infer<typeof updatePluginSchema>;

export const pluginProxyRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

export type PluginProxyRequest = z.infer<typeof pluginProxyRequestSchema>;
