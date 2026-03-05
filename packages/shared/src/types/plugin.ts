import type { PluginStatus, PluginSource } from "../constants.js";

export interface PluginManifest {
  name: string;
  description: string;
  version: string;
  slot: string;
  size?: { minHeight?: number };
  permissions: {
    paperclip?: string[];
    externalHosts?: string[];
    secrets?: string[];
  };
}

export interface Plugin {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  source: PluginSource;
  status: PluginStatus;
  createdByAgentId: string | null;
  manifest: PluginManifest;
  uiHtml: string;
  uiHtmlSha256: string;
  approvalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PluginListItem = Omit<Plugin, "uiHtml">;
