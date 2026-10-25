import { useEffect, useRef, useState } from "react";

/** Slate-style topbar: hairline + blur after content scrolls under header. */
export function useTopbarScroll() {
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;

    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "height:1px;width:100%;pointer-events:none;flex:none";
    root.insertBefore(sentinel, root.firstChild);

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, []);

  return { mainRef, scrolled };
}
