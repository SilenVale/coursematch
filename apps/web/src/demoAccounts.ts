/** 演示 / 答辩用快捷切换账号（须与后端 ensure-demo-accounts 一致）。 */
export const DEMO_ACCOUNTS = [
  { id: "teacher_blank", title: "teacher_blank", hint: "已配置" },
  { id: "20262001", title: "20262001", hint: "已报上" },
  { id: "20262099", title: "20262099", hint: "未报上" },
  { id: "mr_zhang", title: "Mr Zhang", hint: "空" },
  { id: "mr_li", title: "Mr Li", hint: "空" },
] as const;
