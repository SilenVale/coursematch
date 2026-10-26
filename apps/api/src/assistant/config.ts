/** 选课助理的运行边界。对应个人助理里的 config：模型、循环、工具权限。 */

export const assistantConfig = {
  provider: "deepseek",
  model: "deepseek-flash",
  url: "https://api.deepseek.com/chat/completions",
  /** 一轮老师发言只思考一次，观察由规则在本地完成。 */
  maxModelCallsPerTurn: 1,
  /** 短期记忆只保留最近几句，不落库。 */
  maxShortTerm: 8,
  timeoutMs: 20000,
} as const;
