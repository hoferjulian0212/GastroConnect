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
}

export function useResizableColumns<K extends string>(
  storageKey: string,
  defaults: ColumnWidths<K>,
  visibleKeys: readonly K[],
  options?: { minWidth?: number; maxWidth?: number; flexKey?: K },
): UseResizableColumnsResult<K> {
  const min = options?.minWidth ?? 60;
  const max = options?.maxWidth ?? 800;
  const flexKey = options?.flexKey;

  const [widths, setWidths] = useState<ColumnWidths<K>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ColumnWidths<K>>;
        return { ...defaults, ...parsed };
      }
    } catch {}
    return defaults;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {}
  }, [storageKey, widths]);

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
      const sumOthers = visibleKeys.reduce((acc, k) => {
        if (k === key) return acc;
        return acc + (widths[k] ?? defaults[k]);
      }, 0);
      const flexMin =
        flexKey && flexKey !== key ? widths[flexKey] ?? defaults[flexKey] : 0;
      const upperByContainer =
        containerWidth > 0
          ? key === flexKey
            ? containerWidth - sumOthers
            : containerWidth - (sumOthers - flexMin) - flexMin
          : Infinity;
      const upperBound = Math.max(min, Math.min(max, upperByContainer));

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const next = Math.max(
          min,
          Math.min(upperBound, dragRef.current.startWidth + dx),
        );
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
    [widths, defaults, min, max, visibleKeys, flexKey],
  );

  const gridTemplate = useMemo(
    () =>
      visibleKeys
        .map((k) => {
          const w = widths[k] ?? defaults[k];
          if (flexKey && k === flexKey) return `minmax(${w}px, 1fr)`;
          return `${w}px`;
        })
        .join(" "),
    [visibleKeys, widths, defaults, flexKey],
  );

  const resetWidths = useCallback(() => setWidths(defaults), [defaults]);

  return { widths, gridTemplate, startResize, resetWidths, isResizing, containerRef };
}
