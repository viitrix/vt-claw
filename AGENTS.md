# vt-claw 项目指南

## 项目简介

**vt-claw** 是一款面向硬件技能的 Claw 软件，通过微信机器人接口提供 AI Agent 服务。项目的三大核心特性：

- **安全隔离**：基于 Docker 容器的沙箱环境，AI Agent 在隔离环境中运行，访问权限受控
- **透明可控**：所有操作可追溯，支持会话管理和状态持久化
- **主动智能**：支持定时任务调度（cron），主动执行预设任务

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      微信用户                            │
└────────────────────┬────────────────────────────────────┘
                     │ 微信消息
                     ▼
┌─────────────────────────────────────────────────────────┐
│              claw (微信机器人服务)                       │
│  - 消息路由和分发                                        │
│  - 会话管理                                              │
│  - 定时任务调度                                          │
│  - IPC 通信管理                                          │
└────────────────────┬────────────────────────────────────┘
                     │ Docker API
                     ▼
┌─────────────────────────────────────────────────────────┐
│          Docker 容器 (vt-claw-agent)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │   agent (Agent Runner)                          │   │
│  │   - 接收任务配置                                 │   │
│  │   - 运行 Pi Coding Agent                        │   │
│  │   - IPC 工具集成                                │   │
│  │   - 输出结果                                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  隔离环境：网络受限、文件系统受限                         │
└─────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. claw - 主控制服务

**技术栈**：Node.js + TypeScript

**主要模块**：
- `index.ts` - 主入口，消息路由和分发
- `channel.ts` - 通信渠道管理
- `container.ts` - Docker 容器生命周期管理
- `db.ts` - SQLite 数据库操作（会话、任务、消息存储）
- `group.ts` - 群组管理和队列处理
- `ipc.ts` - 进程间通信（IPC）文件监听
- `task.ts` - 定时任务调度器
- `message.ts` - 消息格式化
- `wechat/` - 微信机器人 SDK 集成

**核心功能**：
1. 微信消息监听和路由
2. 容器实例的创建、监控和清理
3. 定时任务的调度和执行
4. IPC 消息的双向传递

### 2. agent - 容器内 Agent Runner

**技术栈**：Node.js + TypeScript + Pi Coding Agent

**主要模块**：
- `index.ts` - Agent 运行器，接收输入并执行 Agent
- `ipctools.ts` - IPC 工具集（发送消息、任务调度等）

**核心功能**：
1. 从 stdin 接收任务配置
2. 运行 Pi Coding Agent 执行任务
3. 通过 IPC 工具与主服务通信
4. 输出执行结果到 stdout

### 3. container - Docker 容器配置

**镜像构建**：
- `Dockerfile.base` - 基础镜像，包含 Chromium 和系统依赖
- `Dockerfile.agent` - Agent 镜像，基于基础镜像
- `build.sh` - 构建脚本
- `entrypoint.sh` - 容器入口脚本

## 安装指南

### 前置要求

- **Node.js** >= 20
- **Docker** 运行中
- **微信账号**（用于机器人登录）

### 安装步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
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

项目已包含 `mount/` 目录结构：

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

## 配置说明

### 1. API 密钥配置

编辑 `.env` 文件：

```bash
GLM_API_KEY="your-api-key-here"
```

### 2. 模型配置

编辑 `mount/pi/agent/settings.json`：

```json
{
  "defaultProvider": "BigModel",
  "defaultModel": "GLM-5"
}
```

### 3. 容器环境配置（可选）

编辑 `.env_container` 文件配置代理或其他环境变量：

```bash
# 代理配置
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=http://proxy.example.com:8080

# 调试配置
DEBUG=myapp:*
LOG_LEVEL=debug
```

### 4. Agent 技能配置

Agent 技能位于 `mount/pi/agent/skills/` 目录，可以添加自定义技能。

## 运行指南

### 开发模式

```bash
# 运行 claw 主服务
cd claw
npm run dev
```

首次运行时，终端会显示二维码，使用微信扫码登录。

### 生产模式

```bash
# 构建 TypeScript
cd claw
npm run build

# 运行
npm start
```

### 容器管理

```bash
# 查看运行中的容器
docker ps

# 停止所有 vt-claw 容器
docker stop $(docker ps -q --filter "name=vt-claw-")

# 清理停止的容器
docker container prune
```

## 工作原理

### 消息处理流程

1. **消息接收**：微信机器人监听群组/私聊消息
2. **消息路由**：根据消息来源和内容路由到对应的处理队列
3. **容器调度**：为每个群组创建/复用 Docker 容器实例
4. **任务执行**：在容器内运行 Pi Coding Agent
5. **结果返回**：Agent 执行结果通过 IPC 返回，发送到微信

### 定时任务机制

1. **任务存储**：任务信息存储在 SQLite 数据库中
2. **调度循环**：定期检查到期的任务
3. **容器执行**：到期的任务在隔离容器中执行
4. **状态更新**：更新任务执行状态和下次运行时间

### IPC 通信机制

主服务（claw）与容器（agent）通过文件系统进行 IPC 通信：

```
mount/data/ipc/<session-id>/
├── input/           # 主服务 -> 容器
│   ├── message.json # 消息文件
│   └── _close       # 关闭信号
└── output/          # 容器 -> 主服务
    └── result.json  # 结果文件
```

## 目录结构

```
vt-claw/
├── claw/                   # 主控制服务
│   ├── src/
│   │   ├── index.ts       # 主入口
│   │   ├── channel.ts     # 通信渠道
│   │   ├── container.ts   # 容器管理
│   │   ├── db.ts          # 数据库操作
│   │   ├── group.ts       # 群组管理
│   │   ├── ipc.ts         # IPC 通信
│   │   ├── task.ts        # 任务调度
│   │   ├── message.ts     # 消息处理
│   │   └── wechat/        # 微信集成
│   ├── package.json
│   └── tsconfig.json
├── agent/                  # 容器内 Agent Runner
│   ├── src/
│   │   ├── index.ts       # Agent 运行器
│   │   └── ipctools.ts    # IPC 工具
│   ├── package.json
│   └── tsconfig.json
├── container/              # Docker 容器配置
│   ├── Dockerfile.base    # 基础镜像
│   ├── Dockerfile.agent   # Agent 镜像
│   ├── build.sh           # 构建脚本
│   └── entrypoint.sh      # 入口脚本
├── mount/                  # 挂载目录
│   ├── pi/agent/          # Agent 配置模板
│   ├── data/              # 运行时数据
│   │   ├── sessions/      # 会话数据
│   │   └── ipc/           # IPC 通信
│   └── store/             # 持久化存储
├── assets/                 # 资源文件
├── .env.example           # 环境变量示例
├── .env_container.example # 容器环境变量示例
├── README.md              # 项目说明
└── AGENTS.md              # 本文档
```

## 技术栈

### 后端服务（claw）
- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Dependencies**:
  - `weixin-bot-sdk` - 微信机器人 SDK
  - `better-sqlite3` - SQLite 数据库
  - `cron-parser` - Cron 表达式解析
  - `pino` - 日志记录
  - `qrcode-terminal` - 终端二维码显示

### Agent 容器（agent）
- **Runtime**: Node.js 22
- **Base Image**: node:22-slim
- **Dependencies**:
  - `@mariozechner/pi-coding-agent` - Pi Coding Agent 框架
  - `agent-browser` - 浏览器自动化
  - Chromium - 浏览器引擎

### 容器技术
- **Docker** - 容器运行时
- **隔离特性**：
  - 文件系统隔离（只读挂载）
  - 网络访问受限
  - 资源限制

## 安全特性

1. **容器隔离**：每个会话在独立的 Docker 容器中运行
2. **权限控制**：容器访问文件系统和网络受限
3. **资源限制**：防止资源滥用
4. **会话隔离**：不同群组的会话数据相互隔离

## 常见问题

### 1. 容器启动失败

检查 Docker 是否运行：
```bash
docker info
```

### 2. 微信登录失败

重新运行程序，扫描终端显示的二维码。

### 3. API 调用失败

检查 `.env` 文件中的 API Key 是否正确配置。

### 4. 任务不执行

检查任务调度日志，确认 cron 表达式正确：
```bash
# 查看日志中任务调度信息
```

## 开发指南

### 添加新的 IPC 工具

1. 在 `agent/src/ipctools.ts` 中添加新工具
2. 在 `claw/src/ipc.ts` 中添加对应的处理器
3. 更新文档说明新工具的用途

### 自定义 Agent 技能

1. 在 `mount/pi/agent/skills/` 目录创建技能目录
2. 添加 `SKILL.md` 描述文件
3. 实现技能逻辑

### 修改调度逻辑

编辑 `claw/src/task.ts` 中的调度器实现。

## 许可证

MIT License

Copyright (c) 2026 云锦微
