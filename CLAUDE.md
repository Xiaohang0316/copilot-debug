# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Context Viewer** is a VS Code extension that monitors and debugs GitHub Copilot Agent execution in real time. It captures input/output prompts, tracks context window size, detects prompt compression events, and visualizes execution steps in a timeline. The project is written in TypeScript, targets VS Code >= 1.95.0, and has zero runtime dependencies.

## Build & Development Commands

```bash
npm run compile       # One-time TypeScript compilation (tsc -p ./)
npm run watch         # Continuous compilation with file watching
npm run package       # Compile + package into .vsix (uses vsce)
npm test              # Compile + run all unit tests (mocha)
```

To test locally: run `npm run watch`, then press **F5** in VS Code to launch an Extension Development Host window. After code changes, reload the dev host with `Cmd+Shift+P` → `Developer: Reload Window`.

## Testing

Unit tests use **Mocha** with a custom vscode mock (`src/test/mock/vscode.ts`). Tests run outside VS Code via `node run-tests.js`, which registers the mock before loading test files.

Test structure mirrors the source tree:

| Test file | Covers |
|-----------|--------|
| `sessionStore.test.ts` | Session CRUD, stats computation, event emission |
| `interceptor.test.ts` | Log line parsing (7 regex patterns), capture lifecycle, manual steps |
| `logWatcher.test.ts` | All 15 log patterns, metadata extraction |
| `i18n.test.ts` | Translation lookup, placeholder substitution, key completeness |
| `types.test.ts` | Interface structure validation |
| `views/sessionTreeProvider.test.ts` | Tree items, icons, tooltips, commands |
| `views/stepTreeProvider.test.ts` | All 8 StepType icons, description formatting |
| `views/statsTreeProvider.test.ts` | Stat categories, nested children, tool calls section |
| `views/detailPanel.test.ts` | HTML generation, XSS escaping, edge cases |

To add a new test: create `src/test/<module>.test.ts`, import from source as usual — the vscode mock is auto-registered.

## Architecture

The extension uses a **three-layer capture architecture** to work around Copilot not exposing internal APIs:

- **L1 — Chat Participant** (`src/chatParticipant.ts`): Registers `@debug` in VS Code Chat. Proxies user requests to the Copilot model via `vscode.lm.selectChatModels()` and captures complete input/output prompts, chat history, model info, and token usage. This is the most complete data source.
- **L2 — Log Watcher** (`src/logWatcher.ts`): Uses `fs.watch()` to monitor Copilot's on-disk log files. Incrementally reads new content (tracks file offsets) and parses lines against 15 regex patterns to extract API requests, token counts, tool calls, and compression events.
- **L3 — Editor Interceptor** (`src/interceptor.ts`): Monitors VS Code editor events (document changes, visible editors, text selections, terminals, diagnostics) to indirectly infer Copilot activity. Detects compression when context size drops >30% (threshold 0.7).

All three layers feed into `SessionStore` (`src/sessionStore.ts`), the in-memory data store that manages session lifecycle, accumulates steps, and computes statistics. It uses `vscode.EventEmitter` to notify views on change.

**Views** (`src/views/`): Three `TreeDataProvider` implementations (sessions, steps, stats) subscribe to `SessionStore.onDidChange` for automatic refresh. `DetailPanel` renders step details and session overview charts using a Webview with native HTML/CSS/Canvas (no frontend framework).

**Entry point** (`src/extension.ts`): `activate()` wires all components together — creates the store, all three capture layers, tree views, detail panel, registers 10+ commands, and sets up the status bar.

## i18n

- `package.nls.json` (English) and `package.nls.zh-cn.json` (Chinese) handle `package.json` string localization via VS Code's `%key%` mechanism.
- Runtime strings use `src/i18n.ts` which provides a `t(key, ...args)` function with `{0}`, `{1}` placeholder substitution. Language is auto-detected from `vscode.env.language`. Add new strings to both `en` and `zhCn` bundles in that file.

## Key Patterns

- **Adding a new step type**: Update `StepType` in `types.ts` → add regex pattern in `interceptor.ts` `parseLogLine()` or `logWatcher.ts` → add icon/label mapping in `stepTreeProvider.ts`.
- **Adding a new command**: Declare in `package.json` `contributes.commands` → register handler in `extension.ts` `activate()` → optionally add menu entry in `contributes.menus`.
- **Adding a new statistic**: Add field to `SessionStats` in `types.ts` → compute in `sessionStore.ts` `getSessionStats()` → display in `statsTreeProvider.ts`.
- **Resource cleanup**: All `Disposable` objects must be registered to `context.subscriptions` or manually managed in a `disposables` array (see `interceptor.ts`).

## Code Conventions

- TypeScript strict mode, CommonJS modules, ES2022 target
- Classes: PascalCase; methods/variables: camelCase; constants: UPPER_SNAKE_CASE
- Events follow `vscode.EventEmitter` + `vscode.Event` pattern
- Errors: silently handle missing data (return `undefined`/empty arrays); show `showWarningMessage` for user-facing errors
- Uses proposed API `chat.onDidPerformAction` via runtime type checking (`typeof chatNs.onDidPerformAction === 'function'`) to avoid compile errors
