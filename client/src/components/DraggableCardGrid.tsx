import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical, Lock, Unlock } from "lucide-react";

interface DraggableCardGridProps {
  userId: string;
  role: string;
  sections: { id: string; content: React.ReactNode }[];
}

function getStorageKey(userId: string, role: string) {
  return `dashboard-layout-${userId}-${role}`;
}

function loadOrder(userId: string, role: string, defaultIds: string[]): string[] {
  try {
    const saved = localStorage.getItem(getStorageKey(userId, role));
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      const allExist = defaultIds.every(id => parsed.includes(id));
      const noExtras = parsed.every(id => defaultIds.includes(id));
      if (allExist && noExtras) return parsed;
    }
  } catch {}
  return defaultIds;
}

export default function DraggableCardGrid({ userId, role, sections }: DraggableCardGridProps) {
  const defaultIds = sections.map(s => s.id);
  const [order, setOrder] = useState<string[]>(() => loadOrder(userId, role, defaultIds));
  const [editMode, setEditMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const newIds = defaultIds.filter(id => !order.includes(id));
    const removedIds = order.filter(id => !defaultIds.includes(id));
    if (newIds.length > 0 || removedIds.length > 0) {
      const updated = order.filter(id => defaultIds.includes(id)).concat(newIds);
      setOrder(updated);
      localStorage.setItem(getStorageKey(userId, role), JSON.stringify(updated));
    }
  }, [defaultIds.join(",")]);

  const saveOrder = useCallback((newOrder: string[]) => {
    setOrder(newOrder);
    localStorage.setItem(getStorageKey(userId, role), JSON.stringify(newOrder));
  }, [userId, role]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDragId(id);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    setDragId(null);
    setOverId(null);
    dragNode.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragId && id !== dragId) {
      setOverId(id);
    }
  }, [dragId]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const newOrder = [...order];
    const fromIndex = newOrder.indexOf(dragId);
    const toIndex = newOrder.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, dragId);
    saveOrder(newOrder);
    setDragId(null);
    setOverId(null);
  }, [dragId, order, saveOrder]);

  const handleDragLeave = useCallback(() => {
    setOverId(null);
  }, []);

  const sectionMap = new Map(sections.map(s => [s.id, s]));

  const handleTouchMove = useRef<{ id: string; startY: number; currentIndex: number } | null>(null);

  const moveUp = useCallback((id: string) => {
    const idx = order.indexOf(id);
    if (idx <= 0) return;
    const newOrder = [...order];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    saveOrder(newOrder);
  }, [order, saveOrder]);

  const moveDown = useCallback((id: string) => {
    const idx = order.indexOf(id);
    if (idx === -1 || idx >= order.length - 1) return;
    const newOrder = [...order];
    [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
    saveOrder(newOrder);
  }, [order, saveOrder]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setEditMode(!editMode)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted/50"
          data-testid="button-toggle-edit-mode"
        >
          {editMode ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          <span>{editMode ? "Fertig" : "Anordnen"}</span>
        </button>
      </div>
      {order.map((id, index) => {
        const section = sectionMap.get(id);
        if (!section) return null;
        const isOver = overId === id && dragId !== id;
        return (
          <div
            key={id}
            draggable={editMode}
            onDragStart={editMode ? (e) => handleDragStart(e, id) : undefined}
            onDragEnd={editMode ? handleDragEnd : undefined}
            onDragOver={editMode ? (e) => handleDragOver(e, id) : undefined}
            onDrop={editMode ? (e) => handleDrop(e, id) : undefined}
            onDragLeave={editMode ? handleDragLeave : undefined}
            className={`relative transition-all ${editMode ? "cursor-grab active:cursor-grabbing" : ""} ${
              isOver ? "ring-2 ring-primary/50 ring-offset-2 rounded-xl" : ""
            } ${dragId === id ? "opacity-40" : ""}`}
            data-testid={`draggable-card-${id}`}
          >
            {editMode && (
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-0.5 bg-background border rounded-lg shadow-sm p-1" data-testid={`drag-handle-${id}`}>
                <button
                  onClick={(e) => { e.stopPropagation(); moveUp(id); }}
                  disabled={index === 0}
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  data-testid={`move-up-${id}`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 3L2 7h8L6 3z" fill="currentColor"/></svg>
                </button>
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <button
                  onClick={(e) => { e.stopPropagation(); moveDown(id); }}
                  disabled={index === order.length - 1}
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  data-testid={`move-down-${id}`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9l4-4H2l4 4z" fill="currentColor"/></svg>
                </button>
              </div>
            )}
            {section.content}
          </div>
        );
      })}
    </div>
  );
}
