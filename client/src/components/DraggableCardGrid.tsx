import { useState, useRef, useCallback, useEffect } from "react";
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
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragGhost = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    const ghost = document.createElement("div");
    ghost.style.width = "200px";
    ghost.style.height = "60px";
    ghost.style.background = "hsl(var(--primary))";
    ghost.style.borderRadius = "12px";
    ghost.style.opacity = "0.8";
    ghost.style.position = "fixed";
    ghost.style.top = "-1000px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 100, 30);
    dragGhost.current = ghost;
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropIndex(null);
    if (dragGhost.current) {
      document.body.removeChild(dragGhost.current);
      dragGhost.current = null;
    }
  }, []);

  const handleSlotDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  }, []);

  const handleSlotDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (!dragId) return;

    const newLayout = [...layout];
    const fromIndex = newLayout.findIndex(l => l.id === dragId);
    if (fromIndex === -1) return;

    const [moved] = newLayout.splice(fromIndex, 1);
    const adjustedIndex = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
    newLayout.splice(Math.max(0, adjustedIndex), 0, moved);
    saveLayout(newLayout);
    setDragId(null);
    setDropIndex(null);
  }, [dragId, layout, saveLayout]);

  const sectionMap = new Map(sections.map(s => [s.id, s]));

  const draggedItem = dragId ? layout.find(l => l.id === dragId) : null;
  const draggedSize = draggedItem?.size || "full";

  const computeGridSlots = () => {
    const slots: { type: "card"; item: LayoutItem; index: number }[] = [];
    layout.forEach((item, i) => {
      slots.push({ type: "card", item, index: i });
    });
    return slots;
  };

  const slots = computeGridSlots();

  const renderDropZone = (index: number, spanFull: boolean) => {
    if (!editMode || !dragId) return null;
    const isActive = dropIndex === index;
    return (
      <div
        key={`drop-${index}`}
        className={`rounded-xl border-2 border-dashed transition-all duration-200 ${spanFull ? "col-span-1 lg:col-span-2" : "col-span-1"} ${
          isActive
            ? "border-primary bg-primary/10 min-h-[60px]"
            : "border-transparent min-h-[8px] hover:border-muted-foreground/30 hover:bg-muted/20 hover:min-h-[40px]"
        }`}
        onDragOver={(e) => handleSlotDragOver(e, index)}
        onDrop={(e) => handleSlotDrop(e, index)}
        data-testid={`drop-zone-${index}`}
      >
        {isActive && (
          <div className="flex items-center justify-center h-full min-h-[60px] text-xs text-primary font-medium">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Hier ablegen
            </div>
          </div>
        )}
      </div>
    );
  };

  const buildGridItems = () => {
    const items: React.ReactNode[] = [];

    if (editMode && dragId) {
      items.push(renderDropZone(0, draggedSize === "full"));
    }

    slots.forEach((slot) => {
      const section = sectionMap.get(slot.item.id);
      if (!section) return;

      const isFull = slot.item.size === "full";
      const isDragging = dragId === slot.item.id;

      items.push(
        <div
          key={slot.item.id}
          className={`relative ${isFull ? "col-span-1 lg:col-span-2" : "col-span-1"} transition-all duration-200 ${
            isDragging ? "opacity-20 scale-[0.97]" : ""
          } ${editMode && !isDragging ? "ring-1 ring-border/40 rounded-xl" : ""}`}
          draggable={editMode}
          onDragStart={editMode ? (e) => handleDragStart(e, slot.item.id) : undefined}
          onDragEnd={editMode ? handleDragEnd : undefined}
          onDragOver={editMode && dragId && dragId !== slot.item.id ? (e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
              setDropIndex(slot.index);
            } else {
              setDropIndex(slot.index + 1);
            }
          } : undefined}
          onDrop={editMode ? (e) => {
            e.preventDefault();
            if (dropIndex !== null) {
              handleSlotDrop(e, dropIndex);
            }
          } : undefined}
          data-testid={`draggable-card-${slot.item.id}`}
        >
          {editMode && (
            <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); toggleSize(slot.item.id); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shadow-sm text-xs font-medium transition-all ${
                  isFull
                    ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                }`}
                data-testid={`toggle-size-${slot.item.id}`}
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
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background/90 backdrop-blur border shadow-sm text-muted-foreground cursor-grab">
                <GripVertical className="h-4 w-4" />
              </div>
            </div>
          )}
          <div className={`${editMode ? "pointer-events-none select-none" : ""}`}>
            {section.content}
          </div>
        </div>
      );

      if (editMode && dragId && slot.item.id !== dragId) {
        const nextSlot = slots.find(s => s.index === slot.index + 1);
        const showAfterDrop = !nextSlot || nextSlot.item.id !== dragId;
        if (showAfterDrop) {
          items.push(renderDropZone(slot.index + 1, draggedSize === "full"));
        }
      }
    });

    return items;
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">
        {buildGridItems()}
      </div>
    </div>
  );
}
