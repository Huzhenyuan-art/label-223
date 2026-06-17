#!/usr/bin/env bash
# 回声岛本地开发启动脚本 (Linux / macOS)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DARKGRAY='\033[1;30m'
NC='\033[0m'

# 参数解析
SKIP_ENV_COPY=false
SKIP_INSTALL=false
SKIP_SEED=false
NO_DOCKER=false

for arg in "$@"; do
  case $arg in
    --skip-env-copy) SKIP_ENV_COPY=true ;;
    --skip-install) SKIP_INSTALL=true ;;
    --skip-seed) SKIP_SEED=true ;;
    --no-docker) NO_DOCKER=true ;;
    *) echo "未知参数: $arg" && exit 1 ;;
  esac
done

step() {
    echo ""
    echo -e "${CYAN}==> $1${NC}"
}

success() {
    echo -e "${GREEN}✔  $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠  $1${NC}"
}

fail() {
    echo -e "${RED}✗  $1${NC}"
    exit 1
}

echo ""
echo -e "${MAGENTA}  回声岛 (Echo Island) - 本地开发启动${NC}"
echo -e "${MAGENTA}=========================================${NC}"

cd "$PROJECT_ROOT"

if [ "$SKIP_ENV_COPY" = false ]; then
    step "检查环境变量配置..."
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            warn "已从 .env.example 复制生成 .env 文件"
            warn "请根据需要修改 .env 中的配置，特别是 JWT_SECRET"
        else
            fail "未找到 .env.example 文件"
        fi
    else
        success ".env 文件已存在"
    fi
fi

if [ "$NO_DOCKER" = false ]; then
    step "检查 Docker Desktop 状态..."
    if ! docker version >/dev/null 2>&1; then
        fail "请先启动 Docker Desktop"
    fi
    success "Docker Desktop 正在运行"

    step "启动 MongoDB 容器..."
    docker compose up -d db
    success "MongoDB 容器已启动"

    step "等待 MongoDB 就绪..."
    cd "$PROJECT_ROOT/backend"
    MONGO_URI="mongodb://localhost:27223/echo_island" npm run wait:db
    cd "$PROJECT_ROOT"
    success "MongoDB 已就绪"
fi

cd "$PROJECT_ROOT/backend"

if [ "$SKIP_INSTALL" = false ]; then
    step "检查并安装后端依赖..."
    if [ ! -d "node_modules" ]; then
        warn "node_modules 不存在，开始安装依赖..."
        npm ci
        success "依赖安装完成"
    else
        success "依赖已安装"
    fi
fi

if [ "$SKIP_SEED" = false ] && [ "$NO_DOCKER" = false ]; then
    step "初始化演示数据..."
    if npm run seed; then
        success "演示数据初始化完成"
    else
        warn "数据初始化失败（可能已存在数据），继续启动..."
    fi
fi

step "启动后端开发服务..."
echo ""
echo -e "${WHITE}  服务地址:${NC}"
echo -e "${WHITE}  - API:     http://localhost:8223${NC}"
echo -e "${WHITE}  - 健康检查: http://localhost:8223/health${NC}"
echo -e "${WHITE}  - WS:      ws://localhost:8223/ws${NC}"
echo ""
echo -e "${WHITE}  演示账号 (统一密码: password1):${NC}"
echo -e "${WHITE}  - admin     (管理员)${NC}"
echo -e "${WHITE}  - fogdao    (月度会员)${NC}"
echo -e "${WHITE}  - tide_writer${NC}"
echo -e "${WHITE}  - lowfreq_fan${NC}"
echo -e "${WHITE}  - calm_asker${NC}"
echo ""
echo -e "${DARKGRAY}按 Ctrl+C 停止服务${NC}"
echo ""

npm run dev
