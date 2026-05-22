#!/bin/bash
# ============================================
# ToolBox 产品介绍网站 - 一键部署脚本
# 支持: Alibaba Cloud Linux (alinux)、CentOS、Ubuntu、Debian
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 检测是否有 sudo 权限
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        error "需要 root 权限，请使用 sudo 运行此脚本"
    fi
fi

echo "============================================"
echo "  ToolBox 产品介绍网站 - 一键部署脚本"
echo "============================================"
echo ""

# ---------- 1. 检测系统 ----------
info "检测操作系统..."
OS_ID=""
if [ -f /etc/os-release ]; then
    OS_ID=$(grep -oP '^ID=\K.*' /etc/os-release 2>/dev/null || grep '^ID=' /etc/os-release | cut -d= -f2)
    OS_VERSION=$(grep -oP '^VERSION_ID=\K.*' /etc/os-release 2>/dev/null || grep '^VERSION_ID=' /etc/os-release | cut -d= -f2)
fi
success "系统: $OS_ID $OS_VERSION"

# ---------- 2. 检查并安装 Docker ----------
DOCKER_CMD="docker"
if command -v docker &> /dev/null; then
    success "Docker 已安装: $(docker --version)"
elif $SUDO command -v docker &> /dev/null; then
    DOCKER_CMD="$SUDO docker"
    success "Docker 已安装: $($DOCKER_CMD --version)"
else
    info "Docker 未安装，正在自动安装..."

    case "$OS_ID" in
        alinux|alinux2|alinux3|anolis)
            info "检测到阿里云 Linux，使用阿里云镜像源安装..."
            
            # 安装 yum-utils 以便使用 yum-config-manager
            $SUDO yum install -y yum-utils
            
            # 添加 Docker 软件包源（使用阿里云内网镜像）
            $SUDO yum-config-manager --add-repo http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo
            
            # 替换为 HTTP 避免 SSL 问题
            $SUDO sed -i 's|https://|http://|g' /etc/yum.repos.d/docker-ce.repo

            # 安装 Docker（含 Compose 插件）
            $SUDO yum -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        centos|rhel|rocky|almalinux)
            info "检测到 CentOS/RHEL 系，使用 yum 安装..."
            $SUDO yum install -y yum-utils
            $SUDO yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
            $SUDO yum -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        ubuntu|debian)
            info "检测到 Ubuntu/Debian，使用 apt 安装..."
            $SUDO apt-get update
            $SUDO apt-get install -y ca-certificates curl gnupg
            $SUDO install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || \
            curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
            $SUDO apt-get update
            $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        *)
            error "不支持的操作系统: $OS_ID，请手动安装 Docker"
            ;;
    esac

    # 启动 Docker
    $SUDO systemctl start docker
    $SUDO systemctl enable docker
    DOCKER_CMD="$SUDO docker"
    success "Docker 安装完成: $($DOCKER_CMD --version)"
fi

# ---------- 3. 检查 Docker Compose ----------
info "检查 Docker Compose..."
COMPOSE_CMD=""
if $DOCKER_CMD compose version &> /dev/null; then
    COMPOSE_CMD="$DOCKER_CMD compose"
    success "Docker Compose 已安装: $($DOCKER_CMD compose version)"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    success "Docker Compose 已安装: $(docker-compose --version)"
else
    error "Docker Compose 未安装，请手动安装 docker-compose-plugin"
fi

# ---------- 4. 配置 Docker 镜像加速（国内服务器） ----------
info "配置 Docker 镜像加速..."
DAEMON_JSON="/etc/docker/daemon.json"
if [ ! -f "$DAEMON_JSON" ] || ! grep -q "registry-mirrors" "$DAEMON_JSON" 2>/dev/null; then
    $SUDO mkdir -p /etc/docker
    $SUDO tee "$DAEMON_JSON" > /dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
EOF
    $SUDO systemctl daemon-reload
    $SUDO systemctl restart docker
    success "镜像加速已配置"
else
    success "镜像加速已存在，跳过"
fi

# ---------- 5. 构建并启动 ----------
info "构建 Docker 镜像并启动服务..."
$COMPOSE_CMD build --no-cache
$COMPOSE_CMD up -d

# ---------- 6. 等待服务就绪 ----------
info "等待服务启动..."
sleep 5

if $COMPOSE_CMD ps | grep -q "Up"; then
    success "所有服务已启动！"
else
    error "服务启动失败，请检查日志: $COMPOSE_CMD logs"
fi

# ---------- 7. 验证 ----------
echo ""
info "验证服务..."

if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    success "后端 API 正常"
else
    warn "后端 API 未响应，可能需要几秒钟启动时间"
fi

if curl -sf http://localhost/ > /dev/null 2>&1; then
    success "前端页面正常"
else
    warn "前端页面未响应"
fi

echo ""
echo "============================================"
echo -e "${GREEN}  🎉 部署完成！${NC}"
echo "============================================"
echo ""
echo "  访问地址: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost')"
echo ""
echo "  常用命令:"
echo "    查看状态:   $COMPOSE_CMD ps"
echo "    查看日志:   $COMPOSE_CMD logs -f"
echo "    停止服务:   $COMPOSE_CMD down"
echo "    重启服务:   $COMPOSE_CMD restart"
echo ""
echo "  留言数据存储在 Docker Volume 'message-data' 中"
echo "============================================"
