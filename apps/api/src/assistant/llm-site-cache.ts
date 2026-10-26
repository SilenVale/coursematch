export interface SiteLlmRecord {
  apiKey: string;
  apiUrl: string | null;
  model: string | null;
}

let siteLlm: SiteLlmRecord | null = null;

export function getSiteLlmCache(): SiteLlmRecord | null {
  return siteLlm;
}

export function setSiteLlmCache(record: SiteLlmRecord | null): void {
  siteLlm = record;
}

export function clearSiteLlmCache(): void {
  siteLlm = null;
}
