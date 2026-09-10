<#
.SYNOPSIS
    练琴簿（panio）一键 Docker 部署脚本（Windows / Docker Desktop）

.DESCRIPTION
    依次执行：
      1. 检查 Docker 环境
      2. 准备 node:26-alpine 基础镜像（本机拉取失败时走镜像加速器）
      3. 停止占用 4173 端口的旧版裸跑 node 服务（如有）
      4. 首次部署时把本地 data 目录中的 SQLite 数据库迁移到 Docker 卷
      5. docker compose 构建镜像并后台启动
      6. 轮询健康检查，失败时打印容器日志

.PARAMETER NoBuild
    跳过镜像构建，直接启动（仅重启容器时使用）

.EXAMPLE
    .\deploy.ps1
    .\deploy.ps1 -NoBuild
#>
param(
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$ProjectDir = $PSScriptRoot
$Port = 4173
$Container = 'piano-app'
$BaseImage = 'node:26-alpine'
$MirrorImage = 'docker.1ms.run/library/node:26-alpine'
$HealthUrl = "http://127.0.0.1:$Port/api/v1/health"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Die($msg)        { Write-Host "[失败] $msg" -ForegroundColor Red; exit 1 }

Set-Location $ProjectDir

# 1. 检查 Docker
Write-Step '检查 Docker 环境'
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) { Die '未找到 docker 命令，请先启动 Docker Desktop。' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Die 'Docker 未运行，请先启动 Docker Desktop 后重试。' }
Write-Ok 'Docker 可用'

# 2. 准备基础镜像（Dockerfile 依赖 node:26-alpine）
Write-Step "检查基础镜像 $BaseImage"
docker image inspect $BaseImage *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host '本地无该镜像，先尝试从 Docker Hub 拉取（较慢可能超时）...'
    docker pull $BaseImage *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Docker Hub 拉取失败，改用镜像加速器 docker.1ms.run ...'
        docker pull $MirrorImage
        if ($LASTEXITCODE -ne 0) { Die "基础镜像拉取失败，请检查网络后重试。" }
        docker tag $MirrorImage $BaseImage
    }
}
Write-Ok "基础镜像就绪"

# 3. 停止占用端口的旧版裸跑服务（node server/index.mjs）
#    若 piano-app 容器已在运行，端口由 Docker 转发（wslrelay 等）占用，属正常情况，跳过
Write-Step "检查端口 $Port 占用情况"
$containerRunning = (docker ps --filter "name=^$Container$" --format '{{.Names}}') -contains $Container
if ($containerRunning) {
    Write-Ok "容器 $Container 已在运行，端口由 Docker 管理"
}
else {
    $dockerProcs = @('wslrelay', 'com.docker.backend', 'vpnkit-bridge', 'vpnkit')
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $listeners) {
        $procId = $conn.OwningProcess
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $procName = if ($proc) { $proc.ProcessName } else { 'unknown' }
        if ($procName -eq 'node') {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine
            if ($cmdLine -match 'server/index\.mjs') {
                Write-Host "发现旧版裸跑服务 PID=$procId，停止中 ..."
                Stop-Process -Id $procId -Force
                Start-Sleep -Seconds 2
            }
            else {
                Die "端口 $Port 被其他 node 进程占用（PID=$procId）：$cmdLine`n请先手动处理。"
            }
        }
        elseif ($dockerProcs -contains $procName) {
            Die "端口 $Port 被其他 Docker 容器的转发进程占用（PID=$procId，$procName）。`n请先停掉占用该端口的容器后重试。"
        }
        else {
            Die "端口 $Port 被非 node 进程占用（PID=$procId，$procName），请先手动处理。"
        }
    }
    Write-Ok '端口可用'
}

# 4. 构建镜像
if (-not $NoBuild) {
    Write-Step '构建镜像（npm 源与内网地址修正已固化在 Dockerfile 中）'
    docker compose build
    if ($LASTEXITCODE -ne 0) { Die '镜像构建失败，请查看上方日志。' }
}

# 5. 首次部署：由 compose 创建命名卷，并把本地 data 数据库迁入
$projectName = (Split-Path $ProjectDir -leaf).ToLower()
$volume = "$projectName`_piano-data"
$localData = Join-Path $ProjectDir 'data'
$localDb = Join-Path $localData 'panio.sqlite'

Write-Step "检查数据卷 $volume"
docker volume inspect $volume *> $null
if ($LASTEXITCODE -ne 0) {
    # 由 compose 创建卷和容器（不启动），保证卷归属 compose 管理
    docker compose up --no-start *> $null
    if ($LASTEXITCODE -ne 0) {
        if ($NoBuild) { Die '镜像不存在且使用了 -NoBuild，请去掉该参数先完整部署一次。' }
        Die 'compose 初始化失败，请检查上方输出。'
    }
}

# 卷中没有库文件时，用本地 data 迁入（仅首次）
$hasDb = docker run --rm -v "${volume}:/data" $BaseImage sh -c "if [ -f /data/panio.sqlite ]; then echo yes; else echo no; fi"
if ($hasDb.Trim() -eq 'no' -and (Test-Path $localDb)) {
    $src = $localData -replace '\\', '/'
    Write-Host "首次部署，迁移本地数据库 $localData -> $volume ..."
    docker run --rm -v "${volume}:/dest" -v "${src}:/src:ro" $BaseImage sh -c "cp -a /src/. /dest/"
    if ($LASTEXITCODE -ne 0) { Die '数据库迁移失败。' }
    Write-Ok '数据库已迁移'
}
else {
    Write-Ok '数据卷已就绪（沿用容器内数据）'
}

# 6. 启动容器
Write-Step '启动容器'
docker compose up -d
if ($LASTEXITCODE -ne 0) { Die '容器启动失败，请运行 docker compose logs 查看原因。' }

# 7. 健康检查
Write-Step '等待服务健康检查通过'
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 3
    try {
        $resp = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 3 -UseBasicParsing
        if ($resp.status -eq 'ok') { $ready = $true; break }
    }
    catch { }
}
if ($ready) {
    Write-Ok '部署成功'
    docker ps --filter "name=$Container" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
    Write-Host ""
    Write-Host "访问地址： http://localhost:$Port/" -ForegroundColor Green
    Write-Host "查看日志： docker compose logs -f"
    Write-Host "仅重启：   .\deploy.ps1 -NoBuild"
}
else {
    Write-Host '[失败] 健康检查未通过，最近容器日志：' -ForegroundColor Red
    docker logs $Container --tail 50
    exit 1
}
