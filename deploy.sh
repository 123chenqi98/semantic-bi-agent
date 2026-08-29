#!/usr/bin/env bash
# ============================================================
# 一键部署到阿里云 ECS（语义层 BI Agent）
#
# 用法：
#   ./deploy.sh                  # 运行后按提示输入服务器 root 密码
#   ECS_PASSWORD='你的密码' ./deploy.sh   # 或通过环境变量传入（免交互）
#
# 自动完成：构建前端 → 打包 → 上传 → 服务器解压重启 → 公网验证
# 依赖：macOS 自带 bash/expect/tar，项目 web/ 目录需已 npm install
# ============================================================
set -euo pipefail

SERVER="root@8.133.193.224"
REMOTE_DIR="/opt/semantic-bi-agent"
SERVICE="semantic-bi-agent"
HEALTH_URL="http://8.133.193.224/api/health"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}▶ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

command -v expect >/dev/null || fail "未找到 expect（macOS 自带，请检查环境）"

if [ -z "${ECS_PASSWORD:-}" ]; then
  read -s -p "请输入服务器 root 密码: " ECS_PASSWORD
  echo
  [ -n "$ECS_PASSWORD" ] || fail "密码不能为空"
fi
export ECS_PASSWORD

# ---------- [1/5] 构建前端 ----------
info "[1/5] 构建前端生产包..."
if [ ! -d "$PROJECT_ROOT/web/node_modules" ]; then
  warn "未发现 node_modules，先执行 npm install..."
  (cd "$PROJECT_ROOT/web" && npm install)
fi
(cd "$PROJECT_ROOT/web" && npm run build)

# ---------- [2/5] 打包部署文件 ----------
info "[2/5] 打包部署文件（后端 + 数据 + .env + 前端产物）..."
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE" /tmp/semantic-bi-agent.tar.gz' EXIT
mkdir -p "$STAGE/static"
cp -R "$PROJECT_ROOT/src" "$STAGE/"
cp -R "$PROJECT_ROOT/data" "$STAGE/"
cp "$PROJECT_ROOT/wsgi.py" "$PROJECT_ROOT/requirements.txt" "$PROJECT_ROOT/.env" "$STAGE/"
cp -R "$PROJECT_ROOT/web/dist/." "$STAGE/static/"
find "$STAGE" \( -name '__pycache__' -o -name '*.pyc' \) -prune -exec rm -rf {} + 2>/dev/null || true
COPYFILE_DISABLE=1 tar -czf /tmp/semantic-bi-agent.tar.gz -C "$STAGE" .
ls -lh /tmp/semantic-bi-agent.tar.gz | awk '{print "   包大小:", $5}'

# ---------- [3/5] 上传 ----------
info "[3/5] 上传到服务器 $SERVER ..."
expect <<'EXPECT_EOF'
set timeout 300
set password $env(ECS_PASSWORD)
spawn scp -o StrictHostKeyChecking=no /tmp/semantic-bi-agent.tar.gz root@8.133.193.224:/opt/
expect {
  -re "(?i)password:" { send "$password\r"; exp_continue }
  eof
}
catch wait result
exit [lindex $result 3]
EXPECT_EOF

# ---------- [4/5] 服务器解压并重启服务 ----------
info "[4/5] 服务器更新文件并重启 $SERVICE ..."
expect <<'EXPECT_EOF'
set timeout 300
set password $env(ECS_PASSWORD)
spawn ssh -o StrictHostKeyChecking=no root@8.133.193.224 {set -e; cd /opt/semantic-bi-agent && rm -rf src static data wsgi.py requirements.txt .env && tar -xzf /opt/semantic-bi-agent.tar.gz -C /opt/semantic-bi-agent 2>/dev/null && systemctl restart semantic-bi-agent && sleep 3 && systemctl is-active semantic-bi-agent && echo REMOTE_UPDATE_OK}
expect {
  -re "(?i)password:" { send "$password\r"; exp_continue }
  eof
}
catch wait result
exit [lindex $result 3]
EXPECT_EOF

# ---------- [5/5] 公网验证 ----------
info "[5/5] 验证公网访问..."
sleep 2
resp="$(curl -s --max-time 15 "$HEALTH_URL" || true)"
echo "   $resp"
if echo "$resp" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ 部署成功！访问地址：http://8.133.193.224${NC}"
else
  fail "公网健康检查未通过，可登录服务器查看日志：journalctl -u $SERVICE -f"
fi
