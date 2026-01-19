# OSS_dev - Autonomous Open Source Contributor CLI

An autonomous CLI tool that acts as an AI-powered open source contributor, automatically analyzing GitHub issues, generating verified fixes through iterative testing, and creating pull requests.

## 🎯 What It Does

- ✅ **Analyzes issues semantically** using Gemini 3
- ✅ **Searches code surgically** with 90% context reduction
- ✅ **Self-corrects through test failures** (up to 5 iterations)
- ✅ **Creates verified PRs automatically**

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git
- Ripgrep (`brew install ripgrep` on macOS, `apt install ripgrep` on Ubuntu)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd oss-dev

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys (already configured if you're the developer)

# Build the project
npm run build

# Run the CLI
npm run dev fix <github-issue-url>
```

## 📋 API Keys Setup;

The project requires three API keys (already configured in `.env`):

### 1. Gemini API Key
- **Purpose:** AI-powered code analysis and generation
- **Get it from:** https://makersuite.google.com/app/apikey


### 2. E2B API Key
- **Purpose:** Isolated sandbox testing
- **Get it from:** https://e2b.dev/docs


### 3. GitHub Personal Access Token
- **Purpose:** Repository access and PR creation
- **Create at:** https://github.com/settings/tokens
- **Required scopes:** `repo`, `workflow`

## 💻 Usage

```bash
# Fix a GitHub issue
npm run dev fix https://github.com/owner/repo/issues/123

# Dry run (analyze only, no PR)
npm run dev fix https://github.com/owner/repo/issues/123 --dry-run

# Verbose output
npm run dev fix https://github.com/owner/repo/issues/123 --verbose

# Limit fix attempts
npm run dev fix https://github.com/owner/repo/issues/123 --max-attempts 3
```

## 🏗️ Architecture

```
CLI Layer (Commander.js)
    ↓
Orchestrator (Workflow coordination)
    ↓
├─ GitHub Client (Octokit)
├─ Agents (Gemini 3)
│  ├─ Issue Analyzer (Pro)
│  ├─ Scout Agent (Flash)
│  └─ Engineer Agent (Pro)
├─ Search (Ripgrep)
└─ Sandbox (E2B)
```

## 📁 Project Structure

```
oss-dev/
├── src/
│   ├── cli/              # CLI interface
│   ├── agents/           # AI agents (Analyzer, Scout, Engineer)
│   ├── tools/            # GitHub client, Ripgrep search
│   ├── sandbox/          # E2B sandbox, fingerprinting
│   ├── orchestrator/     # Workflow, fix loop
│   ├── types/            # TypeScript interfaces
│   └── utils/            # Logger, config
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── .kiro/specs/          # Feature specifications
│   └── oss-dev-cli/
│       ├── requirements.md
│       ├── design.md
│       └── tasks.md
├── DEVELOPMENT.md        # Complete build guide
├── IMPLEMENTATION.md     # Technical implementation details
└── DEPLOYMENT.md         # Deployment guide
```

## 🔨 Development

### Important Notes from DEVELOPMENT.md

**ALWAYS DO CORE IMPLEMENTATION** - Avoid patchwork completely. Build solid, maintainable code from the start.

**KEEP CODE CLEAN** - Only add comments when needed and keep them small and meaningful.

**MAINTAIN CORE LOGIC** - Keep core logic consistent throughout the app.

**SIMPLE COMMIT MESSAGES** - Write meaningful, short commit messages without FEAT/ECHO prefixes.

### Build Commands

```bash
# Development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

## 🧪 Testing Strategy

The project uses a dual testing approach:

### Unit Tests
- Verify specific examples and edge cases
- Test integration points between components
- Test error conditions

### Property-Based Tests
- Verify universal properties across all inputs
- Test with randomized inputs (100+ iterations)
- Catch edge cases that unit tests might miss

**Framework:** Jest + fast-check

## 📚 Documentation

- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Complete build guide with phase-by-phase instructions
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Technical details on APIs, prompting strategies, and system design
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide (npm, Docker, binaries)
- **[.kiro/specs/oss-dev-cli/](./kiro/specs/oss-dev-cli/)** - Feature specifications (requirements, design, tasks)

## 🎯 Implementation Plan

Follow the tasks in `.kiro/specs/oss-dev-cli/tasks.md`:

1. **Project Setup** - Initialize TypeScript, install dependencies
2. **Core Types** - Define interfaces and data models
3. **Utilities** - Logger, config management
4. **GitHub Integration** - URL parser, GitHub client
5. **Agents** - Issue Analyzer, Scout, Engineer
6. **Search** - Ripgrep integration
7. **Sandbox** - E2B sandbox, fingerprinting
8. **Orchestration** - Fix loop, main workflow
9. **CLI** - Command-line interface
10. **Testing** - Unit, integration, E2E tests

## 🔄 Workflow

1. **Parse URL** → Extract owner/repo/issue number
2. **Fetch Issue** → Get title, body, labels from GitHub
3. **Analyze Issue** → Extract structured information with Gemini
4. **Clone Repo** → Shallow clone to temp directory
5. **Detect Stack** → Identify language, package manager
6. **Search Code** → Generate targeted ripgrep queries
7. **Provision Sandbox** → Create E2B environment
8. **Fix Loop** → Iteratively generate and test fixes
9. **Create PR** → Commit changes and open pull request
10. **Cleanup** → Terminate sandbox, remove temp files

## 💡 Key Features

### Surgical Context Gathering
- Uses targeted ripgrep searches instead of full codebase analysis
- 90% reduction in context size
- Significantly lower API costs

### Self-Correction Loop
- Generates fix → Applies to sandbox → Runs tests
- If tests fail, diagnoses the issue and tries again
- Up to 5 attempts with learning from previous failures

### Cost Optimization
- Gemini Flash for routing and search queries (10x cheaper)
- Gemini Pro for reasoning and code generation (higher quality)
- Strategic model selection based on task complexity

## 🎓 Learning Resources

- **Gemini API:** https://ai.google.dev/docs
- **E2B Sandboxes:** https://e2b.dev/docs
- **Octokit (GitHub API):** https://octokit.github.io/rest.js/
- **Ripgrep:** https://github.com/BurntSushi/ripgrep
- **fast-check (Property Testing):** https://fast-check.dev/

## 📝 License

MIT

## 🤝 Contributing

 Contributions welcome after the initial implementation!

---

**Ready to build?** Start with task 1 in `.kiro/specs/oss-dev-cli/tasks.md` 🚀
