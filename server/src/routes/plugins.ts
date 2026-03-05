import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createPluginSchema,
  updatePluginSchema,
  pluginProxyRequestSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  pluginService,
  approvalService,
  logActivity,
  publishLiveEvent,
} from "../services/index.js";
import { proxyExternalRequest } from "../services/plugins.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { forbidden, notFound } from "../errors.js";

type PluginSvc = ReturnType<typeof pluginService>;
type ApprovalSvc = ReturnType<typeof approvalService>;

async function createPluginReviewApproval(
  approvalsSvc: ApprovalSvc,
  svc: PluginSvc,
  companyId: string,
  actorId: string,
  plugin: { id: string; name: string; manifest: unknown },
) {
  const approval = await approvalsSvc.create(companyId, {
    type: "plugin_review",
    payload: {
      pluginId: plugin.id,
      pluginName: plugin.name,
      manifest: plugin.manifest,
    },
    requestedByAgentId: actorId,
    requestedByUserId: null,
    status: "pending",
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
    updatedAt: new Date(),
  });

  await svc.update(plugin.id, { approvalId: approval.id });
}

export function pluginRoutes(db: Db) {
  const router = Router();
  const svc = pluginService(db);
  const approvalsSvc = approvalService(db);

  // List plugins for a company
  router.get("/companies/:companyId/plugins", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const status = req.query.status as string | undefined;
    const result = await svc.list(companyId, status);
    res.json(result);
  });

  // Create a plugin
  router.post(
    "/companies/:companyId/plugins",
    validate(createPluginSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);

      const source = actor.actorType === "agent" ? "agent_created" : "manual";
      const plugin = await svc.create(companyId, {
        name: req.body.name,
        description: req.body.description ?? null,
        source,
        createdByAgentId: actor.agentId,
        manifest: req.body.manifest,
        uiHtml: req.body.uiHtml,
      });

      if (actor.actorType === "agent") {
        await createPluginReviewApproval(
          approvalsSvc, svc, companyId, actor.actorId, plugin,
        );
      }

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "plugin.created",
        entityType: "plugin",
        entityId: plugin.id,
        details: { name: plugin.name, source },
      });

      publishLiveEvent({
        companyId,
        type: "plugin.created",
        payload: { pluginId: plugin.id, name: plugin.name, source },
      });

      res.status(201).json(plugin);
    },
  );

  // Get a plugin by id
  router.get("/companies/:companyId/plugins/:pluginId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const plugin = await svc.getById(req.params.pluginId as string);
    if (!plugin) throw notFound("Plugin not found");
    res.json(plugin);
  });

  // Update a plugin
  router.patch(
    "/companies/:companyId/plugins/:pluginId",
    validate(updatePluginSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const pluginId = req.params.pluginId as string;

      // Agents cannot change plugin status directly — must go through approval
      if (actor.actorType === "agent" && req.body.status !== undefined) {
        throw forbidden("Agents cannot change plugin status directly");
      }

      // Agents can only update their own plugins
      if (actor.actorType === "agent") {
        const existing = await svc.getById(pluginId);
        if (!existing) throw notFound("Plugin not found");
        if (existing.createdByAgentId !== actor.actorId) {
          throw forbidden("Agents can only update plugins they created");
        }
      }

      const updated = await svc.update(pluginId, req.body);

      if (actor.actorType === "agent") {
        await createPluginReviewApproval(
          approvalsSvc, svc, companyId, actor.actorId, updated,
        );
      }

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "plugin.updated",
        entityType: "plugin",
        entityId: pluginId,
        details: { changes: Object.keys(req.body) },
      });

      if (req.body.status !== undefined) {
        publishLiveEvent({
          companyId,
          type: "plugin.status",
          payload: { pluginId, status: updated.status },
        });
      }

      res.json(updated);
    },
  );

  // Delete a plugin
  router.delete("/companies/:companyId/plugins/:pluginId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const pluginId = req.params.pluginId as string;

    const deleted = await svc.remove(pluginId);
    if (!deleted) throw notFound("Plugin not found");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "plugin.deleted",
      entityType: "plugin",
      entityId: pluginId,
      details: { name: deleted.name },
    });

    res.json({ ok: true });
  });

  // Proxy external request for a plugin
  router.post(
    "/companies/:companyId/plugins/:pluginId/proxy",
    validate(pluginProxyRequestSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertBoard(req);
      assertCompanyAccess(req, companyId);
      const pluginId = req.params.pluginId as string;

      const result = await proxyExternalRequest(db, pluginId, req.body);
      res.json(result);
    },
  );

  return router;
}
