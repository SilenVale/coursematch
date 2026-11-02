/** 课种名匹配键：去首尾空白、合并连续空白（中文课名不做大小写变换）。 */
export function normalizeCatalogName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
