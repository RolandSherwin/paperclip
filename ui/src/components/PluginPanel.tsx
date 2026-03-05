import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { pluginsApi } from "../api/plugins";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { costsApi } from "../api/costs";
import { queryKeys } from "../lib/queryKeys";
import type { PluginManifest } from "@paperclipai/shared";

const BRIDGE_SCRIPT = `
<script>
(function() {
  var pendingCallbacks = new Map();
  var callId = 0;

  function sendRequest(type, payload) {
    return new Promise(function(resolve, reject) {
      var id = ++callId;
      pendingCallbacks.set(id, { resolve: resolve, reject: reject });
      parent.postMessage({ type: type, id: id, payload: payload }, "*");
    });
  }

  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "paperclip_response") {
      var cb = pendingCallbacks.get(e.data.id);
      if (cb) {
        pendingCallbacks.delete(e.data.id);
        if (e.data.error) cb.reject(new Error(e.data.error));
        else cb.resolve(e.data.result);
      }
    }
    if (e.data && e.data.type === "paperclip_event") {
      var handlers = eventHandlers.get(e.data.eventType) || [];
      handlers.forEach(function(fn) { try { fn(e.data.payload); } catch(err) { console.error(err); } });
    }
    if (e.data && e.data.type === "paperclip_context") {
      window.paperclip.context = e.data.context;
    }
  });

  var eventHandlers = new Map();

  window.paperclip = {
    query: function(entityType, filters) {
      return sendRequest("query", { entityType: entityType, filters: filters });
    },
    fetch: function(url, options) {
      return sendRequest("fetch", { url: url, options: options });
    },
    context: {},
    on: function(eventType, callback) {
      if (!eventHandlers.has(eventType)) eventHandlers.set(eventType, []);
      eventHandlers.get(eventType).push(callback);
    }
  };
})();
</script>
`;

interface PluginPanelProps {
  pluginId: string;
}

export function PluginPanel({ pluginId }: PluginPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { selectedCompanyId } = useCompany();

  const { data: plugin } = useQuery({
    queryKey: queryKeys.plugins.detail(selectedCompanyId!, pluginId),
    queryFn: () => pluginsApi.get(selectedCompanyId!, pluginId),
    enabled: !!selectedCompanyId,
  });

  const manifest = (plugin?.manifest ?? null) as PluginManifest | null;

  const allowedEntities = useMemo(
    () => new Set(manifest?.permissions?.paperclip ?? []),
    [manifest?.permissions?.paperclip],
  );

  const srcdoc = useMemo(
    () =>
      plugin?.uiHtml
        ? `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;">
${BRIDGE_SCRIPT}
</head><body>
${plugin.uiHtml}
</body></html>`
        : null,
    [plugin?.uiHtml],
  );

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (!selectedCompanyId) return;

      const { type, id, payload } = event.data;

      const respond = (result: unknown) => {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "paperclip_response", id, result },
          "*",
        );
      };
      const respondError = (err: string) => {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "paperclip_response", id, error: err },
          "*",
        );
      };

      try {
        if (type === "query") {
          const { entityType, filters } = payload;
          if (!allowedEntities.has(entityType)) {
            respondError(`Entity type "${entityType}" not declared in plugin manifest`);
            return;
          }
          let result: unknown;
          if (entityType === "issues") result = await issuesApi.list(selectedCompanyId, filters);
          else if (entityType === "agents") result = await agentsApi.list(selectedCompanyId);
          else if (entityType === "costs")
            result = await costsApi.summary(selectedCompanyId);
          else {
            respondError(`Unknown entity type: ${entityType}`);
            return;
          }
          respond(result);
        } else if (type === "fetch") {
          const { url, options } = payload;
          const result = await pluginsApi.proxy(selectedCompanyId, pluginId, {
            url,
            ...options,
          });
          respond(result);
        }
      } catch (err) {
        respondError(err instanceof Error ? err.message : "Request failed");
      }
    },
    [selectedCompanyId, pluginId, allowedEntities],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleLoad = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "paperclip_context",
        context: { companyId: selectedCompanyId, pluginId, theme: "light" },
      },
      "*",
    );
  }, [selectedCompanyId, pluginId]);

  if (!plugin || !manifest || !srcdoc) {
    return <div className="border border-border rounded-lg p-4 animate-pulse h-[300px]" />;
  }

  const minHeight = manifest.size?.minHeight ?? 300;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-sm font-medium">{manifest.name || plugin.name}</span>
        {manifest.description && (
          <span className="text-xs text-muted-foreground truncate ml-2">
            {manifest.description}
          </span>
        )}
      </div>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        onLoad={handleLoad}
        style={{ width: "100%", minHeight, border: "none" }}
        title={`Plugin: ${plugin.name}`}
      />
    </div>
  );
}
