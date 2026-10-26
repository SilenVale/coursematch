#!/usr/bin/env bash
# 将本机 DEEPSEEK_API_KEY 同步到 Dev（通过已登录教师的「全站配置」接口，密钥不进仓库）。
# 长期方案仍建议在 Render Dashboard 设置 DEEPSEEK_API_KEY（Secret）；本脚本适合合并部署后快速恢复。
set -euo pipefail

ORIGIN="${COURSEMATCH_ORIGIN:-https://coursematch-dev.onrender.com}"
TEACHER_ID="${COURSEMATCH_TEACHER_ID:-teacher_blank}"
TEACHER_PASSWORD="${COURSEMATCH_TEACHER_PASSWORD:-Coursematch-Dev-2026}"
API_URL="${DEEPSEEK_API_URL:-https://api.deepseek.com/chat/completions}"
MODEL="${DEEPSEEK_MODEL:-deepseek-flash}"

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY 未设置（请在本机 shell 环境变量中配置）" >&2
  exit 1
fi

JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

curl -sf -c "$JAR" \
  -H "Content-Type: application/json" \
  -H "X-CourseMatch-Request: 1" \
  -H "Origin: $ORIGIN" \
  -d "{\"identifier\":\"$TEACHER_ID\",\"password\":\"$TEACHER_PASSWORD\"}" \
  "$ORIGIN/api/auth/login" >/dev/null

curl -sf -b "$JAR" \
  -H "Content-Type: application/json" \
  -H "X-CourseMatch-Request: 1" \
  -H "Origin: $ORIGIN" \
  -X PUT \
  -d "{\"apiKey\":\"$DEEPSEEK_API_KEY\",\"apiUrl\":\"$API_URL\",\"model\":\"$MODEL\"}" \
  "$ORIGIN/api/assistant/llm-config" >/dev/null

curl -sf -b "$JAR" -H "X-CourseMatch-Request: 1" -H "Origin: $ORIGIN" \
  "$ORIGIN/api/assistant/llm-status" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('data'), ensure_ascii=False))"

echo "已同步到 $ORIGIN（serverKeyStore=file；Render 重新部署后可能需再跑一次，或改用 Dashboard 环境变量）"
