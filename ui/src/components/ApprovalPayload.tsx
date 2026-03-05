import { UserPlus, Lightbulb, ShieldCheck, Puzzle } from "lucide-react";

export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
  plugin_review: "Plugin Review",
};

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  plugin_review: Puzzle,
};

export const defaultTypeIcon = ShieldCheck;

function PayloadField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Name</span>
        <span className="font-medium">{String(payload.name ?? "—")}</span>
      </div>
      <PayloadField label="Role" value={payload.role} />
      <PayloadField label="Title" value={payload.title} />
      <PayloadField label="Icon" value={payload.icon} />
      {!!payload.capabilities && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Capabilities</span>
          <span className="text-muted-foreground">{String(payload.capabilities)}</span>
        </div>
      )}
      {!!payload.adapterType && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Adapter</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {String(payload.adapterType)}
          </span>
        </div>
      )}
    </div>
  );
}

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const plan = payload.plan ?? payload.description ?? payload.strategy ?? payload.text;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Title" value={payload.title} />
      {!!plan && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">
          {String(plan)}
        </div>
      )}
      {!plan && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function PluginReviewPayload({ payload }: { payload: Record<string, unknown> }) {
  const manifest = payload.manifest as Record<string, unknown> | undefined;
  const permissions = manifest?.permissions as Record<string, unknown> | undefined;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Plugin" value={payload.pluginName} />
      {Array.isArray(permissions?.paperclip) && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Data Access</span>
          <div className="flex flex-wrap gap-1">
            {(permissions.paperclip as string[]).map((p) => (
              <span key={p} className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{p}</span>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(permissions?.externalHosts) && (permissions.externalHosts as string[]).length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Ext. Hosts</span>
          <div className="flex flex-wrap gap-1">
            {(permissions.externalHosts as string[]).map((h) => (
              <span key={h} className="font-mono text-xs bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">{h}</span>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(permissions?.secrets) && (permissions.secrets as string[]).length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Secrets</span>
          <div className="flex flex-wrap gap-1">
            {(permissions.secrets as string[]).map((s) => (
              <span key={s} className="font-mono text-xs bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ApprovalPayloadRenderer({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "plugin_review") return <PluginReviewPayload payload={payload} />;
  return <CeoStrategyPayload payload={payload} />;
}
