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

export default function DraggableCardGrid({ userId, role, sections }: DraggableCardGridProps) {
  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout(userId, role, sections));
  const [editMode, setEditMode] = useState(false);

  const [dragId, setDragId] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [previewLayout, setPreviewLayout] = useState<LayoutItem[] | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const isDraggingRef = useRef(false);

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

  const snapshotRects = useCallback(() => {
    const rects = new Map<string, DOMRect>();
    cardRefs.current.forEach((el, id) => {
      rects.set(id, el.getBoundingClientRect());
    });
    cardRectsRef.current = rects;
  }, []);

  const getTargetIndex = useCallback((clientX: number, clientY: number, currentLayout: LayoutItem[]): number => {
    let closest = -1;
    let closestDist = Infinity;

    for (let i = 0; i < currentLayout.length; i++) {
      const item = currentLayout[i];
      if (item.id === dragId) continue;
      const rect = cardRectsRef.current.get(item.id);
      if (!rect) continue;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - centerY) * 2 + Math.abs(clientX - centerX) * 0.5;

      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }

    if (closest === -1) return 0;

    const closestRect = cardRectsRef.current.get(currentLayout[closest].id);
    if (closestRect) {
      const centerY = closestRect.top + closestRect.height / 2;
      if (clientY > centerY) {
        return closest + 1;
      }
    }
    return closest;
  }, [dragId]);

  const computePreview = useCallback((clientX: number, clientY: number) => {
    if (!dragId) return;
    const targetIdx = getTargetIndex(clientX, clientY, layout);
    const fromIdx = layout.findIndex(l => l.id === dragId);
    if (fromIdx === -1) return;

    const newLayout = [...layout];
    const [moved] = newLayout.splice(fromIdx, 1);
    const insertAt = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    newLayout.splice(Math.max(0, insertAt), 0, moved);

    const changed = newLayout.some((item, i) => item.id !== (previewLayout || layout)[i]?.id);
    if (changed) {
      setPreviewLayout(newLayout);
    }
  }, [dragId, layout, previewLayout, getTargetIndex]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();

    const el = cardRefs.current.get(id);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragId(id);
    setPointerPos({ x: e.clientX, y: e.clientY });
    isDraggingRef.current = true;

    snapshotRects();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editMode, snapshotRects]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !dragId) return;
    e.preventDefault();

    setPointerPos({ x: e.clientX, y: e.clientY });
    computePreview(e.clientX, e.clientY);
  }, [dragId, computePreview]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !dragId) return;
    e.preventDefault();

    if (previewLayout) {
      saveLayout(previewLayout);
    }

    isDraggingRef.current = false;
    setDragId(null);
    setPointerPos(null);
    setPreviewLayout(null);
  }, [dragId, previewLayout, saveLayout]);

  useEffect(() => {
    if (!editMode) {
      setDragId(null);
      setPointerPos(null);
      setPreviewLayout(null);
      isDraggingRef.current = false;
    }
  }, [editMode]);

  const displayLayout = previewLayout || layout;
  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);

  const getDragStyle = useCallback((id: string): React.CSSProperties => {
    if (id !== dragId || !pointerPos) return {};
    const origRect = cardRectsRef.current.get(id);
    if (!origRect) return {};
    return {
      position: "fixed",
      left: pointerPos.x - dragOffset.x,
      top: pointerPos.y - dragOffset.y,
      width: origRect.width,
      zIndex: 9999,
      pointerEvents: "none",
      transform: "scale(1.03) rotate(1.5deg)",
      opacity: 0.92,
      boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.15)",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    };
  }, [dragId, pointerPos, dragOffset]);

  const setCardRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  return (
    <div ref={containerRef}>
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
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {displayLayout.map((item) => {
          const section = sectionMap.get(item.id);
          if (!section) return null;

          const isFull = item.size === "full";
          const isDragging = dragId === item.id;
          const isLifted = isDragging && pointerPos !== null;

          return (
            <div
              key={item.id}
              ref={setCardRef(item.id)}
              className={`relative ${isFull ? "col-span-1 lg:col-span-2" : "col-span-1"} ${
                isLifted ? "" : "transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
              } ${
                isDragging && !isLifted ? "opacity-30" : ""
              } ${
                editMode && !isDragging ? "ring-1 ring-border/40 rounded-xl" : ""
              } ${
                editMode ? "cursor-grab active:cursor-grabbing" : ""
              }`}
              style={isLifted ? getDragStyle(item.id) : undefined}
              data-testid={`draggable-card-${item.id}`}
            >
              {editMode && (
                <div
                  className="absolute right-2 top-2 z-20 flex items-center gap-1.5"
                  onPointerDown={(e) => e.stopPropagation()}
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
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-background/90 backdrop-blur border shadow-sm text-muted-foreground cursor-grab touch-none"
                    onPointerDown={(e) => handlePointerDown(e, item.id)}
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

        {dragId && pointerPos && (
          <div
            className="col-span-1 lg:col-span-2 pointer-events-none"
            style={{ height: 0, overflow: "visible" }}
          />
        )}
      </div>
    </div>
  );
}
