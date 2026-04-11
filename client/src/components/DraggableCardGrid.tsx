import { useState, useCallback, useEffect, useMemo, memo } from "react";
import { GripVertical, Maximize2, Columns2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  isLg: boolean;
  isMd: boolean;
}

function SortableCard({ item, section, editMode, onToggleSize, isLg, isMd }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editMode });

  const isFull = item.size === "full";
  const widthPercent = (!isLg || isFull) ? "100%" : "calc(50% - 12px)";

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 0 : "auto",
    width: widthPercent,
    flexShrink: 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${editMode ? "ring-1 ring-border/40 rounded-xl" : ""}`}
      data-testid={`draggable-card-${item.id}`}
    >
      {editMode && (
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
  );
}

export default function DraggableCardGrid({ userId, role, sections }: DraggableCardGridProps) {
  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout(userId, role, sections));
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLg, setIsLg] = useState(false);
  const [isMd, setIsMd] = useState(false);

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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = layout.findIndex(l => l.id === active.id);
      const newIndex = layout.findIndex(l => l.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newLayout = arrayMove(layout, oldIndex, newIndex);
        saveLayout(newLayout);
      }
    }
  }, [layout, saveLayout]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);
  const layoutIds = useMemo(() => layout.map(l => l.id), [layout]);

  const activeItem = activeId ? layout.find(l => l.id === activeId) : null;
  const activeSection = activeItem ? sectionMap.get(activeItem.id) : null;

  const activeWidth = activeItem
    ? (!isLg || activeItem.size === "full") ? "100%" : "calc(50% - 12px)"
    : "100%";

  return (
    <div className="relative">
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={layoutIds} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-6">
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
                  isLg={isLg}
                  isMd={isMd}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay
          dropAnimation={{
            duration: 250,
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          }}
        >
          {activeItem && activeSection ? (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                width: activeWidth,
                opacity: 0.92,
                boxShadow: "0 25px 80px rgba(0,0,0,0.28), 0 10px 24px rgba(0,0,0,0.18)",
                transform: "scale(1.03) rotate(1deg)",
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
