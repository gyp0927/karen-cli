# karen-cli

A general-purpose coding assistant CLI inspired by Claude Code, built with TypeScript and Node.js.

**Model makes decisions, Harness executes.**

[![CI](https://github.com/gyp0927/karen-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/gyp0927/karen-cli/actions/workflows/ci.yml)

## Features

- **Multi-Model Support**: Switch between Anthropic (Claude), OpenAI (GPT-4o), and Silicon Flow (DeepSeek) providers
- **Interactive REPL**: Persistent conversation session with command history
- **7 Core Tools**: Read, Write, Edit, Bash, Grep, Glob, Agent (sub-agent delegation)
- **Permission System**: User confirmation required for sensitive operations (Bash, Write, Edit)
- **Memory System**: Persistent storage of project context, user preferences, and feedback
- **Task Graph**: Multi-step task tracking with dependency management
- **Skill Loader**: Custom skill definitions with keyword-based triggering
- **Hooks System**: Lifecycle hooks for extensibility (pre-message, post-tool, pre-exit, etc.)
- **Context Compaction**: Smart context management with sliding window and truncation

## Installation

```bash
# Clone the repository
git clone https://github.com/gyp0927/karen-cli.git
cd karen-cli

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

Set your API keys as environment variables:

```bash
# For Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...

# For OpenAI
export OPENAI_API_KEY=sk-...

# For Silicon Flow
export SILICONFLOW_API_KEY=sk-...

# Optional: specify preferred provider
export KAREN_PROVIDER=anthropic  # or 'openai', 'siliconflow'
```

## Usage

### Start the CLI

**Option 1: Direct run (no setup)**
```bash
npm start
# or
node dist/bin/karen.js
```

**Option 2: Global `karen` command**

Add the project directory to your system `PATH`, then you can run `karen` from anywhere:

**Windows (CMD):**
```cmd
setx PATH "%PATH%;E:\karen-cli"
```
Then open a new terminal and run:
```cmd
karen
```

**Windows (PowerShell):**
```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";E:\karen-cli", "User")
```

**Linux/macOS:**
```bash
export PATH="$PATH:/path/to/karen-cli"
```

### REPL Commands

```
> hello world           # Send message to AI
> /exit                 # Quit the session
> /model claude         # Switch provider (claude, openai, siliconflow)
> /tools                # List available tools
> /tasks                # Show task graph status
> /help                 # Show help
```

### Example Session

```
$ npm start
Using provider: anthropic
> Read the package.json file
[AI uses Read tool]
{ "name": "karen-cli", ... }

> Find all test files
[AI uses Glob tool]
tests/unit/tools/read.test.ts
...

> /exit
Goodbye!
```

## Architecture

```
┌─────────────────────────────────────────┐
│           CLI Entry (bin/karen)          │
└─────────────────────────────────────────┘
                   │
┌─────────────────────────────────────────┐
│         REPL / Command Parser            │
└─────────────────────────────────────────┘
                   │
┌─────────────────────────────────────────┐
│          Agent Core Loop                 │
│  (messages → model → tools → results)   │
└─────────────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌────────────┐
│ Memory │   │  Task    │   │   Skill    │
│ System │   │  Graph   │   │   Loader   │
└────────┘   └──────────┘   └────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌─────────────┐      ┌────────────────┐
│ Tool Registry│      │ Hook System    │
└─────────────┘      └────────────────┘
        │
┌───────┴─────────────────────────────────┐
│  Model Provider (Anthropic/OpenAI/SiliconFlow) │
└─────────────────────────────────────────┘
```

## Project Structure

```
karen-cli/
├── bin/
│   └── karen.ts              # CLI entry point
├── karen.cmd                 # Windows command wrapper
├── karen.ps1                 # PowerShell wrapper
├── src/
│   ├── core/
│   │   ├── types.ts          # Core type definitions
│   │   ├── loop.ts           # Agent core loop
│   │   └── compaction.ts     # Context compaction
│   ├── cli/
│   │   ├── repl.ts           # Interactive REPL
│   │   └── commands.ts       # Command parser
│   ├── providers/
│   │   ├── anthropic.ts      # Claude provider
│   │   ├── openai.ts         # OpenAI provider
│   │   └── siliconflow.ts    # Silicon Flow provider
│   ├── tools/
│   │   ├── registry.ts       # Tool registry
│   │   ├── read.ts           # Read file
│   │   ├── write.ts          # Write file
│   │   ├── edit.ts           # Edit file
│   │   ├── bash.ts           # Execute shell command
│   │   ├── grep.ts           # Search files
│   │   ├── glob.ts           # Match file patterns
│   │   └── agent.ts          # Sub-agent delegation
│   ├── permissions/
│   │   ├── manager.ts        # Permission manager
│   │   └── policies.ts       # Permission policies
│   ├── memory/
│   │   ├── types.ts          # Memory types
│   │   └── manager.ts        # Memory storage/retrieval
│   ├── tasks/
│   │   ├── types.ts          # Task types
│   │   └── manager.ts        # Task graph manager
│   ├── skills/
│   │   ├── types.ts          # Skill types
│   │   └── loader.ts         # Skill loader
│   ├── hooks/
│   │   ├── types.ts          # Hook types
│   │   └── manager.ts        # Hook manager
│   └── utils/
│       └── logger.ts         # Logging utility
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── .github/workflows/
│   └── ci.yml                # GitHub Actions CI
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
# Run tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Type check
npm run lint

# Development mode (watch)
npm run dev
```

## Testing

The project uses Node.js built-in test runner with `tsx` for TypeScript execution:

- **83 tests** across **20 test suites**
- All tests pass with zero regressions
- TDD approach: every feature is tested before implementation

```bash
npm test
```

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.7
- **Test Runner**: `node:test` (built-in) + `tsx`
- **LLM SDKs**: `@anthropic-ai/sdk`, `openai` (also used for SiliconFlow compatibility)
- **Module System**: ESM

## License

MIT
