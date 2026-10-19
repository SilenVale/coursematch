import type { ErrorCode } from "@coursematch/shared";

export function serverTime(): string {
  return new Date().toISOString();
}

export function ok<T>(data: T) {
  return { data, serverTime: serverTime() };
}

export function fail(
  code: ErrorCode,
  message: string,
  status: number,
  extra?: { fieldErrors?: unknown[]; rowErrors?: unknown[] },
) {
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...extra,
      },
      serverTime: serverTime(),
    },
  };
}
