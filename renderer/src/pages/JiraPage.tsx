import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { soundToast as toast } from "@/lib/appAudio";
import {
  ExternalLink,
  Loader2,
  Send,
} from "lucide-react";

interface JiraCreateMeta {
  issueTypes: { id: string; name: string; subtask?: boolean }[];
}

interface JiraEpic {
  key: string;
  summary: string;
}

interface JiraComponent {
  id: string;
  name: string;
}

interface JiraVersion {
  id: string;
  name: string;
  released?: boolean;
}


const PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"];

export default function JiraPage() {
  const { state } = useApp();
  const { jira } = state.settings;

  const [projectKey, setProjectKey] = useState(jira.defaultProject || "");
  const [issueType, setIssueType] = useState("Task");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [epicLink, setEpicLink] = useState("");
  const [labels, setLabels] = useState("");
  const [components, setComponents] = useState<string[]>([]);
  const [affectedVersion, setAffectedVersion] = useState("");
  const [fixVersion, setFixVersion] = useState("");

  const [issueTypes, setIssueTypes] = useState<JiraCreateMeta["issueTypes"]>([]);
  const [epics, setEpics] = useState<JiraEpic[]>([]);
  const [availableComponents, setAvailableComponents] = useState<JiraComponent[]>([]);
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isConfigured = jira.url && jira.login && jira.token;

  const loadProjectMeta = useCallback(async (key: string) => {
    if (!key || !isConfigured || !window.api) return;
    setLoadingMeta(true);
    try {
      const [metaRes, epicsRes, componentsRes, versionsRes] = await Promise.all([
        window.api.getJiraCreateMeta(key),
        window.api.getJiraEpics(key).catch(() => []),
        window.api.getJiraComponents(key).catch(() => []),
        window.api.getJiraVersions(key).catch(() => []),
      ]);

      const meta = metaRes as JiraCreateMeta;
      if (meta.issueTypes?.length > 0) {
        setIssueTypes(meta.issueTypes);
        const names = meta.issueTypes.map((t) => t.name);
        setIssueType((prev) => (names.includes(prev) ? prev : names[0]));
      } else {
        setIssueTypes([]);
      }

      setEpics((epicsRes as JiraEpic[]) || []);
      setAvailableComponents((componentsRes as JiraComponent[]) || []);
      setVersions((versionsRes as JiraVersion[]) || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load project metadata");
    } finally {
      setLoadingMeta(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    if (projectKey) {
      loadProjectMeta(projectKey);
    }
  }, [projectKey, loadProjectMeta]);

  const handleSubmit = async () => {
    if (!summary.trim()) {
      toast.error("Summary is required");
      return;
    }
    if (!projectKey.trim()) {
      toast.error("Project key is required");
      return;
    }
    if (!isConfigured || !window.api) {
      toast.error("Jira is not configured. Set credentials in Settings.");
      return;
    }

    setSubmitting(true);
    try {
      const fields: Record<string, any> = {
        project: { key: projectKey.trim() },
        issuetype: { name: issueType },
        summary: summary.trim(),
        priority: { name: priority },
      };

      if (description.trim()) {
        fields.description = description.trim();
      }

      if (epicLink) {
        fields.parent = { key: epicLink };
      }

      const labelList = labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      if (labelList.length > 0) {
        fields.labels = labelList;
      }

      if (components.length > 0) {
        fields.components = components.map((name) => ({ name }));
      }

      if (affectedVersion) {
        fields.versions = [{ id: affectedVersion }];
      }

      if (fixVersion) {
        fields.fixVersions = [{ id: fixVersion }];
      }

      const result = await window.api.createJiraIssue({ fields });
      const issueKey = (result as any)?.key || "ISSUE";
      toast.success(`Issue created: ${issueKey}`);

      setSummary("");
      setDescription("");
      setEpicLink("");
      setLabels("");
      setComponents([]);
      setAffectedVersion("");
      setFixVersion("");
      setPriority("Medium");
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Failed to create issue";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleComponent = (name: string) => {
    setComponents((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const inputClass =
    "w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "text-[11px] font-medium text-muted-foreground block mb-1";

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-semibold">Jira — Create Issue</h2>
          {jira.url && (
            <a
              href={jira.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {jira.url} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {!isConfigured ? (
          <div className="p-6 text-sm text-muted-foreground">
            Configure Jira credentials in{" "}
            <a href="/settings" className="text-primary hover:underline">
              Settings
            </a>{" "}
            to create issues.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
            <div className="max-w-2xl space-y-4">
              {/* Project Key + Issue Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Project Key <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={projectKey}
                    onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                    placeholder="e.g. PROJ"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Issue Type <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value)}
                    className={inputClass}
                  >
                    {issueTypes.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className={labelClass}>
                  Summary <span className="text-destructive">*</span>
                </label>
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Short description"
                  className={inputClass}
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed description (Jira markup supported)"
                  rows={6}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Priority */}
              <div>
                <label className={labelClass}>Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className={inputClass}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Epic Link */}
              <div>
                <label className={labelClass}>Epic Link</label>
                {loadingMeta ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading
                    epics...
                  </div>
                ) : (
                  <select
                    value={epicLink}
                    onChange={(e) => setEpicLink(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    {epics.map((epic) => (
                      <option key={epic.key} value={epic.key}>
                        {epic.key} — {epic.summary}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Labels */}
              <div>
                <label className={labelClass}>Labels</label>
                <input
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                  placeholder="Comma-separated labels"
                  className={inputClass}
                />
              </div>

              {/* Components */}
              <div>
                <label className={labelClass}>Components</label>
                {loadingMeta ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading
                    components...
                  </div>
                ) : availableComponents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No components available
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableComponents.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => toggleComponent(c.name)}
                        className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                          components.includes(c.name)
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Versions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Affected Version</label>
                  {loadingMeta ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                  ) : (
                    <select
                      value={affectedVersion}
                      onChange={(e) => setAffectedVersion(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">None</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                          {v.released ? " (released)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Fix Version</label>
                  {loadingMeta ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                  ) : (
                    <select
                      value={fixVersion}
                      onChange={(e) => setFixVersion(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">None</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                          {v.released ? " (released)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Submit */}
              <div className="pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !summary.trim() || !projectKey.trim()}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {submitting ? "Creating..." : "Create Issue"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
