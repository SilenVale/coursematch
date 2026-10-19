# API 错误码

与 `docs/contracts/api-contracts.ts` 中 `ErrorCode` 一致。完整 HTTP 映射见设计报告 §5.3。

| code | 典型 HTTP | 含义 |
|---|---|---|
| INVALID_INPUT | 400 | 格式、范围、重复志愿等 |
| IMPORT_INVALID | 400 | CSV 行错误 |
| INVALID_CREDENTIALS | 401 | 登录失败 |
| UNAUTHENTICATED | 401 | 未登录或会话失效 |
| NOT_ELIGIBLE | 403 | 题目资格不符 |
| ROLE_FORBIDDEN | 403 | 角色不允许 |
| REQUEST_ORIGIN_FORBIDDEN | 403 | 缺少可信 Origin 或 `X-CourseMatch-Request` |
| RESOURCE_NOT_FOUND | 404 | 无资源或无访问权 |
| VERSION_CONFLICT | 409 | 配置或志愿版本过期 |
| DEADLINE_REACHED | 409 | 已过截止 |
| FREEZE_REQUIRED | 409 | 尚未冻结不能分配 |
| ALREADY_ALLOCATED | 409 | 已成功分配后禁止作废或改结果 |
| RATE_LIMITED | 429 | 登录/改密过频 |
| INTERNAL_ERROR | 500 | 未预期错误 |
| SERVICE_UNAVAILABLE | 503 | 数据库不可用或超时 |

响应形状：`{ error: { code, message, fieldErrors?, rowErrors? }, serverTime }`。
