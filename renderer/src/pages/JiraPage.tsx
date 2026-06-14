import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { soundToast as toast } from "@/lib/appAudio";
import { Loader2, Send, Ticket, ChevronDown, X, ChevronRight, Save, FileText, Check, Settings } from "lucide-react";

interface JiraIssueType { id: string; name: string; }
interface JiraComponent { id: string; name: string; }
interface JiraVersion { id: string; name: string; released?: boolean; }
interface JiraTemplate { name: string; fields: Record<string, any>; showDetails?: boolean; }
interface CreatedIssue { key: string; url: string; timestamp: number; }

const PRIORITIES = ["Блокирующий", "Критический", "Высокий", "Средний", "Низкий"];
type FormMode = "quick" | "detailed" | "template";

function SearchSelect({ value, onChange, options, placeholder, onOpen, loading, onSearch }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string; onOpen?: () => void; loading?: boolean;
  onSearch?: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (onSearch && open) onSearch(query);
  }, [query, open, onSearch]);

  const handleOpen = () => { const next = !open; setOpen(next); if (next && onOpen) onOpen(); };
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={handleOpen}
        className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-ring">
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {loading ? "Загрузка..." : selected?.label || placeholder || "Выберите"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-hidden">
          <div className="p-1.5 border-b border-border">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск..."
              className="w-full bg-input border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none" autoFocus />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">Ничего не найдено</div>
            ) : filtered.map(o => (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${value === o.value ? "bg-accent text-accent-foreground" : ""}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MultiSelect({ values, onChange, options, placeholder, onOpen, loading }: {
  values: string[]; onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
  placeholder?: string; onOpen?: () => void; loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleOpen = () => { const next = !open; setOpen(next); if (next && onOpen) onOpen(); };
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const toggle = (val: string) => onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={handleOpen}
        className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-ring min-h-[42px]">
        <div className="flex flex-wrap gap-1 flex-1">
          {values.length === 0 && <span className="text-muted-foreground">{loading ? "Загрузка..." : placeholder || "Выберите"}</span>}
          {values.map(v => {
            const opt = options.find(o => o.value === v);
            return (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary rounded-md text-xs">
                {opt?.label || v}
                <button type="button" onClick={e => { e.stopPropagation(); toggle(v); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-hidden">
          <div className="p-1.5 border-b border-border">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск..."
              className="w-full bg-input border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none" autoFocus />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">Ничего не найдено</div>
            ) : filtered.map(o => (
              <button key={o.value} type="button" onClick={() => toggle(o.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 ${values.includes(o.value) ? "bg-accent text-accent-foreground" : ""}`}>
                <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${values.includes(o.value) ? "bg-primary border-primary" : "border-border"}`}>
                  {values.includes(o.value) && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function JiraPage() {
  const { state, dispatch } = useApp();
  const { jira } = state.settings;
  const projectKey = jira.defaultProject || "";

  const [mode, setMode] = useState<FormMode>("quick");
  const [issueType, setIssueType] = useState("");
  const [priority, setPriority] = useState("Средний");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [contractor, setContractor] = useState("");
  const [rpEnv, setRpEnv] = useState<string[]>([]);
  const [components, setComponents] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [affectedVersion, setAffectedVersion] = useState("");
  const [fixVersion, setFixVersion] = useState("");

  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [availableComponents, setAvailableComponents] = useState<JiraComponent[]>([]);
  const [contractorOptions, setContractorOptions] = useState<{ value: string; label: string }[]>([]);
  const [rpEnvOptions, setRpEnvOptions] = useState<{ value: string; label: string }[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [templates, setTemplates] = useState<JiraTemplate[]>([]);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [history, setHistory] = useState<CreatedIssue[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState({
    issueType: "", priority: "Средний", assignee: "", contractor: "",
    rpEnv: [] as string[], components: [] as string[], labels: [] as string[],
  });

  const isConfigured = jira.url && jira.login;
  const loadedRef = useRef({ versions: false, components: false, createmeta: false });
  const createmetaCache = useRef<any>(null);

  useEffect(() => {
    if (!window.api) return;
    window.api.loadJiraTemplates().then(res => setTemplates(Array.isArray(res) ? res : [])).catch(() => {});
  }, []);

  useEffect(() => {
    try { const s = localStorage.getItem("jira_created_issues"); if (s) setHistory(JSON.parse(s)); } catch {}
    try { const p = localStorage.getItem("jira_profile"); if (p) setProfile(JSON.parse(p)); } catch {}
  }, []);

  const saveHistory = (issue: CreatedIssue) => {
    const next = [issue, ...history].slice(0, 25);
    setHistory(next);
    localStorage.setItem("jira_created_issues", JSON.stringify(next));
  };

  const saveProfile = () => {
    localStorage.setItem("jira_profile", JSON.stringify(profile));
    toast.success("Профиль сохранён");
    setShowProfile(false);
  };

  const applyProfileDefaults = () => {
    if (profile.issueType) setIssueType(profile.issueType);
    if (profile.priority) setPriority(profile.priority);
    if (profile.assignee) setAssignee(profile.assignee);
    if (profile.contractor) setContractor(profile.contractor);
    if (profile.rpEnv.length) setRpEnv(profile.rpEnv);
    if (profile.components.length) setComponents(profile.components);
    if (profile.labels.length) setLabels(profile.labels);
  };

  const loadIssueTypes = useCallback(async () => {
    if (!projectKey || !window.api) return;
    const res = await window.api.getJiraCreateMeta(projectKey).catch(() => null);
    if (res) {
      createmetaCache.current = (res as any)?.data || res;
      const types = createmetaCache.current?.projects?.[0]?.issuetypes || [];
      setIssueTypes(Array.isArray(types) ? types : []);
      if (Array.isArray(types) && types.length > 0) {
        const names = types.map((t: any) => t.name).filter(Boolean);
        setIssueType(prev => names.includes(prev) ? prev : names[0] || "");
      }
    }
  }, [projectKey]);

  useEffect(() => { loadIssueTypes(); }, [loadIssueTypes]);

  const loadVersions = useCallback(async () => {
    if (!projectKey || !window.api || loadedRef.current.versions) return;
    loadedRef.current.versions = true;
    const res = await window.api.getJiraVersions(projectKey).catch(() => []);
    const data = (res as any)?.data || res;
    setVersions(Array.isArray(data) ? data.filter((v: any) => v?.id && v?.name) : []);
  }, [projectKey]);

  const loadComponents = useCallback(async () => {
    if (!projectKey || !window.api || loadedRef.current.components) return;
    loadedRef.current.components = true;
    const res = await window.api.getJiraComponents(projectKey).catch(() => []);
    const data = (res as any)?.data || res;
    setAvailableComponents(Array.isArray(data) ? data.filter((c: any) => c?.name) : []);
  }, [projectKey]);

  const ensureCreatemeta = useCallback(async () => {
    if (createmetaCache.current) return createmetaCache.current;
    if (!projectKey || !window.api) return null;
    const res = await window.api.getJiraCreateMeta(projectKey).catch(() => null);
    if (res) {
      createmetaCache.current = (res as any)?.data || res;
      return createmetaCache.current;
    }
    return null;
  }, [projectKey]);

  const loadContractorOptions = useCallback(async () => {
    const meta = await ensureCreatemeta();
    if (meta) {
      const f = meta?.projects?.[0]?.issuetypes?.[0]?.fields?.["customfield_13342"];
      if (f?.allowedValues && Array.isArray(f.allowedValues)) {
        setContractorOptions(f.allowedValues.map((v: any) => ({ value: v.id || v.value || "", label: v.value || v.name || "" })));
      }
    }
  }, [ensureCreatemeta]);

  const loadRpEnvOptions = useCallback(async () => {
    if (loadedRef.current.createmeta) return;
    loadedRef.current.createmeta = true;
    const meta = await ensureCreatemeta();
    if (meta) {
      const f = meta?.projects?.[0]?.issuetypes?.[0]?.fields?.["customfield_13274"];
      if (f?.allowedValues && Array.isArray(f.allowedValues)) {
        setRpEnvOptions(f.allowedValues.map((v: any) => ({ value: v.id || v.value || "", label: v.value || v.name || "" })));
      }
    }
  }, [ensureCreatemeta]);

  const searchUsers = useCallback(async (query: string) => {
    if (!window.api || query.length < 2) { setAssigneeOptions([]); return; }
    const res = await window.api.searchJiraUsers(query).catch(() => []);
    const data = (res as any)?.data || res;
    setAssigneeOptions(Array.isArray(data) ? data.map((u: any) => ({ value: u.name || "", label: u.displayName || u.name || "" })) : []);
  }, []);

  const applyTemplate = (tpl: JiraTemplate) => {
    const f = tpl.fields || {};
    if (f.issuetype) setIssueType(f.issuetype);
    if (f.priority) setPriority(f.priority);
    if (f.summary) setSummary(f.summary);
    if (f.description) setDescription(f.description);
    if (f.components) setComponents(f.components);
    if (f.labels) setLabels(f.labels);
    if (f.customfield_13342) setContractor(f.customfield_13342);
    if (f.customfield_13274) setRpEnv(f.customfield_13274);
    if (f.assignee) setAssignee(f.assignee);
    setMode(tpl.showDetails ? "detailed" : "quick");
    toast.success(`Шаблон «${tpl.name}» применён`);
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) { toast.error("Введите название шаблона"); return; }
    const tpl: JiraTemplate = {
      name: templateName.trim(),
      showDetails: mode === "detailed",
      fields: { issuetype: issueType, priority, summary, description, components, labels,
        customfield_13342: contractor, customfield_13274: rpEnv, assignee },
    };
    try {
      await window.api?.saveJiraTemplate(tpl);
      setTemplates(prev => { const i = prev.findIndex(t => t.name === tpl.name); if (i >= 0) { const n = [...prev]; n[i] = tpl; return n; } return [...prev, tpl]; });
      setTemplateName(""); setShowCreateTemplate(false);
      toast.success(`Шаблон «${tpl.name}» сохранён`);
    } catch { toast.error("Ошибка сохранения шаблона"); }
  };

  const deleteTemplate = async (name: string) => {
    try { await window.api?.deleteJiraTemplate(name); setTemplates(prev => prev.filter(t => t.name !== name)); toast.success("Шаблон удалён"); }
    catch { toast.error("Ошибка удаления шаблона"); }
  };

  const handleSubmit = async () => {
    if (!summary.trim()) { toast.error("Введите заголовок задачи"); return; }
    if (!isConfigured || !window.api) { toast.error("Jira не настроена"); return; }
    setSubmitting(true);
    try {
      const fields: Record<string, any> = { project: { key: projectKey }, issuetype: { name: issueType }, summary: summary.trim(), priority: { name: priority } };
      if (description.trim()) fields.description = description.trim();
      if (assignee) fields.assignee = { name: assignee };
      if (contractor) fields.customfield_13342 = { id: contractor };
      if (rpEnv.length > 0) fields.customfield_13274 = rpEnv.map(id => ({ id }));
      if (components.length > 0) fields.components = components.map(name => ({ name }));
      if (labels.length > 0) fields.labels = labels;
      if (affectedVersion) fields.versions = [{ id: affectedVersion }];
      if (fixVersion) fields.fixVersions = [{ id: fixVersion }];

      const result = await window.api.createJiraIssue({ fields });
      const issueKey = (result as any)?.key || "ISSUE";
      const issueUrl = `${jira.url}/browse/${issueKey}`;
      saveHistory({ key: issueKey, url: issueUrl, timestamp: Date.now() });
      try { await navigator.clipboard.writeText(issueUrl); toast.success(`Задача создана: ${issueKey} (ссылка скопирована)`); }
      catch { toast.success(`Задача создана: ${issueKey}`); }

      setSummary(""); setDescription(""); setLabels([]); setComponents([]); setAffectedVersion(""); setFixVersion("");
      setPriority("Средний"); setContractor(""); setRpEnv([]); setAssignee("");
    } catch (err: any) { toast.error(err?.message || "Ошибка создания задачи"); }
    finally { setSubmitting(false); }
  };

  const labelClass = "text-xs font-medium text-muted-foreground block mb-1.5";
  const inputClass = "w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  const summaryParts = [issueType, priority, ...components, projectKey].filter(Boolean);

  if (!isConfigured) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0">
          <Ticket className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Jira — Создание задачи</h2>
        </div>
        <div className="flex-1 p-6 text-sm text-muted-foreground">
          Настройте подключение к Jira в <a href="/settings" className="text-primary hover:underline">Настройках</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          <h1 className="text-xl font-bold mb-1">
            Jira — {mode === "quick" ? "создание задачи" : mode === "detailed" ? "детальное создание" : "шаблоны"}
          </h1>
          <p className="text-sm text-muted-foreground mb-5">
            {mode === "quick" && "Быстрый режим показывает только частые поля, обязательные Jira-поля берутся из профиля."}
            {mode === "detailed" && "То же создание, но раскрыт блок дополнительных Jira-полей."}
            {mode === "template" && "Шаблоны управляют предзаполнением основных и дополнительных полей."}
          </p>

          <div className="flex gap-2 mb-6">
            {([["quick", "Быстро"], ["detailed", "Детально"], ["template", "Из шаблона"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setMode(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                {label}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={() => setShowProfile(!showProfile)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${showProfile ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
              <Settings className="w-4 h-4" /> Настройки
            </button>
          </div>

          {showProfile && (
            <div className="bg-card border border-border rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold mb-3">Профиль по умолчанию</h2>
              <p className="text-xs text-muted-foreground mb-4">Значения подставляются в форму автоматически при открытии.</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Тип задачи</label>
                  <SearchSelect value={profile.issueType} onChange={v => setProfile(p => ({ ...p, issueType: v }))}
                    options={issueTypes.map(t => ({ value: t.name, label: t.name }))} placeholder="Не задан" />
                </div>
                <div>
                  <label className={labelClass}>Приоритет</label>
                  <SearchSelect value={profile.priority} onChange={v => setProfile(p => ({ ...p, priority: v }))}
                    options={PRIORITIES.map(p => ({ value: p, label: p }))} />
                </div>
                <div>
                  <label className={labelClass}>Исполнитель</label>
                  <SearchSelect value={profile.assignee} onChange={v => setProfile(p => ({ ...p, assignee: v }))}
                    options={assigneeOptions} placeholder="Не задан" onSearch={searchUsers} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Подрядчик</label>
                  <SearchSelect value={profile.contractor} onChange={v => setProfile(p => ({ ...p, contractor: v }))}
                    options={contractorOptions} placeholder="Не задан" onOpen={loadContractorOptions} />
                </div>
                <div>
                  <label className={labelClass}>Окружение РП</label>
                  <MultiSelect values={profile.rpEnv} onChange={v => setProfile(p => ({ ...p, rpEnv: v }))}
                    options={rpEnvOptions} placeholder="Не задано" onOpen={loadRpEnvOptions} />
                </div>
                <div>
                  <label className={labelClass}>Компоненты</label>
                  <MultiSelect values={profile.components} onChange={v => setProfile(p => ({ ...p, components: v }))}
                    options={availableComponents.map(c => ({ value: c.name, label: c.name }))}
                    placeholder="Не заданы" onOpen={loadComponents} />
                </div>
              </div>
              <div className="mb-4">
                <label className={labelClass}>Метки</label>
                <input value={profile.labels.join(", ")}
                  onChange={e => setProfile(p => ({ ...p, labels: e.target.value.split(",").map(l => l.trim()).filter(Boolean) }))}
                  placeholder="Через запятую" className={inputClass} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveProfile}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                  <Save className="w-3.5 h-3.5" /> Сохранить профиль
                </button>
                <button onClick={applyProfileDefaults}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm hover:bg-secondary/80">
                  Применить к форме
                </button>
                <button onClick={() => setShowProfile(false)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm hover:bg-secondary/80">
                  Закрыть
                </button>
              </div>
            </div>
          )}

          {mode === "template" ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold">Шаблоны создания</h2>
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет сохранённых шаблонов</p>
              ) : templates.map(t => (
                <div key={t.name} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{t.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.fields?.issuetype && `Тип: ${t.fields.issuetype}`}
                        {t.fields?.priority && ` · Priority: ${t.fields.priority}`}
                        {t.fields?.components?.length && ` · Component: ${t.fields.components[0]}`}
                        {t.fields?.labels?.length && ` · Labels: ${t.fields.labels.join(", ")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => applyTemplate(t)}
                        className="h-9 px-4 bg-secondary text-secondary-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors">
                        Выбрать
                      </button>
                      <button onClick={() => { applyTemplate(t); setTemplateName(t.name); setShowCreateTemplate(true); setMode("template"); }}
                        className="h-9 px-3 bg-secondary text-secondary-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors flex items-center justify-center"
                        title="Пересохранить шаблон">
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteTemplate(t.name)}
                        className="h-9 px-3 bg-secondary text-destructive rounded-lg text-sm hover:bg-destructive/10 transition-colors flex items-center justify-center"
                        title="Удалить шаблон">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {showCreateTemplate ? (
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Название шаблона..."
                    className={inputClass} autoFocus />
                  <div className="flex gap-2">
                    <button onClick={saveAsTemplate} disabled={!templateName.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                      <Save className="w-3.5 h-3.5" /> Сохранить
                    </button>
                    <button onClick={() => { setShowCreateTemplate(false); setTemplateName(""); }}
                      className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm hover:bg-secondary/80">
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowCreateTemplate(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                  Создать шаблон
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Тип задачи <span className="text-destructive">*</span></label>
                  <SearchSelect value={issueType} onChange={setIssueType}
                    options={issueTypes.map(t => ({ value: t.name, label: t.name }))} placeholder="Выберите тип" />
                </div>
                <div>
                  <label className={labelClass}>Приоритет</label>
                  <SearchSelect value={priority} onChange={setPriority}
                    options={PRIORITIES.map(p => ({ value: p, label: p }))} />
                </div>
              </div>

              <div className="mb-4">
                <label className={labelClass}>Заголовок <span className="text-destructive">*</span></label>
                <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="Кратко опишите задачу..." className={inputClass} />
              </div>

              <div className="mb-5">
                <label className={labelClass}>Описание</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Что произошло, что ожидалось, шаги воспроизведения..." rows={5}
                  className={`${inputClass} resize-none`} />
              </div>

              {mode === "detailed" && (
                <div className="mb-5">
                  <h2 className="text-sm font-semibold mb-3">Дополнительные поля Jira</h2>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className={labelClass}>Исполнитель</label>
                      <SearchSelect value={assignee} onChange={setAssignee} options={assigneeOptions}
                        placeholder="Найти пользователя..." onSearch={searchUsers} />
                    </div>
                    <div>
                      <label className={labelClass}>Подрядчик</label>
                      <SearchSelect value={contractor} onChange={setContractor} options={contractorOptions}
                        placeholder="Выберите подрядчика" onOpen={loadContractorOptions} />
                    </div>
                    <div>
                      <label className={labelClass}>Окружение РП</label>
                      <MultiSelect values={rpEnv} onChange={setRpEnv} options={rpEnvOptions}
                        placeholder="Выберите окружение" onOpen={loadRpEnvOptions} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className={labelClass}>Компоненты</label>
                      <MultiSelect values={components} onChange={setComponents}
                        options={availableComponents.map(c => ({ value: c.name, label: c.name }))}
                        placeholder="Выберите компоненты" onOpen={loadComponents} />
                    </div>
                    <div>
                      <label className={labelClass}>Метки</label>
                      <input value={labels.join(", ")} onChange={e => setLabels(e.target.value.split(",").map(l => l.trim()).filter(Boolean))}
                        placeholder="Через запятую" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Затронутые версии</label>
                      <SearchSelect value={affectedVersion} onChange={setAffectedVersion}
                        options={versions.map(v => ({ value: v.id, label: v.name + (v.released ? " (выпущена)" : "") }))}
                        placeholder="Не выбрана" onOpen={loadVersions} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Исправить в версиях</label>
                      <SearchSelect value={fixVersion} onChange={setFixVersion}
                        options={versions.map(v => ({ value: v.id, label: v.name + (v.released ? " (выпущена)" : "") }))}
                        placeholder="Не выбрана" onOpen={loadVersions} />
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Будет создано как: {summaryParts.join(" · ") || "—"}
                </span>
                {mode === "quick" && (
                  <button onClick={() => setMode("detailed")} className="text-sm text-primary hover:underline">
                    Изменить поля
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={handleSubmit} disabled={submitting || !summary.trim()}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? "Создание..." : "Создать задачу"}
                </button>
                {mode === "quick" && (
                  <button onClick={() => setMode("detailed")}
                    className="px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                    Открыть детально
                  </button>
                )}
                {mode === "detailed" && (
                  <button onClick={() => setMode("quick")}
                    className="px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                    Свернуть поля
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="border-t border-border flex-shrink-0">
          <button onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center gap-2 px-6 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <ChevronRight className={`w-3 h-3 transition-transform ${showHistory ? "rotate-90" : ""}`} />
            Созданные задачи ({history.length})
          </button>
          {showHistory && (
            <div className="px-6 pb-3 max-h-36 overflow-y-auto">
              {history.filter(h => h?.key && h?.url).map((h, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-xs">
                  <span className="font-mono text-foreground">{String(h.key)}</span>
                  <a href={String(h.url)} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline truncate">{String(h.url)}</a>
                  <span className="text-muted-foreground ml-auto flex-shrink-0">
                    {h.timestamp ? new Date(h.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
