# AGENTS.md

## Project Overview

**cxx-draft-to-index** is a TypeScript tool that parses C++ standard draft LaTeX documents and generates a searchable symbol index (JSON). The pipeline is:

1. Load `.tex` files from the C++ draft git submodule (`deps/draft/source/`)
2. Extract header synopses from LaTeX `\indexheader` / `\rSec` markers
3. Preprocess C++ code (macros, line continuations, LaTeX escapes)
4. Lex and parse the preprocessed C++ synopsis code
5. Emit structured `SymbolEntry` objects per header
6. Write the aggregated `IndexOutput` to `dist/std-index.json`

The project is **heavily work-in-progress** — APIs and structure may change.

## Build / Run / Test Commands

| Action | Command |
|--------|---------|
| Install dependencies | `bun install` |
| Run main script (build) | `bun run build` or `bun run src/main.ts` |
| Run all tests | `bun test` |
| Run a single test file | `bun test __tests__/parser.test.ts` |
| Run a single test by name | `bun test -t "test name pattern"` |
| Type-check | `bunx tsc --noEmit` (bun does not have a built-in typecheck) |

> **Note:** The main script requires the `deps/draft` git submodule. Run `git submodule update --remote --init` before building.

## Code Style Guidelines

### Language & Runtime

- **TypeScript** (strict mode, ESNext target, ESNext modules)
- **Runtime:** Bun (uses Bun-specific APIs: `Bun.file`, `Bun.write`, `import.meta.dir`)
- **Test framework:** Bun's built-in `bun:test` (`expect`, `test`)

### Imports

- Use `import type` for type-only imports.
- Group imports by scope: external packages first, then parent modules, then sibling modules.
  ```ts
  import { produce } from "immer";           // external
  import type { SymbolEntry } from "../types"; // parent (type-only)
  import { resolveLaTeX } from "./latex";      // sibling
  ```
- Use Node.js built-in modules via `node:` prefix: `import { join, resolve } from "node:path";`

### Formatting

- **Indentation:** 2 spaces
- **Semicolons:** always
- **Trailing commas:** always (in multi-line)
- **Strings:** prefer double quotes for imports, template strings for multi-line
- **Line length:** no hard limit, but keep reasonable (~120)
- Use blank lines to separate logical sections within functions

### Naming Conventions

- **Files:** `camelCase.ts` (e.g., `parser.ts`, `pp.ts`)
- **Classes:** `PascalCase` (e.g., `Lexer`, `Parser`, `Token`)
- **Interfaces/Types:** `PascalCase` (e.g., `SymbolEntry`, `IdExpressionInfo`)
  - Type aliases for unions/intersections use `PascalCase` (e.g., `ClassTagKind`)
  - Helper/utility types use `PascalCase` (e.g., `Templatize`, `Computed`)
- **Enums:** `PascalCase` for enum names, `PascalCase` for enum members
  ```ts
  enum TokenType { Identifier, Number, StringLiteral }
  enum DeclarationContextType { Unknown, Class, TopLevel }
  ```
- **Functions/Methods:** `camelCase` (e.g., `parseTopLevel`, `readIdExpression`)
- **Private fields:** use `private` keyword (no `#` prefix except for private `#tok` in Lexer and `#settled` in Transaction)
- **Constants:** `UPPER_SNAKE_CASE` for module-level constants (e.g., `PUNCT_CHARS`, `DECL_SPECIFIER_KEYWORD`)
- **Boolean variables/properties:** `is`/`has`/`should` prefix (e.g., `isId`, `isP`, `isEof`)

### Types

- Prefer `interface` for object shapes; use `type` for unions, intersections, mapped types, and utility aliases.
- Use `readonly` modifier for immutable data; use `immer` (`produce`) for immutable state updates.
- Use discriminated unions with `kind` field for symbol entries (see `SymbolEntry` in `src/types.ts`).
- Use `as const` for literal arrays that serve as lookup tables.
- Avoid `any`; use `unknown` when the type is truly unknown.
- Use `satisfies` or explicit type annotations where inference is insufficient.

### Error Handling

- **Parsing errors:** Use `this.die(message)` in the parser, which throws with file/line/column context.
- **Assertions:** Use `this.assert(condition, message)` for parser preconditions. There is also `this.assertId` / `this.assertP` for token assertions.
- **Unimplemented features:** Use `this.unimplemented(name)` to explicitly mark unimplemented parser paths.
- **Soft failures:** Use `console.warn(...)` for recoverable issues (e.g., failed regex matching in preprocessor).
- **Top-level:** `main().catch(...)` with `process.exit(1)`.
- **Transactions:** Use `using transaction = this.createRevertTransaction()` for speculative/backtracking parses. Call `transaction.commit()` on success; it auto-reverts on dispose if not committed.

### Architecture Patterns

- **Lexer → Parser pipeline:** The `Lexer` tokenizes; `Parser` consumes tokens via `tok` (current), `adv()` (consume), `nextTok()` (peek), and `peek()` (lookahead).
- **Immutable context:** Parser state (`ParserContext`) is updated via `immer`'s `produce()`, not by direct mutation.
- **Exported entry points:** Keep barrel `index.ts` files minimal; re-export only the public API.
- **Loose parsing:** Many C++ constructs are parsed loosely (skipping balanced brackets without full AST detail). Mark these with `LOOSE PARSE` comments.

### Testing

- Test files live in `__tests__/` and use `bun:test` framework.
- Import directly from source: `import { Lexer } from "../src/cxx/lexer";`
- Test names should be descriptive of the scenario being tested.
- Use `expect().toMatchObject()` for partial shape matching of parsed symbols.
- Use `expect().toThrowError()` for parser failure tests.

### Git & CI

- CI runs on Ubuntu via GitHub Actions (`.github/workflows/ci.yml`).
- CI steps: checkout (with submodules) → setup Bun → `bun install --frozen-lockfile` → `bun run src/main.ts` → upload artifact.
- No lint step exists yet; no formatter is configured. Follow existing code style manually.