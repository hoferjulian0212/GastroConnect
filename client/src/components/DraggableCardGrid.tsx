import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical, Maximize2, Minimize2, Columns2 } from "lucide-react";

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
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
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
    const el = e.currentTarget;
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
    requestAnimationFrame(() => {
      el.style.opacity = "0.3";
      el.style.transform = "scale(0.95)";
    });
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = "1";
    e.currentTarget.style.transform = "";
    setDragId(null);
    setDropTarget(null);
    if (dragGhost.current) {
      document.body.removeChild(dragGhost.current);
      dragGhost.current = null;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragId || id === dragId) {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "before" : "after";
    setDropTarget({ id, position });
  }, [dragId]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const newLayout = [...layout];
    const fromIndex = newLayout.findIndex(l => l.id === dragId);
    const toIndex = newLayout.findIndex(l => l.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = newLayout.splice(fromIndex, 1);
    const insertAt = dropTarget?.position === "after" ? 
      (fromIndex < toIndex ? toIndex : toIndex + 1) : 
      (fromIndex < toIndex ? toIndex - 1 : toIndex);
    newLayout.splice(Math.max(0, insertAt), 0, moved);
    saveLayout(newLayout);
    setDragId(null);
    setDropTarget(null);
  }, [dragId, layout, dropTarget, saveLayout]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) {
      setDropTarget(null);
    }
  }, []);

  const sectionMap = new Map(sections.map(s => [s.id, s]));

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        {layout.map((item) => {
          const section = sectionMap.get(item.id);
          if (!section) return null;
          const isFull = item.size === "full";
          const isDragging = dragId === item.id;
          const isDropBefore = dropTarget?.id === item.id && dropTarget.position === "before";
          const isDropAfter = dropTarget?.id === item.id && dropTarget.position === "after";

          return (
            <div
              key={item.id}
              draggable={editMode}
              onDragStart={editMode ? (e) => handleDragStart(e, item.id) : undefined}
              onDragEnd={editMode ? handleDragEnd : undefined}
              onDragOver={editMode ? (e) => handleDragOver(e, item.id) : undefined}
              onDrop={editMode ? (e) => handleDrop(e, item.id) : undefined}
              onDragLeave={editMode ? handleDragLeave : undefined}
              className={`relative transition-all duration-200 ${
                isFull ? "lg:col-span-2" : "lg:col-span-1"
              } ${editMode ? "cursor-grab active:cursor-grabbing" : ""} ${
                isDragging ? "opacity-30 scale-95" : ""
              } ${editMode && !isDragging ? "ring-1 ring-border/50 rounded-xl" : ""}`}
              style={{
                ...(isDropBefore ? { paddingTop: "4px", borderTop: "3px solid hsl(var(--primary))", borderRadius: "12px" } : {}),
                ...(isDropAfter ? { paddingBottom: "4px", borderBottom: "3px solid hsl(var(--primary))", borderRadius: "12px" } : {}),
              }}
              data-testid={`draggable-card-${item.id}`}
            >
              {editMode && (
                <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5" data-testid={`card-controls-${item.id}`}>
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
        })}
      </div>
    </div>
  );
}
