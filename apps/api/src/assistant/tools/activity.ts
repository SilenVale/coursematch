import type { ConfirmAction } from "../model.js";

export interface ToolSpec {
  name: string;
  mode: "read" | "write";
  action?: ConfirmAction;
  description: string;
}

/** 工具清单。写操作一律先确认，真正调用仍走现有活动接口。 */
export const activityTools: ToolSpec[] = [
  { name: "read_draft", mode: "read", description: "查看当前选课草稿" },
  { name: "create_activity", mode: "write", action: "create", description: "创建活动并写入名单和课程" },
  { name: "add_topic", mode: "write", action: "add_topic", description: "在活动已创建后再添加一门可选课/一位授课教师" },
  { name: "publish_activity", mode: "write", action: "publish", description: "发布这场选课" },
  { name: "provision_accounts", mode: "write", action: "provision", description: "为名单里还没有账号的学号开通登录" },
  { name: "freeze_activity", mode: "write", action: "freeze", description: "截止后冻结志愿快照" },
  { name: "allocate_activity", mode: "write", action: "allocate", description: "按现有规则做一次主分配" },
];
