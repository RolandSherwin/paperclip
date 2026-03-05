import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "../lib/utils";
import { MarkdownEditor, type MarkdownEditorRef } from "./MarkdownEditor";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { Identity } from "./Identity";

export function NewPluginDialog() {
  const { newPluginOpen, newPluginDefaults, closeNewPlugin } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);

  const isEditMode = !!newPluginDefaults.pluginId;
  const seededRef = useRef(false);

  // Seed fields from defaults when opening in edit mode
  useEffect(() => {
    if (!newPluginOpen || seededRef.current) return;
    if (newPluginDefaults.name) setName(newPluginDefaults.name);
    if (newPluginDefaults.description) setDescription(newPluginDefaults.description);
    if (newPluginDefaults.assignedAgentId) setAgentId(newPluginDefaults.assignedAgentId);
    seededRef.current = true;
  }, [newPluginOpen, newPluginDefaults]);

  // Reset seed guard when dialog closes
  useEffect(() => {
    if (!newPluginOpen) seededRef.current = false;
  }, [newPluginOpen]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newPluginOpen,
  });

  // Pre-fill in edit mode
  const appliedAgentId = agentId || newPluginDefaults.assignedAgentId || "";

  const nonTerminatedAgents = (agents ?? []).filter(
    (a) => a.status !== "terminated",
  );

  const agentOptions: InlineEntityOption[] = nonTerminatedAgents.map((a) => ({
    id: a.id,
    label: a.name,
    searchText: `${a.name} ${a.role}`,
  }));

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(selectedCompanyId, file, "plugins/drafts");
    },
  });

  const createIssueMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      issuesApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      const agent = nonTerminatedAgents.find((a) => a.id === appliedAgentId);
      pushToast({
        title: "Plugin queued",
        body: agent ? `${agent.name} will build it` : "An agent will build it",
        tone: "success",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      reset();
      closeNewPlugin();
    },
  });

  function reset() {
    setName("");
    setDescription("");
    setAgentId("");
    setExpanded(false);
  }

  function handleClose() {
    reset();
    closeNewPlugin();
  }

  function handleSubmit() {
    if (!selectedCompanyId || !name.trim() || !appliedAgentId) return;

    const issueTitle = isEditMode
      ? `Update plugin: ${name.trim()}`
      : `Build plugin: ${name.trim()}`;

    const issueDescription = description.trim() || null;

    createIssueMutation.mutate({
      title: issueTitle,
      description: issueDescription,
      assigneeAgentId: appliedAgentId,
      priority: "medium",
      status: "todo",
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Dialog
      open={newPluginOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn("p-0 gap-0", expanded ? "sm:max-w-2xl" : "sm:max-w-lg")}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {selectedCompany && (
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs font-medium">
                {selectedCompany.name.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="text-muted-foreground/60">&rsaquo;</span>
            <span>{isEditMode ? "Edit plugin" : "New plugin"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={handleClose}
            >
              <span className="text-lg leading-none">&times;</span>
            </Button>
          </div>
        </div>

        {/* Name */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <input
            className="w-full text-lg font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50"
            placeholder="Plugin name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                descriptionEditorRef.current?.focus();
              }
            }}
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="px-4 pb-2">
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={description}
            onChange={setDescription}
            placeholder="Describe what this plugin should do..."
            bordered={false}
            contentClassName={cn("text-sm text-muted-foreground", expanded ? "min-h-[220px]" : "min-h-[120px]")}
            imageUploadHandler={async (file) => {
              const asset = await uploadDescriptionImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>

        {/* Agent selector */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border">
          <span className="text-sm text-muted-foreground">Built by</span>
          <InlineEntitySelector
            value={appliedAgentId}
            options={agentOptions}
            placeholder="Select agent"
            noneLabel="No agent"
            searchPlaceholder="Search agents..."
            emptyMessage="No agents available"
            onChange={(id) => setAgentId(id)}
            renderTriggerValue={(option) =>
              option ? <Identity name={option.label} size="xs" /> : <span className="text-muted-foreground">Select agent</span>
            }
            renderOption={(option, isSelected) => (
              <span className={cn("truncate", isSelected && "font-medium")}>{option.label}</span>
            )}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleClose}
          >
            Discard
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || !appliedAgentId || createIssueMutation.isPending}
            onClick={handleSubmit}
          >
            {createIssueMutation.isPending
              ? "Creating..."
              : isEditMode
                ? "Request changes"
                : (
                    <>
                      Create Plugin
                      <kbd className="ml-1.5 text-[10px] opacity-60">⌘↵</kbd>
                    </>
                  )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
