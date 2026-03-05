import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { plugins } from "@paperclipai/db";
import { badRequest, forbidden, notFound } from "../errors.js";
import { secretService } from "./secrets.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-fA-F:]+\]?$/;

const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "etag",
  "last-modified",
  "cache-control",
  "x-request-id",
]);

export function pluginService(db: Db) {
  return {
    list: (companyId: string, status?: string) => {
      const conditions = [eq(plugins.companyId, companyId)];
      if (status) conditions.push(eq(plugins.status, status));
      return db
        .select({
          id: plugins.id,
          companyId: plugins.companyId,
          name: plugins.name,
          description: plugins.description,
          source: plugins.source,
          status: plugins.status,
          createdByAgentId: plugins.createdByAgentId,
          manifest: plugins.manifest,
          uiHtmlSha256: plugins.uiHtmlSha256,
          approvalId: plugins.approvalId,
          createdAt: plugins.createdAt,
          updatedAt: plugins.updatedAt,
        })
        .from(plugins)
        .where(and(...conditions));
    },

    getById: (id: string) =>
      db
        .select()
        .from(plugins)
        .where(eq(plugins.id, id))
        .then((rows) => rows[0] ?? null),

    create: (
      companyId: string,
      data: {
        name: string;
        description?: string | null;
        source: string;
        createdByAgentId?: string | null;
        manifest: Record<string, unknown>;
        uiHtml: string;
        approvalId?: string | null;
      },
    ) =>
      db
        .insert(plugins)
        .values({
          companyId,
          name: data.name,
          description: data.description ?? null,
          source: data.source,
          status: "pending_review",
          createdByAgentId: data.createdByAgentId ?? null,
          manifest: data.manifest,
          uiHtml: data.uiHtml,
          uiHtmlSha256: sha256(data.uiHtml),
          approvalId: data.approvalId ?? null,
        })
        .returning()
        .then((rows) => rows[0]),

    update: async (
      id: string,
      data: {
        status?: string;
        uiHtml?: string;
        manifest?: Record<string, unknown>;
      },
    ) => {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (data.status !== undefined) set.status = data.status;
      if (data.manifest) set.manifest = data.manifest;
      if (data.uiHtml !== undefined) {
        set.uiHtml = data.uiHtml;
        set.uiHtmlSha256 = sha256(data.uiHtml);
        // Reset to pending_review when HTML changes
        if (data.status === undefined) set.status = "pending_review";
      }

      const result = await db
        .update(plugins)
        .set(set)
        .where(eq(plugins.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
      if (!result) throw notFound("Plugin not found");
      return result;
    },

    remove: (id: string) =>
      db
        .delete(plugins)
        .where(eq(plugins.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),
  };
}

export async function proxyExternalRequest(
  db: Db,
  pluginId: string,
  request: { url: string; method?: string; headers?: Record<string, string>; body?: unknown },
) {
  const plugin = await db
    .select()
    .from(plugins)
    .where(eq(plugins.id, pluginId))
    .then((rows) => rows[0] ?? null);
  if (!plugin) throw notFound("Plugin not found");

  const manifest = plugin.manifest as Record<string, unknown>;
  const permissions = (manifest.permissions ?? {}) as Record<string, unknown>;
  const externalHosts: string[] = Array.isArray(permissions.externalHosts)
    ? permissions.externalHosts.filter((h): h is string => typeof h === "string")
    : [];

  // Parse and validate URL
  let parsed: URL;
  try {
    parsed = new URL(request.url);
  } catch {
    throw badRequest("Invalid URL");
  }

  if (parsed.protocol !== "https:") {
    throw forbidden("Only HTTPS URLs are allowed");
  }

  if (IP_RE.test(parsed.hostname)) {
    throw forbidden("IP addresses are not allowed");
  }

  if (!externalHosts.includes(parsed.hostname)) {
    throw forbidden(`Host ${parsed.hostname} is not in plugin's allowed external hosts`);
  }

  // Resolve secret placeholders in headers and body
  const secretSvc = secretService(db);
  const resolvedHeaders = await resolveSecretPlaceholders(
    secretSvc,
    plugin.companyId,
    request.headers ?? {},
  );
  let resolvedBody = request.body;
  if (typeof resolvedBody === "string") {
    resolvedBody = await resolveStringPlaceholders(secretSvc, plugin.companyId, resolvedBody);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const fetchOpts: RequestInit = {
      method: request.method ?? "GET",
      headers: resolvedHeaders,
      signal: controller.signal,
      redirect: "manual",
    };

    if (resolvedBody !== undefined && request.method !== "GET") {
      fetchOpts.body = typeof resolvedBody === "string" ? resolvedBody : JSON.stringify(resolvedBody);
    }

    const resp = await fetch(request.url, fetchOpts);

    // Validate redirect Location header against allowed hosts
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (location) {
        try {
          const redirectUrl = new URL(location, request.url);
          if (!externalHosts.includes(redirectUrl.hostname)) {
            throw forbidden(`Redirect to disallowed host: ${redirectUrl.hostname}`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Redirect to disallowed")) throw e;
          throw badRequest("Invalid redirect location");
        }
      }
    }

    // Extract safe headers
    const safeHeaders: Record<string, string> = {};
    for (const key of SAFE_RESPONSE_HEADERS) {
      const val = resp.headers.get(key);
      if (val) safeHeaders[key] = val;
    }

    const body = await resp.text();

    return {
      status: resp.status,
      headers: safeHeaders,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

type SecretSvc = ReturnType<typeof secretService>;

async function resolveSecretPlaceholders(
  secretSvc: SecretSvc,
  companyId: string,
  headers: Record<string, string>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = await resolveStringPlaceholders(secretSvc, companyId, value);
  }
  return result;
}

async function resolveStringPlaceholders(
  secretSvc: SecretSvc,
  companyId: string,
  input: string,
): Promise<string> {
  const regex = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
  const matches = [...input.matchAll(regex)];
  if (matches.length === 0) return input;

  // Batch unique secret names to eliminate duplicate lookups
  const uniqueNames = [...new Set(matches.map((m) => m[1]))];
  const resolved = new Map<string, string>();

  for (const name of uniqueNames) {
    const secret = await secretSvc.getByName(companyId, name);
    if (!secret) throw badRequest(`Secret not found: ${name}`);
    const value = await secretSvc.resolveValue(companyId, secret.id, "latest");
    resolved.set(name, value);
  }

  let result = input;
  for (const match of matches) {
    result = result.replace(match[0], resolved.get(match[1])!);
  }

  return result;
}
