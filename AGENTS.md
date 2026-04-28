# AGENTS.md

## Project Overview

Parses C++ standard draft LaTeX documents and generates a searchable symbol index (JSON). The pipeline:
1. Load `.tex` files from the C++ draft git submodule (`deps/draft/source/`)
2. Extract header synopses from LaTeX `\indexheader` / `\rSec` markers
3. Apply hardcoded patches to fix known LaTeX malformations (`src/latex.ts:PATCHES`)
4. Preprocess C++ code (macros, line continuations, LaTeX escapes)
5. Lex and parse the preprocessed C++ synopsis code
6. Emit, merge, and topologically sort `SymbolEntry` objects per header
7. Write `IndexOutput` to `dist/std-index.json`

**Architecture:** extraction (`src/latex.ts`) → preprocessing (`src/cxx/pp.ts`) → sort (`src/sort.ts`) → lexer (`src/cxx/lexer.ts`) → parser (`src/cxx/parser.ts`) → merge (`src/merge.ts`).
Shared types in `src/share/types.ts`, entry point `src/main.ts`.

A React web frontend (`src/web/`) serves the generated index. It is a separate tsconfig project (`tsconfig.web.json`) sharing only `src/share/`.

## Commands

| Action | Command | Notes |
|--------|---------|-------|
| Install | `bun install` | |
| Extract index only | `bun run extract` | Runs `src/main.ts`; requires submodule |
| Full build (extract + web) | `bun run build` | CI runs this |
| Dev server (watch mode) | `bun run dev` | Serves `src/web/` at `:3000` |
| Production server | `bun run start` | |
| All tests | `bun test` | |
| Single test file | `bun test __tests__/parser.test.ts` | |
| Single test by name | `bun test -t "pattern"` | |
| Type-check backend | `bunx tsc --noEmit` | Excludes `src/web/` |
| Type-check web | `bunx tsc -p tsconfig.web.json --noEmit` | |

**Submodule prerequisite:** `git submodule update --remote --init` before first build.

**CI** (`.github/workflows/ci.yml`): checkout with submodules → `bun install --frozen-lockfile` → `bun run build` → uploads `dist/std-index.json` artifact.

## Key Dependencies

- **immer** — immutable state updates for `ParserContext` (via `produce()`)
- **remeda** — functional utility library used extensively in the parser (like lodash/fp)
- **dependency-graph** — topological sort of headers by `#include` order
- **React + react-router-dom** — web frontend

## LaTeX Patch System

`src/latex.ts` contains hardcoded `PATCHES` — a `Record<filename, [target, replacement][]>` mapping. Each target string must be found exactly once in the file, or the build throws. This is used to fix broken syntax in the source `.tex` files (missing semicolons, mismatched brackets, etc.). When the LaTeX source changes, patches may need updating.

Also contains `REQUIRED_MISSING_INCLUDES` — headers that need extra `#include` lines prepended because the draft omits them.

`future.tex` is explicitly skipped during file loading (it contains deprecated synopses).

## Dual tsconfig Setup

- `tsconfig.json` — backend code: `src/` excluding `src/web/`, plus `__tests__/` and `dist/std-index.json`
- `tsconfig.web.json` — web frontend: `src/web/` + `src/share/` (with DOM lib, JSX support)
- `src/share/` is the shared code between both projects

## Import Conventions

- Use `import type` for type-only imports
- Node built-ins with `node:` prefix: `import { join } from "node:path"`
- Group imports: external → parent modules → sibling modules
- Use `import.meta.dir` (Bun-specific) for resolving paths relative to source file

## Parser-Specific Patterns

- **Lexer → Parser pipeline:** `Lexer` tokenizes; `Parser` uses `tok` (current), `adv()` (consume), `nextTok()`/`peek()` (lookahead)
- **Immutable context:** `ParserContext` updated via `immer`'s `produce()`, never mutated directly
- **Error handling:** `die(msg)` throws with file/line/column; `assert(cond, msg)` for preconditions; `assertId`/`assertP` for token assertions; `unimplemented(name)` for missing features
- **Transactions:** `using transaction = this.createRevertTransaction()` for backtracking parses — `commit()` on success, auto-reverts on dispose
- **Loose parsing:** `LOOSE PARSE` comments mark places where balanced brackets are skipped without full AST detail
- **`#tok`** (Lexer) and **`#settled`** (Transaction) use JS private fields; all other private members use `private` keyword

## Naming Conventions

- Files: `camelCase.ts`
- Classes, interfaces, types, enums: `PascalCase`
- Enum members: `PascalCase`
- Functions/methods/variables: `camelCase`
- Module-level constants: `UPPER_SNAKE_CASE`
- Boolean vars/props: `is`/`has`/`should` prefix

## Testing

- Framework: Bun's built-in `bun:test` (`expect`, `test`)
- Location: `__tests__/`
- Import directly from source: `import { Lexer } from "../src/cxx/lexer"`
- `toMatchObject()` for partial shape matching; `toThrowError()` for failure tests
