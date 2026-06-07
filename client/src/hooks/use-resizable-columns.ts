import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

export type ColumnWidths<K extends string> = Record<K, number>;

export interface UseResizableColumnsResult<K extends string> {
  widths: ColumnWidths<K>;
  gridTemplate: string;
  startResize: (key: K) => (e: React.PointerEvent) => void;
  resetWidths: () => void;
  isResizing: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  /** Sum of effective minimum widths of currently visible columns (use as table min-width). */
  tableMinWidth: number;
}

export interface UseResizableColumnsOptions<K extends string> {
  minWidth?: number;
  maxWidth?: number;
  flexKey?: K;
  /** Per-column minimum widths. Falls back to `minWidth`. */
  minWidths?: Partial<Record<K, number>>;
}

export function useResizableColumns<K extends string>(
  storageKey: string,
  defaults: ColumnWidths<K>,
  visibleKeys: readonly K[],
  options?: UseResizableColumnsOptions<K>,
): UseResizableColumnsResult<K> {
  const min = options?.minWidth ?? 60;
  const max = options?.maxWidth ?? 800;
  const flexKey = options?.flexKey;
  const perColMin = options?.minWidths;

  const getMin = useCallback(
    (k: K): number => Math.max(min, perColMin?.[k] ?? min),
    [min, perColMin],
  );

  const [widths, setWidths] = useState<ColumnWidths<K>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ColumnWidths<K>>;
        // Sanitize: clamp persisted widths to per-col mins so old corrupt data can't break layout
        const merged = { ...defaults, ...parsed };
        for (const key of Object.keys(merged) as K[]) {
          const m = Math.max(min, perColMin?.[key] ?? min);
          if (typeof merged[key] !== "number" || merged[key] < m) merged[key] = Math.max(m, defaults[key] ?? m) as any;
        }
        return merged;
      }
    } catch {}
    return defaults;
  });

  // Persist only currently-visible column widths so hidden columns don't drift the layout
  useEffect(() => {
    try {
      const subset: Partial<ColumnWidths<K>> = {};
      for (const k of visibleKeys) subset[k] = widths[k] ?? defaults[k];
      const raw = localStorage.getItem(storageKey);
      const merged: Partial<ColumnWidths<K>> = raw ? { ...JSON.parse(raw), ...subset } : subset;
      localStorage.setItem(storageKey, JSON.stringify(merged));
    } catch {}
  }, [storageKey, widths, visibleKeys, defaults]);

  const dragRef = useRef<{ key: K; startX: number; startWidth: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const startResize = useCallback(
    (key: K) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = widths[key] ?? defaults[key];
      dragRef.current = { key, startX: e.clientX, startWidth };
      setIsResizing(true);

      const containerWidth = containerRef.current?.clientWidth ?? 0;
      // Use MIN widths of other columns for upper-bound math so flex can shrink them sensibly
      const sumOtherMins = visibleKeys.reduce((acc, k) => {
        if (k === key) return acc;
        return acc + getMin(k);
      }, 0);
      const upperByContainer = containerWidth > 0 ? containerWidth - sumOtherMins : Infinity;
      const colMin = getMin(key);
      const upperBound = Math.max(colMin, Math.min(max, upperByContainer));

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const next = Math.max(colMin, Math.min(upperBound, dragRef.current.startWidth + dx));
        setWidths((prev) => ({ ...prev, [dragRef.current!.key]: next }));
      };
      const onUp = () => {
        dragRef.current = null;
        setIsResizing(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths, defaults, max, visibleKeys, getMin],
  );

  const gridTemplate = useMemo(
    () =>
      visibleKeys
        .map((k) => {
          const w = widths[k] ?? defaults[k];
          const m = getMin(k);
          // minmax(min, target) lets browser distribute space properly when grid total < container
          if (flexKey && k === flexKey) return `minmax(${m}px, 1fr)`;
          return `minmax(${m}px, ${Math.max(m, w)}px)`;
        })
        .join(" "),
    [visibleKeys, widths, defaults, flexKey, getMin],
  );

  const tableMinWidth = useMemo(
    () => visibleKeys.reduce((sum, k) => sum + getMin(k), 0),
    [visibleKeys, getMin],
  );

  const resetWidths = useCallback(() => setWidths(defaults), [defaults]);

  return { widths, gridTemplate, startResize, resetWidths, isResizing, containerRef, tableMinWidth };
}
