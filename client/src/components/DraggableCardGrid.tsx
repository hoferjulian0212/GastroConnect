import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import { GripVertical, Maximize2, Columns2, Settings2, Check, LayoutGrid } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { apiRequest } from "@/lib/queryClient";

type CardSize = "full" | "half";

interface CardSection {
  id: string;
  content: React.ReactNode;
  defaultSize?: CardSize;
  title?: string;
  description?: string;
  optional?: boolean;
  defaultEnabled?: boolean;
}

interface DraggableCardGridProps {
  userId: string;
  role: string;
  sections: CardSection[];
  managerTitle?: string;
  managerDescription?: string;
  managerButtonLabel?: string;
}

interface LayoutItem {
  id: string;
  size: CardSize;
}

interface MasonryPosition {
  top: number;
  left: number;
  width: number;
}

const GAP = 24;

function getStorageKey(userId: string, role: string) {
  return `dashboard-grid-${userId}-${role}`;
}

function getWidgetsStorageKey(userId: string, role: string) {
  return `dashboard-widgets-${userId}-${role}`;
}

function defaultEnabledIds(sections: CardSection[]): string[] {
  return sections
    .filter(s => !s.optional || s.defaultEnabled !== false)
    .map(s => s.id);
}

function reconcileEnabledIds(saved: unknown, sections: CardSection[]): string[] | null {
  if (!Array.isArray(saved)) return null;
  const validIds = new Set(sections.map(s => s.id));
  const requiredIds = sections.filter(s => !s.optional).map(s => s.id);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of saved) {
    if (typeof v !== "string") continue;
    if (!validIds.has(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  // Required (non-optional) sections are always enabled, regardless of saved state.
  for (const id of requiredIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function loadEnabledIds(userId: string, role: string, sections: CardSection[]): string[] {
  try {
    const saved = localStorage.getItem(getWidgetsStorageKey(userId, role));
    if (saved) {
      const r = reconcileEnabledIds(JSON.parse(saved), sections);
      if (r) return r;
    }
  } catch {}
  return defaultEnabledIds(sections);
}

function defaultLayout(sections: CardSection[]): LayoutItem[] {
  return sections.map(s => ({ id: s.id, size: s.defaultSize || "full" }));
}

function reconcileLayout(saved: unknown, sections: CardSection[]): LayoutItem[] | null {
  if (!Array.isArray(saved)) return null;
  const defaultIds = sections.map(s => s.id);
  const cleaned: LayoutItem[] = [];
  for (const entry of saved) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as any).id;
    const size = (entry as any).size;
    if (typeof id !== "string" || !defaultIds.includes(id)) continue;
    if (size !== "full" && size !== "half") continue;
    if (cleaned.some(c => c.id === id)) continue;
    cleaned.push({ id, size });
  }
  // Append any new sections (added after the layout was saved) at the end with their default size.
  for (const s of sections) {
    if (!cleaned.some(c => c.id === s.id)) {
      cleaned.push({ id: s.id, size: s.defaultSize || "full" });
    }
  }
  return cleaned.length > 0 ? cleaned : null;
}

function loadLayout(userId: string, role: string, sections: CardSection[]): LayoutItem[] {
  try {
    const saved = localStorage.getItem(getStorageKey(userId, role));
    if (saved) {
      const reconciled = reconcileLayout(JSON.parse(saved), sections);
      if (reconciled) return reconciled;
    }
  } catch {}
  return defaultLayout(sections);
}

function layoutsEqual(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].size !== b[i].size) return false;
  }
  return true;
}

// Collision detection: closest-center against frozen positions, excluding the active card.
// Because we don't shuffle the layout during drag, droppable rects stay stable and target
// detection is calm/predictable.
const swapCollision: CollisionDetection = (args) => {
  const cc = closestCenter(args);
  return cc.filter(({ id }) => id !== args.active.id);
};

const CardContent = memo(function CardContent({ content, editMode }: { content: React.ReactNode; editMode: boolean }) {
  return (
    <div className={editMode ? "pointer-events-none select-none" : ""}>
      {content}
    </div>
  );
});

interface SortableCardProps {
  item: LayoutItem;
  section: CardSection;
  editMode: boolean;
  onToggleSize: (id: string) => void;
  isMd: boolean;
  masonryPos?: MasonryPosition;
  targetWidth?: number;
  isReady: boolean;
  isSwapTarget: boolean;
  isAnyDragging: boolean;
  onRefChange: (id: string, el: HTMLDivElement | null) => void;
}

function SortableCard({
  item,
  section,
  editMode,
  onToggleSize,
  isMd,
  masonryPos,
  targetWidth,
  isReady,
  isSwapTarget,
  isAnyDragging,
  onRefChange,
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !editMode,
  });

  const mergedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    onRefChange(item.id, node);
  }, [setNodeRef, item.id, onRefChange]);

  const isFull = item.size === "full";
  const width = masonryPos?.width ?? targetWidth ?? '100%';

  // While any card is being dragged we suspend transitions on the non-dragged cards
  // so their positions are visually nailed in place (no jitter from any layout work).
  // When the drag ends and positions actually change (the swapped pair), the transition
  // is re-enabled and the two cards glide to their new spots.
  const transitionEnabled = isReady && !isAnyDragging;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: masonryPos?.top ?? 0,
    left: masonryPos?.left ?? 0,
    width,
    opacity: isReady ? (isDragging ? 0.18 : 1) : 0,
    transition: transitionEnabled
      ? 'top 320ms cubic-bezier(0.22, 1, 0.36, 1), left 320ms cubic-bezier(0.22, 1, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease'
      : 'opacity 150ms ease',
    zIndex: isDragging ? 0 : 1,
    willChange: isAnyDragging ? 'auto' : undefined,
  };

  return (
    <div
      ref={mergedRef}
      style={style}
      className={`${editMode ? "ring-1 ring-border/40 rounded-xl" : ""}`}
      data-testid={`draggable-card-${item.id}`}
    >
      {/* Drop-target indicator: the card that will swap with the dragged one */}
      {isSwapTarget && !isDragging && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl border-2 border-dashed border-primary/60 bg-primary/[0.06]"
          style={{ zIndex: 10, transition: 'opacity 120ms ease' }}
          data-testid={`swap-target-${item.id}`}
        />
      )}
      <div style={{ opacity: isDragging ? 0.3 : 1, transition: "opacity 150ms ease" }}>
        {editMode && !isDragging && (
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
            {isMd && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSize(item.id); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shadow-sm text-xs font-medium transition-all ${
                  isFull
                    ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                }`}
                data-testid={`toggle-size-${item.id}`}
                title={isFull ? "Halbe Breite" : "Volle Breite"}
              >
                {isFull ? (
                  <>
                    <Columns2 className="h-3.5 w-3.5" />
                    <span>Halb</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Voll</span>
                  </>
                )}
              </button>
            )}
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full bg-background/90 backdrop-blur border shadow-sm text-muted-foreground cursor-grab active:cursor-grabbing touch-none select-none"
              {...attributes}
              {...listeners}
              data-testid={`drag-handle-${item.id}`}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </div>
        )}
        <CardContent content={section.content} editMode={editMode} />
      </div>
    </div>
  );
}

// We measure droppables only before drag starts. Since we keep the layout frozen
// during the drag, BeforeDragging is enough and avoids the jitter that
// MeasuringStrategy.Always introduces when masonry positions change.
const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.BeforeDragging,
  },
};

export default function DraggableCardGrid({ userId, role, sections, managerTitle, managerDescription, managerButtonLabel }: DraggableCardGridProps) {
  const [enabledIds, setEnabledIds] = useState<string[]>(() => loadEnabledIds(userId, role, sections));
  const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);
  const effectiveSections = useMemo(
    () => sections.filter(s => !s.optional || enabledSet.has(s.id)),
    [sections, enabledSet]
  );
  const optionalSections = useMemo(() => sections.filter(s => s.optional), [sections]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout(userId, role, effectiveSections));
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isLg, setIsLg] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [isMd, setIsMd] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const layoutRef = useRef<LayoutItem[]>(layout);
  const draggingRef = useRef(false);
  const [dragWidth, setDragWidth] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [containerWidth, setContainerWidth] = useState(0);
  const [masonryPositions, setMasonryPositions] = useState(new Map<string, MasonryPosition>());
  const [containerHeight, setContainerHeight] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const rafId = useRef(0);

  useEffect(() => { layoutRef.current = layout; }, [layout]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    setIsLg(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    setIsMd(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMd(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const cols = isLg && containerWidth > 0 ? 2 : 1;
  const colWidth = cols === 1 ? containerWidth : (containerWidth - GAP) / 2;

  const targetWidths = useMemo(() => {
    if (containerWidth === 0) return new Map<string, number>();
    return new Map(layout.map(item => [
      item.id,
      (item.size === "full" || cols === 1) ? containerWidth : colWidth
    ]));
  }, [layout, containerWidth, cols, colWidth]);

  const recalcPositions = useCallback(() => {
    if (containerWidth === 0) return;
    const currentLayout = layoutRef.current;
    const numCols = isLg ? 2 : 1;
    const cw = numCols === 1 ? containerWidth : (containerWidth - GAP) / 2;
    const colTops = Array(numCols).fill(0);
    const pos = new Map<string, MasonryPosition>();

    for (const item of currentLayout) {
      const el = cardRefs.current.get(item.id);
      const h = el ? el.offsetHeight : 200;
      const isFull = item.size === "full" || numCols === 1;
      const w = isFull ? containerWidth : cw;

      if (numCols === 1) {
        pos.set(item.id, { top: colTops[0], left: 0, width: containerWidth });
        colTops[0] += h + GAP;
      } else if (isFull) {
        const top = Math.max(colTops[0], colTops[1]);
        pos.set(item.id, { top, left: 0, width: w });
        colTops[0] = colTops[1] = top + h + GAP;
      } else {
        const col = colTops[0] <= colTops[1] ? 0 : 1;
        pos.set(item.id, { top: colTops[col], left: col * (cw + GAP), width: w });
        colTops[col] += h + GAP;
      }
    }

    setMasonryPositions(pos);
    setContainerHeight(Math.max(colTops[0] || 0, colTops[1] || 0));
    setIsReady(true);
  }, [containerWidth, isLg]);

  // Recalculate masonry when layout/container/breakpoint changes,
  // but NEVER while a drag is in flight — that's exactly what produced
  // the "random hin und her springen" feel.
  useEffect(() => {
    if (containerWidth === 0) return;
    if (draggingRef.current) return;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(recalcPositions);
  }, [layout, containerWidth, isLg, recalcPositions]);

  // ResizeObserver on the cards themselves — also skipped during drag.
  useEffect(() => {
    if (containerWidth === 0) return;
    const ro = new ResizeObserver(() => {
      if (draggingRef.current) return;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(recalcPositions);
    });
    cardRefs.current.forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, [layout.map(l => l.id).join(','), containerWidth, recalcPositions]);

  const handleRefChange = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const defaultIds = effectiveSections.map(s => s.id);
    const currentIds = layoutRef.current.map(l => l.id);
    const newIds = defaultIds.filter(id => !currentIds.includes(id));
    const removedIds = currentIds.filter(id => !defaultIds.includes(id));
    if (newIds.length > 0 || removedIds.length > 0) {
      const updated = layoutRef.current
        .filter(l => defaultIds.includes(l.id))
        .concat(newIds.map(id => ({ id, size: (effectiveSections.find(s => s.id === id)?.defaultSize || "full") as CardSize })));
      setLayout(updated);
      try { localStorage.setItem(getStorageKey(userId, role), JSON.stringify(updated)); } catch {}
    }
  }, [effectiveSections.map(s => s.id).join(","), userId, role]);

  // Fetch the persisted layout from the server on mount (or when user/role changes).
  // While the request is in flight we keep the localStorage-seeded layout so the dashboard
  // renders instantly. Once the server responds we adopt its version (server wins on
  // conflict) and update localStorage so it stays a fresh offline cache.
  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}/dashboard-layout/${encodeURIComponent(role)}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const reconciled = reconcileLayout(data?.layout, effectiveSections);
        if (cancelled || !reconciled) return;
        setLayout(prev => {
          if (layoutsEqual(prev, reconciled)) return prev;
          try { localStorage.setItem(getStorageKey(userId, role), JSON.stringify(reconciled)); } catch {}
          return reconciled;
        });
      } catch {
        // Network error / offline — keep the localStorage layout we already loaded.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, effectiveSections.map(s => s.id).join(",")]);

  // Push the layout back to the server, debounced so rapid swaps don't spam the API.
  // Always writes localStorage immediately so reloads are instant even without network.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRemote = useCallback((next: LayoutItem[]) => {
    if (!userId || !role) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiRequest(
        "PUT",
        `/api/users/${encodeURIComponent(userId)}/dashboard-layout/${encodeURIComponent(role)}`,
        { layout: next },
      ).catch(() => {
        // Server unreachable — localStorage already has the change, we'll sync on next save.
      });
    }, 400);
  }, [userId, role]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  // Fetch persisted enabled widget IDs from the server (server wins on conflict).
  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}/dashboard-widgets/${encodeURIComponent(role)}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const reconciled = reconcileEnabledIds(data?.widgets, sections);
        if (cancelled || !reconciled) return;
        setEnabledIds(prev => {
          const a = prev.slice().sort().join(",");
          const b = reconciled.slice().sort().join(",");
          if (a === b) return prev;
          try { localStorage.setItem(getWidgetsStorageKey(userId, role), JSON.stringify(reconciled)); } catch {}
          return reconciled;
        });
      } catch {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, sections.map(s => s.id).join(",")]);

  const widgetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistWidgetsRemote = useCallback((next: string[]) => {
    if (!userId || !role) return;
    if (widgetSaveTimer.current) clearTimeout(widgetSaveTimer.current);
    widgetSaveTimer.current = setTimeout(() => {
      apiRequest(
        "PUT",
        `/api/users/${encodeURIComponent(userId)}/dashboard-widgets/${encodeURIComponent(role)}`,
        { widgets: next },
      ).catch(() => {});
    }, 400);
  }, [userId, role]);

  useEffect(() => () => {
    if (widgetSaveTimer.current) clearTimeout(widgetSaveTimer.current);
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setEnabledIds(prev => {
      const has = prev.includes(id);
      const next = has ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem(getWidgetsStorageKey(userId, role), JSON.stringify(next)); } catch {}
      persistWidgetsRemote(next);
      return next;
    });
  }, [userId, role, persistWidgetsRemote]);

  const saveLayout = useCallback((newLayout: LayoutItem[]) => {
    setLayout(newLayout);
    try { localStorage.setItem(getStorageKey(userId, role), JSON.stringify(newLayout)); } catch {}
    persistRemote(newLayout);
  }, [userId, role, persistRemote]);

  const toggleSize = useCallback((id: string) => {
    const newLayout = layout.map(item =>
      item.id === id ? { ...item, size: (item.size === "full" ? "half" : "full") as CardSize } : item
    );
    saveLayout(newLayout);
  }, [layout, saveLayout]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    draggingRef.current = true;
    const el = document.querySelector(`[data-testid="draggable-card-${id}"]`) as HTMLElement | null;
    setDragWidth(el ? el.offsetWidth : 0);
    setActiveId(id);
    setOverId(null);
  }, []);

  // Only track which card the cursor is currently over — DO NOT mutate the layout here.
  // The layout stays exactly as it was at drag start, so the other cards don't shuffle.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || over.id === active.id) {
      setOverId(null);
      return;
    }
    setOverId(String(over.id));
  }, []);

  // On drop: swap the dragged card and the drop-target card in place. Nothing else moves.
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const aId = String(event.active.id);
    const oId = event.over ? String(event.over.id) : null;
    draggingRef.current = false;
    setActiveId(null);
    setOverId(null);

    if (oId && oId !== aId) {
      const current = layoutRef.current;
      const i = current.findIndex(l => l.id === aId);
      const j = current.findIndex(l => l.id === oId);
      if (i !== -1 && j !== -1 && i !== j) {
        const next = current.slice();
        const tmp = next[i];
        next[i] = next[j];
        next[j] = tmp;
        saveLayout(next);
        return;
      }
    }
    // No valid swap target: also kick a recalc to re-enable transitions cleanly.
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(recalcPositions);
  }, [saveLayout, recalcPositions]);

  const handleDragCancel = useCallback(() => {
    draggingRef.current = false;
    setActiveId(null);
    setOverId(null);
    // Layout was never mutated during the drag, so there's nothing to revert.
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(recalcPositions);
  }, [recalcPositions]);

  const sectionMap = useMemo(() => new Map(effectiveSections.map(s => [s.id, s])), [effectiveSections]);
  const layoutIds = useMemo(() => layout.map(l => l.id), [layout]);

  const activeItem = activeId ? layout.find(l => l.id === activeId) : null;
  const activeSection = activeItem ? sectionMap.get(activeItem.id) : null;

  return (
    <div className="relative">
      <div className="flex justify-end gap-1 mb-3 md:mb-4">
        {!editMode && optionalSections.length > 0 && (
          <button
            onClick={() => setPickerOpen(true)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
            data-testid="button-manage-widgets"
            title={managerButtonLabel || "Widgets verwalten"}
            aria-label={managerButtonLabel || "Widgets verwalten"}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        )}
        {editMode ? (
          <button
            onClick={() => setEditMode(false)}
            className="flex items-center gap-1.5 text-xs font-semibold transition-all px-3 py-1.5 rounded-full bg-primary text-primary-foreground shadow-sm hover-elevate active-elevate-2"
            data-testid="button-toggle-edit-mode"
            title="Anordnen beenden"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Fertig</span>
          </button>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
            data-testid="button-toggle-edit-mode"
            title="Dashboard anpassen"
            aria-label="Dashboard anpassen"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-manage-widgets">
          <DialogHeader>
            <DialogTitle>{managerTitle || "Widgets verwalten"}</DialogTitle>
            {managerDescription ? (
              <DialogDescription>{managerDescription}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {optionalSections.map(s => {
              const checked = enabledSet.has(s.id);
              return (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5"
                  data-testid={`widget-toggle-row-${s.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">{s.title || s.id}</div>
                    {s.description ? (
                      <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                    ) : null}
                  </div>
                  <Switch
                    checked={checked}
                    onCheckedChange={() => toggleWidget(s.id)}
                    data-testid={`widget-switch-${s.id}`}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setPickerOpen(false)} data-testid="button-close-manage-widgets">
              Fertig
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DndContext
        sensors={sensors}
        collisionDetection={swapCollision}
        measuring={measuringConfig}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={layoutIds}>
          <div
            ref={containerRef}
            className="relative"
            style={{ minHeight: containerHeight || 'auto' }}
          >
            {layout.map((item) => {
              const section = sectionMap.get(item.id);
              if (!section) return null;
              return (
                <SortableCard
                  key={item.id}
                  item={item}
                  section={section}
                  editMode={editMode}
                  onToggleSize={toggleSize}
                  isMd={isMd}
                  masonryPos={masonryPositions.get(item.id)}
                  targetWidth={targetWidths.get(item.id)}
                  isReady={isReady}
                  isSwapTarget={overId === item.id && activeId !== null}
                  isAnyDragging={activeId !== null}
                  onRefChange={handleRefChange}
                />
              );
            })}
          </div>
        </SortableContext>

        {/* No drop-animation: the overlay disappears at the drop point, and the underlying
            SortableCard slides to its new masonry position via its own CSS transition.
            That gives the desired "two cards swap" feel without a double animation. */}
        <DragOverlay dropAnimation={null}>
          {activeItem && activeSection ? (
            <div
              className="rounded-xl overflow-hidden ring-2 ring-primary/30"
              style={{
                width: dragWidth > 0 ? dragWidth : undefined,
                opacity: 0.96,
                boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.15)",
                transform: "scale(1.02)",
                cursor: "grabbing",
              }}
            >
              <div className="pointer-events-none select-none">
                {activeSection.content}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
