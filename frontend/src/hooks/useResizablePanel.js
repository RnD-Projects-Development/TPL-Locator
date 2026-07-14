import { useCallback, useRef, useState } from "react";

/**
 * Drag-to-resize state for a side panel.
 *
 * Returns { width, handleProps } — spread `handleProps` onto a slim vertical
 * divider element rendered next to the panel. Dragging it resizes the panel,
 * double-clicking resets to the default, and the chosen width persists in
 * localStorage under `storageKey`.
 *
 * `edge` is which edge of the PANEL the handle sits on:
 *   - "right" → panel is on the left side of the screen (dragging right grows it)
 *   - "left"  → panel is on the right side of the screen (dragging left grows it)
 */
export function useResizablePanel(storageKey, { defaultWidth = 260, min = 180, max = 520, edge = "right" } = {}) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= min && saved <= max) return saved;
    } catch {}
    return defaultWidth;
  });

  const dragRef = useRef(null);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = dragRef.current?.lastWidth ?? width;
    const dir = edge === "right" ? 1 : -1;

    // Freeze text selection + show the resize cursor everywhere while dragging.
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    let latest = startWidth;
    const onMove = (ev) => {
      latest = Math.min(max, Math.max(min, startWidth + dir * (ev.clientX - startX)));
      setWidth(latest);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      dragRef.current = { lastWidth: latest };
      try { localStorage.setItem(storageKey, String(latest)); } catch {}
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width, min, max, edge, storageKey]);

  const onDoubleClick = useCallback(() => {
    setWidth(defaultWidth);
    dragRef.current = { lastWidth: defaultWidth };
    try { localStorage.setItem(storageKey, String(defaultWidth)); } catch {}
  }, [defaultWidth, storageKey]);

  return {
    width,
    handleProps: {
      onMouseDown,
      onDoubleClick,
      title: "Drag to resize · double-click to reset",
    },
  };
}
