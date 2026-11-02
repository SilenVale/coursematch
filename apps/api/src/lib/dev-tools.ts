/** 联调工具（模拟填报、清空、一键分配）仅在显式开启时可用。 */
export function isDevToolsEnabled(): boolean {
  const raw = process.env.ENABLE_DEV_TOOLS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
