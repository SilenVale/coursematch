import { useEffect } from "react";

const Aeye_CSS_ID = "aeye-landing-css";
const WF_PAGE_ID = "69cb64675294f782e2317f60";

const SCRIPT_CHAIN = [
  "/aeye/js/jquery-3.5.1.min.dc5e7f18c8.js",
  "/aeye/js/gsap.min.js",
  "/aeye/js/ScrollTrigger.min.js",
  "/aeye/js/ScrambleTextPlugin.min.js",
  "/aeye/js/aeye-saas.schunk.a3140c51201be139.js",
  "/aeye/js/aeye-saas.schunk.1095e6abef78453b.js",
  "/aeye/js/aeye-saas.97c7732b.443184e11cde16a4.js",
] as const;

type WebflowWindow = Window & {
  Webflow?: {
    destroy?: () => void;
    ready?: () => void;
    require?: (name: string) => { init: () => void };
  };
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-aeye-src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset.aeyeSrc = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(el);
  });
}

function initWebflowInteractions() {
  const html = document.documentElement;
  html.setAttribute("data-wf-page", WF_PAGE_ID);

  const w = window as WebflowWindow;
  try {
    w.Webflow?.require?.("ix2")?.init();
  } catch {
    /* 依赖 CSS :hover 兜底 */
  }
}

/** 仅在落地页挂载 Aeye 样式与 Webflow/GSAP 脚本，离开页面时卸载。 */
export function useAeyeLandingScripts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let css = document.getElementById(Aeye_CSS_ID) as HTMLLinkElement | null;
    if (!css) {
      css = document.createElement("link");
      css.id = Aeye_CSS_ID;
      css.rel = "stylesheet";
      css.href = "/aeye/css/aeye.css";
      document.head.appendChild(css);
    }

    let cancelled = false;
    const timers: number[] = [];

    void (async () => {
      try {
        for (const src of SCRIPT_CHAIN) {
          if (cancelled) break;
          await loadScript(src);
        }
        if (!cancelled) {
          initWebflowInteractions();
          timers.push(window.setTimeout(initWebflowInteractions, 120));
          timers.push(window.setTimeout(initWebflowInteractions, 480));
        }
      } catch {
        /* 动效脚本失败时仍展示静态页 */
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      document.getElementById(Aeye_CSS_ID)?.remove();
      document.documentElement.removeAttribute("data-wf-page");
      for (const src of SCRIPT_CHAIN) {
        document.querySelector(`script[data-aeye-src="${src}"]`)?.remove();
      }
    };
  }, [enabled]);
}
