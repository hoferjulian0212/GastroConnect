import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { GripVertical, Maximize2, Columns2 } from "lucide-react";

type CardSize = "full" | "half";

interface CardSection {
  id: string;
  content: React.ReactNode;
  defaultSize?: CardSize;
}

interface DraggableCardGridProps {
  userId: string;
  role: string;
  sections: CardSection[];
}

interface LayoutItem {
  id: string;
  size: CardSize;
}

function getStorageKey(userId: string, role: string) {
  return `dashboard-grid-${userId}-${role}`;
}

function loadLayout(userId: string, role: string, sections: CardSection[]): LayoutItem[] {
  try {
    const saved = localStorage.getItem(getStorageKey(userId, role));
    if (saved) {
      const parsed = JSON.parse(saved) as LayoutItem[];
      const defaultIds = sections.map(s => s.id);
      const allExist = defaultIds.every(id => parsed.some(p => p.id === id));
      const noExtras = parsed.every(p => defaultIds.includes(p.id));
      if (allExist && noExtras) return parsed;
    }
  } catch {}
  return sections.map(s => ({ id: s.id, size: s.defaultSize || "full" }));
}

function reorderLayout(layout: LayoutItem[], fromId: string, toIndex: number): LayoutItem[] {
  const fromIndex = layout.findIndex(l => l.id === fromId);
  if (fromIndex === -1 || fromIndex === toIndex) return layout;
  const newLayout = [...layout];
  const [moved] = newLayout.splice(fromIndex, 1);
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
  newLayout.splice(Math.max(0, Math.min(insertAt, newLayout.length)), 0, moved);
  return newLayout;
}

export default function DraggableCardGrid({ userId, role, sections }: DraggableCardGridProps) {
  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout(userId, role, sections));
  const [editMode, setEditMode] = useState(false);
  const [dragState, setDragState] = useState<{
    id: string;
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [previewLayout, setPreviewLayout] = useState<LayoutItem[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef = useRef<number>(0);
  const lastTargetIdx = useRef<number>(-1);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const defaultIds = sections.map(s => s.id);
    const currentIds = layout.map(l => l.id);
    const newIds = defaultIds.filter(id => !currentIds.includes(id));
    const removedIds = currentIds.filter(id => !defaultIds.includes(id));
    if (newIds.length > 0 || removedIds.length > 0) {
      const updated = layout
        .filter(l => defaultIds.includes(l.id))
        .concat(newIds.map(id => ({ id, size: sections.find(s => s.id === id)?.defaultSize || "full" as CardSize })));
      setLayout(updated);
      localStorage.setItem(getStorageKey(userId, role), JSON.stringify(updated));
    }
  }, [sections.map(s => s.id).join(",")]);

  const saveLayout = useCallback((newLayout: LayoutItem[]) => {
    setLayout(newLayout);
    localStorage.setItem(getStorageKey(userId, role), JSON.stringify(newLayout));
  }, [userId, role]);

  const toggleSize = useCallback((id: string) => {
    const newLayout = layout.map(item =>
      item.id === id ? { ...item, size: (item.size === "full" ? "half" : "full") as CardSize } : item
    );
    saveLayout(newLayout);
  }, [layout, saveLayout]);

  const getTargetIndex = useCallback((px: number, py: number, currentLayout: LayoutItem[], dragId: string): number => {
    const items = currentLayout.filter(l => l.id !== dragId);
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < items.length; i++) {
      const el = cardEls.current.get(items[i].id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot((px - cx), (py - cy) * 0.7);

      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const bestEl = cardEls.current.get(items[bestIdx]?.id);
    if (bestEl) {
      const rect = bestEl.getBoundingClientRect();
      const cy = rect.top + rect.height / 2;
      const origIdx = currentLayout.findIndex(l => l.id === items[bestIdx].id);
      if (py > cy) {
        return origIdx + 1;
      }
      return origIdx;
    }
    return 0;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();

    const el = cardEls.current.get(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();

    pointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setDragState({
      id,
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      startX: rect.left,
      startY: rect.top,
    });
    setPreviewLayout(null);
    lastTargetIdx.current = -1;
  }, [editMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState || e.pointerId !== pointerIdRef.current) return;
    e.preventDefault();

    const px = e.clientX;
    const py = e.clientY;

    setDragState(prev => prev ? { ...prev, pointerX: px, pointerY: py } : null);

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const base = previewLayout || layout;
      const targetIdx = getTargetIndex(px, py, base, dragState.id);

      if (targetIdx !== lastTargetIdx.current) {
        lastTargetIdx.current = targetIdx;
        const newLayout = reorderLayout(base, dragState.id, targetIdx);
        const changed = newLayout.some((item, i) => item.id !== base[i]?.id);
        if (changed) {
          setPreviewLayout(newLayout);
        }
      }
    });
  }, [dragState, layout, previewLayout, getTargetIndex]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState || e.pointerId !== pointerIdRef.current) return;
    e.preventDefault();
    cancelAnimationFrame(rafRef.current);

    if (previewLayout) {
      saveLayout(previewLayout);
    }

    setDragState(null);
    setPreviewLayout(null);
    lastTargetIdx.current = -1;
    pointerIdRef.current = null;
  }, [dragState, previewLayout, saveLayout]);

  useEffect(() => {
    if (!editMode) {
      cancelAnimationFrame(rafRef.current);
      setDragState(null);
      setPreviewLayout(null);
      lastTargetIdx.current = -1;
      pointerIdRef.current = null;
    }
  }, [editMode]);

  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const handler = (e: Event) => e.preventDefault();
    document.addEventListener("touchmove", handler, { passive: false });
    return () => document.removeEventListener("touchmove", handler);
  }, [dragState]);

  const displayLayout = previewLayout || layout;
  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);
  const isDragging = !!dragState;

  const setCardRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) cardEls.current.set(id, el);
    else cardEls.current.delete(id);
  }, []);

  const draggedStyle = useMemo((): React.CSSProperties | undefined => {
    if (!dragState) return undefined;
    return {
      position: "fixed",
      left: dragState.pointerX - dragState.offsetX,
      top: dragState.pointerY - dragState.offsetY,
      width: dragState.width,
      zIndex: 9999,
      pointerEvents: "none",
      transform: "scale(1.04) rotate(1.2deg)",
      opacity: 0.92,
      borderRadius: "12px",
      boxShadow: "0 25px 80px rgba(0,0,0,0.28), 0 10px 24px rgba(0,0,0,0.18)",
      willChange: "transform, left, top",
    };
  }, [dragState]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex justify-end mb-3 md:mb-4">
        <button
          onClick={() => setEditMode(!editMode)}
          className={`flex items-center gap-1.5 text-xs font-medium transition-all px-3 py-1.5 rounded-full ${
            editMode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          data-testid="button-toggle-edit-mode"
        >
          <GripVertical className="h-3.5 w-3.5" />
          <span>{editMode ? "Fertig" : "Anordnen"}</span>
        </button>
      </div>

      <div
        ref={gridRef}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start"
        onPointerMove={isDragging ? handlePointerMove : undefined}
        onPointerUp={isDragging ? handlePointerUp : undefined}
        onPointerCancel={isDragging ? handlePointerUp : undefined}
      >
        {displayLayout.map((item) => {
          const section = sectionMap.get(item.id);
          if (!section) return null;

          const isFull = item.size === "full";
          const isBeingDragged = dragState?.id === item.id;

          if (isBeingDragged) {
            return (
              <div
                key={`placeholder-${item.id}`}
                className={`${isFull ? "col-span-1 lg:col-span-2" : "col-span-1"} transition-all duration-300 ease-out`}
              >
                <div
                  className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5"
                  style={{ height: dragState.height, minHeight: 60 }}
                  data-testid={`placeholder-${item.id}`}
                />
              </div>
            );
          }

          return (
            <div
              key={item.id}
              ref={setCardRef(item.id)}
              className={`relative ${isFull ? "col-span-1 lg:col-span-2" : "col-span-1"} transition-all duration-300 ease-out ${
                editMode ? "ring-1 ring-border/40 rounded-xl" : ""
              }`}
              data-testid={`draggable-card-${item.id}`}
            >
              {editMode && (
                <div
                  className="absolute right-2 top-2 z-20 flex items-center gap-1.5"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSize(item.id); }}
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
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-background/90 backdrop-blur border shadow-sm text-muted-foreground cursor-grab active:cursor-grabbing touch-none select-none"
                    onPointerDown={(e) => handlePointerDown(e, item.id)}
                    data-testid={`drag-handle-${item.id}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                </div>
              )}
              <div className={`${editMode ? "pointer-events-none select-none" : ""}`}>
                {section.content}
              </div>
            </div>
          );
        })}
      </div>

      {dragState && draggedStyle && (() => {
        const item = layout.find(l => l.id === dragState.id);
        const section = item ? sectionMap.get(item.id) : null;
        if (!section) return null;
        return (
          <div style={draggedStyle} className="rounded-xl overflow-hidden">
            <div className="pointer-events-none select-none">
              {section.content}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
