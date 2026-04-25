import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import { GripVertical, Maximize2, Columns2, Settings2, Check } from "lucide-react";
import {
  DndContext,
  closestCenter,
  pointerWithin,
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
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

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

interface MasonryPosition {
  top: number;
  left: number;
  width: number;
}

const GAP = 24;

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

const customCollision: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  const filtered = pw.filter(({ id }) => id !== args.active.id);
  if (filtered.length > 0) return filtered;

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
  onRefChange: (id: string, el: HTMLDivElement | null) => void;
}

function SortableCard({ item, section, editMode, onToggleSize, isMd, masonryPos, targetWidth, isReady, onRefChange }: SortableCardProps) {
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

  const style: React.CSSProperties = {
    position: 'absolute',
    top: masonryPos?.top ?? 0,
    left: masonryPos?.left ?? 0,
    width,
    opacity: isReady ? 1 : 0,
    transition: isReady
      ? 'top 350ms cubic-bezier(0.25,1,0.5,1), left 350ms cubic-bezier(0.25,1,0.5,1), width 350ms cubic-bezier(0.25,1,0.5,1), opacity 200ms ease'
      : 'none',
    zIndex: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={mergedRef}
      style={style}
      className={`${editMode ? "ring-1 ring-border/40 rounded-xl" : ""}`}
      data-testid={`draggable-card-${item.id}`}
    >
      {isDragging && (
        <div
          className="absolute inset-0 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5"
          style={{ zIndex: 10 }}
        />
      )}
      <div style={{ opacity: isDragging ? 0.06 : 1, transition: "opacity 150ms ease" }}>
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

const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

export default function DraggableCardGrid({ userId, role, sections }: DraggableCardGridProps) {
  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout(userId, role, sections));
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLg, setIsLg] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [isMd, setIsMd] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const layoutRef = useRef<LayoutItem[]>(layout);
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

  useEffect(() => {
    if (containerWidth === 0) return;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(recalcPositions);
  }, [layout, containerWidth, isLg, recalcPositions]);

  useEffect(() => {
    if (containerWidth === 0) return;
    const ro = new ResizeObserver(() => {
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

  const dragStartLayoutRef = useRef<LayoutItem[]>([]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    dragStartLayoutRef.current = layoutRef.current;
    const el = document.querySelector(`[data-testid="draggable-card-${id}"]`) as HTMLElement | null;
    setDragWidth(el ? el.offsetWidth : 0);
    setActiveId(id);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLayout((prev) => {
      const oldIndex = prev.findIndex(l => l.id === active.id);
      const newIndex = prev.findIndex(l => l.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleDragEnd = useCallback((_event: DragEndEvent) => {
    setActiveId(null);
    saveLayout(layoutRef.current);
  }, [saveLayout]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setLayout(dragStartLayoutRef.current);
  }, []);

  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);
  const layoutIds = useMemo(() => layout.map(l => l.id), [layout]);

  const activeItem = activeId ? layout.find(l => l.id === activeId) : null;
  const activeSection = activeItem ? sectionMap.get(activeItem.id) : null;

  return (
    <div className="relative">
      <div className="flex justify-end mb-3 md:mb-4">
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

      <DndContext
        sensors={sensors}
        collisionDetection={customCollision}
        measuring={measuringConfig}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={layoutIds} strategy={verticalListSortingStrategy}>
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
                  onRefChange={handleRefChange}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay
          dropAnimation={{
            duration: 300,
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          }}
        >
          {activeItem && activeSection ? (
            <div
              className="rounded-xl overflow-hidden ring-2 ring-primary/20"
              style={{
                width: dragWidth > 0 ? dragWidth : undefined,
                opacity: 0.95,
                boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.15)",
                transform: "scale(1.02)",
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
