import { useEffect, type RefObject } from "react";

/**
 * Forwards vertical touch drags in the body gutters (outside #root) to a
 * scrollable container. On tablet/desktop, #root has max-width so body gutters
 * are dead to touch — this hook makes them scroll the inner list.
 */
export function useGutterScroll(scrollRef: RefObject<HTMLDivElement>) {
  useEffect(() => {
    let lastY = 0;
    let active = false;

    function onTouchStart(e: TouchEvent) {
      const root = document.getElementById("root");
      if (!root || !scrollRef.current) return;
      const { left, right } = root.getBoundingClientRect();
      const { clientX, clientY } = e.touches[0];
      if (clientX >= left && clientX <= right) return; // inside panel — ignore
      active = true;
      lastY = clientY;
    }
    function onTouchMove(e: TouchEvent) {
      if (!active || !scrollRef.current) return;
      const { clientY } = e.touches[0];
      const delta = clientY - lastY;
      lastY = clientY;
      scrollRef.current.scrollTop -= delta;
    }
    function onTouchEnd() { active = false; }

    document.addEventListener("touchstart",  onTouchStart,  { passive: true });
    document.addEventListener("touchmove",   onTouchMove,   { passive: true });
    document.addEventListener("touchend",    onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart",  onTouchStart);
      document.removeEventListener("touchmove",   onTouchMove);
      document.removeEventListener("touchend",    onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef]);
}
