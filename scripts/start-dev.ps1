# 回声岛本地开发启动脚本 (Windows PowerShell)
param(
    [switch]$SkipEnvCopy,
    [switch]$SkipInstall,
    [switch]$SkipSeed,
    [switch]$NoDocker
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✔  $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "⚠  $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "✗  $Message" -ForegroundColor Red
}

Write-Host ""
Write-Host "  回声岛 (Echo Island) - 本地开发启动" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta

try {
    Set-Location $ProjectRoot

    if (-not $SkipEnvCopy) {
        Write-Step "检查环境变量配置..."
        if (-not (Test-Path ".env")) {
            if (Test-Path ".env.example") {
                Copy-Item ".env.example" ".env"
                Write-Warn "已从 .env.example 复制生成 .env 文件"
                Write-Warn "请根据需要修改 .env 中的配置，特别是 JWT_SECRET"
            } else {
                Write-Fail "未找到 .env.example 文件"
                exit 1
            }
        } else {
            Write-Success ".env 文件已存在"
        }
    }

    if (-not $NoDocker) {
        Write-Step "检查 Docker Desktop 状态..."
        try {
            $dockerStatus = docker version 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "Docker 未运行"
            }
            Write-Success "Docker Desktop 正在运行"
        } catch {
            Write-Fail "请先启动 Docker Desktop"
            exit 1
        }

        Write-Step "启动 MongoDB 容器..."
        docker compose up -d db
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "MongoDB 容器启动失败"
            exit 1
        }
        Write-Success "MongoDB 容器已启动"

        Write-Step "等待 MongoDB 就绪..."
        Set-Location (Join-Path $ProjectRoot "backend")
        $env:MONGO_URI = "mongodb://localhost:27223/echo_island"
        npm run wait:db
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "MongoDB 连接超时"
            exit 1
        }
        Set-Location $ProjectRoot
        Write-Success "MongoDB 已就绪"
    }

    Set-Location (Join-Path $ProjectRoot "backend")

    if (-not $SkipInstall) {
        Write-Step "检查并安装后端依赖..."
        if (-not (Test-Path "node_modules")) {
            Write-Warn "node_modules 不存在，开始安装依赖..."
            npm ci
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "依赖安装失败"
                exit 1
            }
            Write-Success "依赖安装完成"
        } else {
            Write-Success "依赖已安装"
        }
    }

    if (-not $SkipSeed -and -not $NoDocker) {
        Write-Step "初始化演示数据..."
        npm run seed
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "数据初始化失败（可能已存在数据），继续启动..."
        } else {
            Write-Success "演示数据初始化完成"
        }
    }

    Write-Step "启动后端开发服务..."
    Write-Host ""
    Write-Host "  服务地址:" -ForegroundColor White
    Write-Host "  - API:     http://localhost:8223" -ForegroundColor White
    Write-Host "  - 健康检查: http://localhost:8223/health" -ForegroundColor White
    Write-Host "  - WS:      ws://localhost:8223/ws" -ForegroundColor White
    Write-Host ""
    Write-Host "  演示账号 (统一密码: password1):" -ForegroundColor White
    Write-Host "  - admin     (管理员)" -ForegroundColor White
    Write-Host "  - fogdao    (月度会员)" -ForegroundColor White
    Write-Host "  - tide_writer" -ForegroundColor White
    Write-Host "  - lowfreq_fan" -ForegroundColor White
    Write-Host "  - calm_asker" -ForegroundColor White
    Write-Host ""
    Write-Host "按 Ctrl+C 停止服务" -ForegroundColor DarkGray
    Write-Host ""

    npm run dev

} catch {
    Write-Fail "启动失败: $_"
    exit 1
}
