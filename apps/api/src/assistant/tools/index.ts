import type { ConfirmAction } from "../model.js";
import { activityTools, type ToolSpec } from "./activity.js";

export const tools: ToolSpec[] = activityTools;

export function findTool(name: string): ToolSpec | null {
  return tools.find((tool) => tool.name === name) ?? null;
}

export function isWriteTool(name: string): boolean {
  return findTool(name)?.mode === "write";
}

export function toolAction(name: string): ConfirmAction | null {
  return findTool(name)?.action ?? null;
}
