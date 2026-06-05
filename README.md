# karen-cli / 凯伦命令行

> A general-purpose coding assistant CLI inspired by Claude Code, built with TypeScript and Node.js.
>
> 受 Claude Code 启发的通用编程助手命令行工具，使用 TypeScript 与 Node.js 构建。

**Model makes decisions, Harness executes.** / **模型做决策，工具链执行。**

[![CI](https://github.com/gyp0927/karen-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/gyp0927/karen-cli/actions/workflows/ci.yml)

---

## Table of Contents / 目录

- [Features / 功能特性](#features--功能特性)
- [Installation / 安装](#installation--安装)
- [Configuration / 配置](#configuration--配置)
- [Usage / 使用](#usage--使用)
- [Architecture / 架构](#architecture--架构)
- [Project Structure / 项目结构](#project-structure--项目结构)
- [Development / 开发](#development--开发)

---

## Features / 功能特性

- **Multi-Model Support / 多模型支持**
  Switch between Anthropic (Claude), OpenAI (GPT-4o), DeepSeek, and Silicon Flow.
  支持 Anthropic (Claude)、OpenAI (GPT-4o)、DeepSeek、Silicon Flow 四种提供商一键切换。

- **Streaming Full-Width REPL / 流式全宽交互界面**  
  Persistent conversation with real-time streaming, box-based UI, and zero blank-line tolerance.  
  持久会话，实时流式输出，框线 UI，零空格容忍。

- **12+ Core Tools / 12+ 核心工具**  
  Read, Write, Edit, Bash, Grep, Glob, Git, WebSearch, WebFetch, Weather, MCP, Agent, Task, Skill, Plan, BackgroundJob.  
  读、写、编辑、命令行、搜索、匹配、Git、网页搜索、网页抓取、天气、MCP、子代理、任务、技能、计划、后台作业。

- **Permission System / 权限系统**  
  Arrow-key Yes/No selector for sensitive operations; auto-approve Write/Edit; dangerous Bash requires confirmation.  
  敏感操作使用方向键选择是/否；自动批准写入/编辑；危险命令需确认。

- **Plan Tool / 计划工具**  
  Structured multi-step decomposition with user approval before execution.  
  结构化多步任务分解，执行前需用户审批。

- **BackgroundJob / 后台作业**  
  Detached spawn with ready-pattern detection, ring-buffer output, and graceful cleanup.  
  独立进程启动，支持就绪模式检测、环形缓冲区输出、优雅退出。

- **Repeat Guard / 重复调用防护**  
  Fingerprint-based detection of identical tool calls within a sliding window.  
  基于指纹的滑动窗口重复调用检测，防止模型死循环。

- **Four-Layer Memory / 四层记忆栈**  
  Project (30d), Global (90d), User (permanent), Skill (180d) with dedup and auto-summarize.  
  项目(30天)、全局(90天)、用户(永久)、技能(180天)四层记忆，自动去重与摘要。

- **Task Graph / 任务图**  
  Multi-step task tracking with dependency management.  
  多步任务追踪与依赖管理。

- **Skill Manager / 技能管理器**  
  Install custom skills from URL or local files with keyword-based triggering.  
  从 URL 或本地文件安装自定义技能，支持关键词触发。

- **Prefix Cache / 前缀缓存**  
  Split static system prompt from dynamic messages to reduce token cost.  
  将静态系统提示与动态消息分离，降低 Token 消耗。

- **Storm Breaker / 熔断重试**  
  120s request timeout, 60s stream chunk timeout, exponential backoff.  
  120秒请求超时、60秒流式块超时、指数退避重试。

- **Tool-Call Repair / 工具调用修复**  
  Fix truncated JSON, missing braces, and invalid escapes from models like DeepSeek.  
  修复来自 DeepSeek 等模型的截断 JSON、缺失括号、无效转义。

- **Schema Flattening / 模式扁平化**  
  DeepSeek-compatible schema transformation for reliable tool calling.  
  DeepSeek 兼容的模式转换，确保工具调用稳定。

- **Local Tokenizer / 本地分词器**  
  CJK-aware heuristic token estimation for budget gating.  
  中日韩感知的启发式 Token 估算，用于预算控制。

- **Cost Tracking / 成本追踪**  
  Session-level token and cost tracking with configurable budget limits.  
  会话级 Token 与成本追踪，支持预算上限配置。

- **Transcript Logger / 会话记录器**  
  JSONL event sourcing for replay and debugging.  
  JSONL 事件溯源，支持回放与调试。

- **Context Compaction / 上下文压缩**  
  Smart context management with sliding window and truncation.  
  滑动窗口与截断策略的智能上下文管理。

---

## Installation / 安装

### Option 1: npm install (Recommended / 推荐)

```bash
npm install -g @jhonzs/karen-cli
```

Then run `karen` anywhere. 然后可在任意位置运行 `karen`。

### Option 2: Build from source / 从源码构建

```bash
# Clone the repository / 克隆仓库
git clone https://github.com/gyp0927/karen-cli.git
cd karen-cli

# Install dependencies / 安装依赖
npm install

# Build / 构建
npm run build

# Optional: link globally / 可选：全局链接
npm link
```

---

## Configuration / 配置

### Method 1: Environment Variables / 环境变量

```bash
# For Anthropic (default) / Anthropic（默认）
export ANTHROPIC_API_KEY=sk-ant-...

# For OpenAI / OpenAI
export OPENAI_API_KEY=sk-...

# For DeepSeek / DeepSeek
export DEEPSEEK_API_KEY=sk-...

# For Silicon Flow / Silicon Flow
export SILICONFLOW_API_KEY=sk-...

# Optional: specify preferred provider / 可选：指定默认提供商
export KAREN_PROVIDER=anthropic  # or 'openai', 'deepseek', 'siliconflow'
```

### Method 2: Config File / 配置文件

Create `~/.karen/config.json`:

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-...",
    "deepseek": "sk-...",
    "siliconflow": "sk-..."
  }
}
```

---

## Usage / 使用

### Start the CLI / 启动

```bash
karen
```

**CLI Flags / 命令行参数**

| Flag / 参数 | Description / 说明 |
|---|---|
| `--version, -v` | Show version / 显示版本 |
| `--help, -h` | Show help / 显示帮助 |
| `--model <name>` | Start with specific model / 指定模型启动 |
| `--print <message>` | Non-interactive mode / 非交互模式 |
| `--output-format json` | JSON output (with `--print`) / JSON 输出 |
| `--resume <id>` | Resume from session / 恢复会话 |

### REPL Commands / 交互命令

| Command / 命令 | Description / 说明 |
|---|---|
| `> hello world` | Send message to AI / 向 AI 发送消息 |
| `> /exit` | Quit the session / 退出会话 |
| `> /model <name>` | Switch provider (anthropic, openai, deepseek, siliconflow) / 切换模型提供商 |
| `> /tools` | List available tools / 列出可用工具 |
| `> /tasks` | Show task graph status / 显示任务图状态 |
| `> /plan` | Show or approve/discard plan / 查看或审批计划 |
| `> /diff` | Show changes since last checkpoint / 显示上次检查点以来的变更 |
| `> /resume <id>` | Resume from a previous session / 恢复之前的会话 |
| `> /rollback` | Rollback to last checkpoint / 回滚到上次检查点 |
| `> /remember <text>` | Save to user memory (permanent) / 保存到用户记忆（永久） |
| `> /forget <keyword>` | Delete matching memories / 删除匹配的记忆 |
| `> /memory` | Show memory stats / 显示记忆统计 |
| `> /skills` | List loaded skills / 列出已加载技能 |
| `> /cost` | Show session cost / 显示会话成本 |
| `> /help` | Show help / 显示帮助 |

### Example Session / 示例会话

```
$ karen
Using provider: deepseek / 使用提供商：deepseek

> Read the package.json file
[AI uses Read tool / AI 使用 Read 工具]
{ "name": "@jhonzs/karen-cli", ... }

> Find all test files
[AI uses Glob tool / AI 使用 Glob 工具]
tests/unit/tools/read.test.ts
...

> Start npm run dev in background
[AI uses BackgroundJob tool / AI 使用 BackgroundJob 工具]
Job job-1 started. PID: 12345

> /exit
Goodbye! / 再见！
```

---

## Architecture / 架构

```
┌─────────────────────────────────────────────────────────────┐
│              CLI Entry (bin/karen) / CLI 入口                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│           REPL / Command Parser / 交互与命令解析               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              Agent Core Loop / 代理核心循环                   │
│       (messages → model → tools → results / 消息→模型→工具→结果) │
└─────────────────────────────────────────────────────────────┘
                              │
    ┌──────────────┬──────────────┬──────────────┬──────────────┐
    ▼              ▼              ▼              ▼              ▼
┌────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐
│ Memory │  │  Task    │  │   Skill    │  │  Plan    │  │  Prefix  │
│ System │  │  Graph   │  │   Loader   │  │ Manager  │  │  Cache   │
│ 记忆系统 │  │  任务图   │  │  技能加载器 │  │  计划管理器 │  │  前缀缓存  │
└────────┘  └──────────┘  └────────────┘  └──────────┘  └──────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌─────────────┐      ┌────────────────┐    ┌──────────────┐
│ Tool Registry│      │  Hook System   │    │   Storm      │
│   工具注册表  │      │   钩子系统      │    │   Breaker    │
│              │      │                │    │   熔断重试     │
└─────────────┘      └────────────────┘    └──────────────┘
        │
┌───────┴─────────────────────────────────────────────────────┐
│  Model Provider (Anthropic/OpenAI/DeepSeek/SiliconFlow) / 模型提供商  │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure / 项目结构

```
karen-cli/
├── bin/
│   └── karen.ts              # CLI entry point / CLI 入口
├── karen.cmd                 # Windows wrapper / Windows 包装器
├── karen.ps1                 # PowerShell wrapper / PowerShell 包装器
├── src/
│   ├── core/
│   │   ├── types.ts          # Core type definitions / 核心类型定义
│   │   ├── loop.ts           # Agent core loop / 代理核心循环
│   │   ├── cost.ts           # Cost tracking / 成本追踪
│   │   ├── prefix-cache.ts   # Prefix cache / 前缀缓存
│   │   ├── repair.ts         # Tool-call repair / 工具调用修复
│   │   ├── repeat-guard.ts   # Repeat guard / 重复调用防护
│   │   ├── schema-flatten.ts # Schema flattening / 模式扁平化
│   │   ├── storm.ts          # Storm breaker / 熔断重试
│   │   └── tokenizer.ts      # Local tokenizer / 本地分词器
│   ├── cli/
│   │   ├── repl.ts           # Interactive REPL / 交互式界面
│   │   └── commands.ts       # Command parser / 命令解析器
│   ├── providers/
│   │   ├── anthropic.ts      # Claude provider / Claude 提供商
│   │   ├── openai.ts         # OpenAI provider / OpenAI 提供商
│   │   ├── deepseek.ts       # DeepSeek provider / DeepSeek 提供商
│   │   ├── siliconflow.ts    # SiliconFlow provider / SiliconFlow 提供商
│   │   └── base.ts           # Base provider / 基础提供商
│   ├── tools/
│   │   ├── index.ts          # Tool registry / 工具注册表
│   │   ├── read.ts           # Read file / 读取文件
│   │   ├── write.ts          # Write file / 写入文件
│   │   ├── edit.ts           # Edit file / 编辑文件
│   │   ├── bash.ts           # Execute command / 执行命令
│   │   ├── grep.ts           # Search files / 搜索文件
│   │   ├── glob.ts           # Match patterns / 匹配模式
│   │   ├── git.ts            # Git operations / Git 操作
│   │   ├── websearch.ts      # Web search / 网页搜索
│   │   ├── webfetch.ts       # Web fetch / 网页抓取
│   │   ├── weather.ts        # Weather query / 天气查询
│   │   ├── mcp.ts            # MCP client / MCP 客户端
│   │   ├── agent.ts          # Sub-agent / 子代理
│   │   ├── task.ts           # Task management / 任务管理
│   │   ├── skill.ts          # Skill operations / 技能操作
│   │   ├── plan.ts           # Plan tool / 计划工具
│   │   └── background-job.ts # Background jobs / 后台作业
│   ├── permissions/
│   │   ├── manager.ts        # Permission manager / 权限管理器
│   │   ├── policies.ts       # Permission policies / 权限策略
│   │   └── trust.ts          # Full-trust mode / 全信任模式
│   ├── memory/
│   │   ├── types.ts          # Memory types / 记忆类型
│   │   └── manager.ts        # Memory storage / 记忆存储
│   ├── tasks/
│   │   ├── types.ts          # Task types / 任务类型
│   │   └── manager.ts        # Task graph / 任务图管理
│   ├── skills/
│   │   ├── types.ts          # Skill types / 技能类型
│   │   ├── loader.ts         # Skill loader / 技能加载器
│   │   └── manager.ts        # Skill manager / 技能管理器
│   ├── plan/
│   │   ├── types.ts          # Plan types / 计划类型
│   │   └── manager.ts        # Plan manager / 计划管理器
│   ├── jobs/
│   │   └── manager.ts        # Job manager / 作业管理器
│   ├── transcript/
│   │   └── logger.ts         # Transcript logger / 会话记录器
│   └── utils/
│       └── logger.ts         # Logging utility / 日志工具
├── tests/
│   ├── unit/                 # Unit tests / 单元测试
│   ├── integration/          # Integration tests / 集成测试
│   └── e2e/                  # End-to-end tests / 端到端测试
├── .github/workflows/
│   └── ci.yml                # GitHub Actions CI / 持续集成
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development / 开发

```bash
# Run tests / 运行测试
npm test

# Run specific test suites / 运行特定测试套件
npm run test:unit
npm run test:integration
npm run test:e2e

# Type check / 类型检查
npm run lint

# Development mode (watch) / 开发模式（监听）
npm run dev
```

### Testing / 测试

The project uses Node.js built-in test runner with `tsx` for TypeScript execution:  
本项目使用 Node.js 内置测试运行器，配合 `tsx` 执行 TypeScript：

- **244 tests** across **42 test suites** / **42 个测试套件，244 个测试用例**
- All tests pass with zero regressions / 全部通过，零回归
- TDD approach: every feature is tested before implementation / 测试驱动开发：每个功能先写测试再实现

```bash
npm test
```

### Tech Stack / 技术栈

| Technology / 技术 | Description / 说明 |
|---|---|
| Node.js 20+ | Runtime / 运行时 |
| TypeScript 5.7 | Language / 语言 |
| `node:test` + `tsx` | Test runner / 测试运行器 |
| `@anthropic-ai/sdk`, `openai` | LLM SDKs / 大模型 SDK |
| ESM | Module system / 模块系统 |

---

## License / 许可证

MIT
