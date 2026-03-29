## 安装和设置

本文档介绍如何在 WSL/Linux 环境下安装和配置 vt-claw。

---

### 环境前提

在开始安装之前，请确保系统满足以下要求：

#### 1. 操作系统

- **WSL2** (Windows Subsystem for Linux 2) 或
- **Linux** (推荐 Ubuntu 20.04+)

#### 2. Node.js

- **版本要求**: >= 20
- **包管理器**: npm

```bash
# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version
```

如果未安装，推荐使用 [nvm](https://github.com/nvm-sh/nvm) 安装 Node.js：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 重新加载 shell
source ~/.bashrc

# 安装 Node.js 20
nvm install 20
nvm use 20
```

#### 3. Node-gyp 编译工具

由于项目依赖 `better-sqlite3` 等原生模块，需要安装编译工具：

```bash
# Ubuntu/Debian/WSL
sudo apt-get update
sudo apt-get install -y build-essential python3

# 或者使用 npm 自动安装
npm install -g node-gyp
```

#### 4. Docker

确保 Docker 已安装并正在运行：

```bash
# 检查 Docker 版本
docker --version

# 检查 Docker 服务状态
docker info
```

如果未安装 Docker，请参考 [Docker 官方文档](https://docs.docker.com/engine/install/)。

**WSL 用户特别注意**：推荐使用 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) 并启用 WSL2 集成。

#### 5. Git

```bash
# 检查 Git 版本
git --version
```

#### 6. 微信账号

需要一个可用的微信账号用于机器人登录。

---

### 安装步骤

#### 1. 克隆项目

```bash
git clone git@github.com:viitrix/vt-claw.git
cd vt-claw
```

#### 2. 安装依赖

```bash
# 安装 claw 依赖
cd claw
npm install
cd ..

# 安装 agent 依赖
cd agent
npm install
cd ..
```

> **注意**：如果 `better-sqlite3` 编译失败，请确保已正确安装 Node-gyp 编译工具。

#### 3. 构建容器镜像

```bash
cd container

# 构建基础镜像（首次或更新依赖时）
./build.sh base

# 构建 Agent 镜像
./build.sh agent

cd ..
```

#### 4. 配置环境变量

```bash
# 复制环境变量示例文件
cp .env.example .env

# 编辑 .env 文件，设置 API Key
# GLM_API_KEY="your-api-key-here"
```

可选：创建 `.env_container` 文件配置容器环境变量：

```bash
cp .env_container.example .env_container
# 根据需要修改代理配置等
```

#### 5. 准备挂载目录

项目已包含 `mount/` 目录结构，无需额外操作：

```
mount/
├── pi/agent/          # Agent 配置模板
│   ├── settings.json  # 默认模型配置
│   ├── models.json    # 模型列表
│   ├── auth.json      # 认证配置
│   └── skills/        # Agent 技能
├── data/              # 运行时数据
│   ├── sessions/      # 会话数据
│   └── ipc/           # IPC 通信文件
└── store/             # 持久化存储
```

---

### 配置说明

#### 1. API 密钥配置

编辑 `.env` 文件：

```bash
GLM_API_KEY="your-api-key-here"
```

#### 2. 模型配置

编辑 `mount/pi/agent/settings.json`：

```json
{
  "defaultProvider": "BigModel",
  "defaultModel": "GLM-5"
}
```

#### 3. 容器环境配置（可选）

编辑 `.env_container` 文件配置代理或其他环境变量：

```bash
# 代理配置
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=http://proxy.example.com:8080

# 调试配置
DEBUG=myapp:*
LOG_LEVEL=debug
```

#### 4. Agent 技能配置

Agent 技能位于 `mount/pi/agent/skills/` 目录，可以添加自定义技能。

---

### 运行指南

#### 开发模式

```bash
# 运行 claw 主服务
cd claw
npm run dev
```

首次运行时，终端会显示二维码，使用微信扫码登录。

#### 生产模式

```bash
# 构建 TypeScript
cd claw
npm run build

# 运行
npm start
```

#### 容器管理

```bash
# 查看运行中的容器
docker ps

# 停止所有 vt-claw 容器
docker stop $(docker ps -q --filter "name=vt-claw-")

# 清理停止的容器
docker container prune
```

---

### 常见问题

#### 1. better-sqlite3 编译失败

确保已安装编译工具：

```bash
sudo apt-get install -y build-essential python3
```

然后重新安装依赖：

```bash
cd claw
rm -rf node_modules package-lock.json
npm install
```

#### 2. 容器启动失败

检查 Docker 是否运行：

```bash
docker info
```

#### 3. 微信登录失败

重新运行程序，扫描终端显示的二维码。

#### 4. API 调用失败

检查 `.env` 文件中的 API Key 是否正确配置。

---

### 下一步

- 查看 [AGENTS.md](../../AGENTS.md) 了解项目架构
- 在 `mount/pi/agent/skills/` 添加自定义技能
- 配置定时任务实现主动智能
