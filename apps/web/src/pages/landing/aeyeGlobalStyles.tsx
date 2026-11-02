/** Aeye 模板 global-styles（与 Webflow 导出一致） */
export function AeyeGlobalStyles() {
  return (
    <div className="global-styles w-embed">
      <style>{`
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
.container-medium, .container-small, .container-large {
  margin-right: auto !important;
  margin-left: auto !important;
}
.hide { display: none !important; }
      `}</style>
    </div>
  );
}
