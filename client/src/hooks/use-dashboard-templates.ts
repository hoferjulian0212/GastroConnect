import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export type CardSize = "full" | "half";

export interface LayoutItem {
  id: string;
  size: CardSize;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  layout: LayoutItem[];
  widgets: string[];
}

export interface TemplatesState {
  templates: DashboardTemplate[];
  activeId: string | null;
}

// Persistence keys — must match the keys used by the desktop DraggableCardGrid so
// mobile and desktop read/write the exact same cached state.
export function getLayoutStorageKey(userId: string, role: string) {
  return `dashboard-grid-${userId}-${role}`;
}

export function getWidgetsStorageKey(userId: string, role: string) {
  return `dashboard-widgets-${userId}-${role}`;
}

export function getTemplatesStorageKey(userId: string, role: string) {
  return `dashboard-templates-${userId}-${role}`;
}

export function genTemplateId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `tpl-${crypto.randomUUID()}`;
    }
  } catch {}
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeTemplates(value: unknown): TemplatesState {
  const empty: TemplatesState = { templates: [], activeId: null };
  if (!value || typeof value !== "object") return empty;
  const raw = (value as any).templates;
  if (!Array.isArray(raw)) return empty;
  const templates: DashboardTemplate[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const id = (t as any).id;
    const name = (t as any).name;
    const layout = (t as any).layout;
    const widgets = (t as any).widgets;
    if (typeof id !== "string" || typeof name !== "string") continue;
    if (!Array.isArray(layout) || !Array.isArray(widgets)) continue;
    templates.push({ id, name, layout, widgets });
  }
  const validIds = new Set(templates.map(t => t.id));
  const rawActive = (value as any).activeId;
  const activeId = typeof rawActive === "string" && validIds.has(rawActive) ? rawActive : null;
  return { templates, activeId };
}

export function loadTemplatesState(userId: string, role: string): TemplatesState {
  try {
    const saved = localStorage.getItem(getTemplatesStorageKey(userId, role));
    if (saved) return sanitizeTemplates(JSON.parse(saved));
  } catch {}
  return { templates: [], activeId: null };
}

function readRawArray(key: string): any[] {
  try {
    const s = localStorage.getItem(key);
    if (s) {
      const v = JSON.parse(s);
      if (Array.isArray(v)) return v;
    }
  } catch {}
  return [];
}

const enc = encodeURIComponent;

/**
 * Shared dashboard "views" (named templates) state + persistence.
 *
 * This mirrors the template handling baked into the desktop DraggableCardGrid, but is
 * self-contained so the mobile home pages (which use a separate hand-built layout) can
 * expose the same switch/create/rename/update/delete behaviour. Templates, the active
 * selection, and the underlying layout/widget snapshots are all persisted to the same
 * localStorage keys and `/api/users/:id/dashboard-*` endpoints the desktop uses, so the
 * active view and saved views stay in sync across desktop and mobile (server wins on load).
 */
export function useDashboardTemplates(userId: string, role: string) {
  const initial = useMemo(() => loadTemplatesState(userId, role), [userId, role]);
  const [templates, setTemplates] = useState<DashboardTemplate[]>(initial.templates);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(initial.activeId);
  const templatesRef = useRef<DashboardTemplate[]>(initial.templates);
  const activeIdRef = useRef<string | null>(initial.activeId);

  useEffect(() => { templatesRef.current = templates; }, [templates]);
  useEffect(() => { activeIdRef.current = activeTemplateId; }, [activeTemplateId]);

  // On mount (or user/role change): reset to this user/role's locally cached state, then
  // adopt the server's version (server wins). Also seed the layout/widget caches so that
  // "save / update view" snapshots reflect the real current configuration even on a fresh
  // device that has only ever opened the mobile home.
  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;
    const local = loadTemplatesState(userId, role);
    setTemplates(local.templates);
    setActiveTemplateId(local.activeId);
    templatesRef.current = local.templates;
    activeIdRef.current = local.activeId;
    (async () => {
      try {
        const res = await fetch(`/api/users/${enc(userId)}/dashboard-templates/${enc(role)}`, {
          credentials: "include",
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          const sanitized = sanitizeTemplates(data);
          setTemplates(sanitized.templates);
          setActiveTemplateId(sanitized.activeId);
          try { localStorage.setItem(getTemplatesStorageKey(userId, role), JSON.stringify(sanitized)); } catch {}
        }
      } catch {}
      try {
        const lRes = await fetch(`/api/users/${enc(userId)}/dashboard-layout/${enc(role)}`, { credentials: "include" });
        if (lRes.ok && !cancelled) {
          const d = await lRes.json();
          if (Array.isArray(d?.layout)) {
            try { localStorage.setItem(getLayoutStorageKey(userId, role), JSON.stringify(d.layout)); } catch {}
          }
        }
      } catch {}
      try {
        const wRes = await fetch(`/api/users/${enc(userId)}/dashboard-widgets/${enc(role)}`, { credentials: "include" });
        if (wRes.ok && !cancelled) {
          const d = await wRes.json();
          if (Array.isArray(d?.widgets)) {
            try { localStorage.setItem(getWidgetsStorageKey(userId, role), JSON.stringify(d.widgets)); } catch {}
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userId, role]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTemplatesState = useCallback((nextTemplates: DashboardTemplate[], nextActiveId: string | null) => {
    setTemplates(nextTemplates);
    setActiveTemplateId(nextActiveId);
    templatesRef.current = nextTemplates;
    activeIdRef.current = nextActiveId;
    const payload: TemplatesState = { templates: nextTemplates, activeId: nextActiveId };
    try { localStorage.setItem(getTemplatesStorageKey(userId, role), JSON.stringify(payload)); } catch {}
    if (!userId || !role) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiRequest(
        "PUT",
        `/api/users/${enc(userId)}/dashboard-templates/${enc(role)}`,
        payload,
      ).catch(() => {});
    }, 400);
  }, [userId, role]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  // Persist a view's layout + widgets to the shared caches and the server so that the
  // desktop grid adopts them on its next load (it reconciles against its sections there).
  const persistLayoutWidgets = useCallback((layout: LayoutItem[], widgets: string[]) => {
    try { localStorage.setItem(getLayoutStorageKey(userId, role), JSON.stringify(layout)); } catch {}
    try { localStorage.setItem(getWidgetsStorageKey(userId, role), JSON.stringify(widgets)); } catch {}
    if (!userId || !role) return;
    apiRequest("PUT", `/api/users/${enc(userId)}/dashboard-layout/${enc(role)}`, { layout }).catch(() => {});
    apiRequest("PUT", `/api/users/${enc(userId)}/dashboard-widgets/${enc(role)}`, { widgets }).catch(() => {});
  }, [userId, role]);

  const applyTemplate = useCallback((tpl: DashboardTemplate) => {
    persistLayoutWidgets(tpl.layout, tpl.widgets);
    saveTemplatesState(templatesRef.current, tpl.id);
  }, [persistLayoutWidgets, saveTemplatesState]);

  const saveNewTemplate = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = genTemplateId();
    const tpl: DashboardTemplate = {
      id,
      name: trimmed,
      layout: readRawArray(getLayoutStorageKey(userId, role)) as LayoutItem[],
      widgets: readRawArray(getWidgetsStorageKey(userId, role)) as string[],
    };
    saveTemplatesState([...templatesRef.current, tpl], id);
  }, [userId, role, saveTemplatesState]);

  const updateActiveTemplate = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    const layout = readRawArray(getLayoutStorageKey(userId, role)) as LayoutItem[];
    const widgets = readRawArray(getWidgetsStorageKey(userId, role)) as string[];
    const next = templatesRef.current.map(t => (t.id === id ? { ...t, layout, widgets } : t));
    saveTemplatesState(next, id);
  }, [userId, role, saveTemplatesState]);

  const renameActiveTemplate = useCallback((name: string) => {
    const id = activeIdRef.current;
    const trimmed = name.trim();
    if (!id || !trimmed) return;
    const next = templatesRef.current.map(t => (t.id === id ? { ...t, name: trimmed } : t));
    saveTemplatesState(next, id);
  }, [saveTemplatesState]);

  const deleteActiveTemplate = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    saveTemplatesState(templatesRef.current.filter(t => t.id !== id), null);
  }, [saveTemplatesState]);

  const activeTemplate = useMemo(
    () => templates.find(t => t.id === activeTemplateId) || null,
    [templates, activeTemplateId],
  );

  return {
    templates,
    activeTemplateId,
    activeTemplate,
    applyTemplate,
    saveNewTemplate,
    updateActiveTemplate,
    renameActiveTemplate,
    deleteActiveTemplate,
  };
}
