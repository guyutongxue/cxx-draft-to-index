import { Glob } from "bun";
import { join, resolve } from "node:path";

export interface HeaderSynopsis {
  header: string;
  code: string;
  sourceFile: string;
}

const SUBMODULE_SOURCE_DIR = resolve(import.meta.dir, "../deps/draft/source");

const PATCHES: Record<string, [string, string][]> = {
  "algorithms.tex": [
    [
      `    constexpr OutputIterator fill_n(OutputIterator first, Size n, const T& value)`,
      `    constexpr OutputIterator fill_n(OutputIterator first, Size n, const T& value);`,
    ],
    [
      `             class T = projected_value_t<I, Proj,`,
      `             class T = projected_value_t<I, Proj>,`,
    ],
  ],
  "support.tex": [
    [`  \\indexlibraryglobal{align_val_t}%`, ""],
    [`  \\indexlibraryglobal{destroying_delete_t}%`, ""],
    [`  \\indexlibraryglobal{destroying_delete}%`, ""],
    [`  \\indexlibraryglobal{nothrow_t}%`, ""],
    [`  \\indexlibraryglobal{nothrow}`, ""],
  ],
  "numerics.tex": [
    [
      `    constexpr resize_t<(basic_mask<Bytes, Abis>::size() + ...)>,`,
      `    constexpr resize_t<(basic_mask<Bytes, Abis>::size() + ...),`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const @\\exposid{deduced-vec-t}@<V>& x, const @\\exposid{deduced-vec-t}@<V>& y`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const @\\exposid{deduced-vec-t}@<V>& x, const @\\exposid{deduced-vec-t}@<V>& y,`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const @\\exposid{deduced-vec-t}@<V>& x, const V& y`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const @\\exposid{deduced-vec-t}@<V>& x, const V& y,`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const V& x, const @\\exposid{deduced-vec-t}@<V>& y\n`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const V& x, const @\\exposid{deduced-vec-t}@<V>& y,\n`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const @\\exposid{deduced-vec-t}@<V>& x, const V& y\n`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const @\\exposid{deduced-vec-t}@<V>& x, const V& y,\n`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const V& x, const @\\exposid{deduced-vec-t}@<V>& y`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> hypot(const V& x, const @\\exposid{deduced-vec-t}@<V>& y,`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> fma(const @\\exposid{deduced-vec-t}@<V>& x, const @\\exposid{deduced-vec-t}@<V>& y`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> fma(const @\\exposid{deduced-vec-t}@<V>& x, const @\\exposid{deduced-vec-t}@<V>& y,`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> fma(const @\\exposid{deduced-vec-t}@<V>& x, const V& y\n`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> fma(const @\\exposid{deduced-vec-t}@<V>& x, const V& y,\n`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> fma(const V& x, const @\\exposid{deduced-vec-t}@<V>& y\n`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> fma(const V& x, const @\\exposid{deduced-vec-t}@<V>& y,\n`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> lerp(const @\\exposid{deduced-vec-t}@<V>& x, const @\\exposid{deduced-vec-t}@<V>& y`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> lerp(const @\\exposid{deduced-vec-t}@<V>& x, const @\\exposid{deduced-vec-t}@<V>& y,`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> lerp(const @\\exposid{deduced-vec-t}@<V>& x, const V& y\n`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> lerp(const @\\exposid{deduced-vec-t}@<V>& x, const V& y,\n`,
    ],
    [
      `    constexpr @\\exposid{deduced-vec-t}@<V> lerp(const V& x, const @\\exposid{deduced-vec-t}@<V>& y\n`,
      `    constexpr @\\exposid{deduced-vec-t}@<V> lerp(const V& x, const @\\exposid{deduced-vec-t}@<V>& y,\n`,
    ],
  ],
  "ranges.tex": [
    [
      `      requires Const && @\\libconcept{convertible_to}@<sentinel_t<V>, sentinel_t<@\\exposidnc{Base}@>>`,
      `      requires Const && @\\libconcept{convertible_to}@<sentinel_t<V>, sentinel_t<@\\exposidnc{Base}@>>;`,
    ],
  ],
};

const REQUIRED_MISSING_INCLUDES: Record<string, string[]> = {
  // uses specializations of std::ranges::enable_view
  filesystem: ["ranges"],
  span: ["ranges"],
  optional: ["ranges"],
};

function applyPatches(fileName: string, content: string): string {
  const patches = PATCHES[fileName];
  if (!patches) return content;

  let patchedContent = content;
  for (const [target, replacement] of patches) {
    const newContent = patchedContent.replace(target, replacement);
    if (newContent === patchedContent) {
      throw new Error(`Patch target not found in ${fileName}: "${target}"`);
    }
    patchedContent = newContent;
  }
  return patchedContent;
}

type AnyTuple = [unknown, ...unknown[]];

export async function loadAllTexFiles(): Promise<Map<string, string>> {
  const files = new Map<string, Promise<string>>();

  for await (const name of new Glob("*.tex").scan(SUBMODULE_SOURCE_DIR)) {
    if (name === "future.tex") {
      // this file contains deprecated synopses, skip
      continue;
    }
    const filePath = join(SUBMODULE_SOURCE_DIR, name);
    const content = Bun.file(filePath).text();
    files.set(name, content);
  }

  return new Map(
    await Promise.all(
      files
        .entries()
        .map(
          async ([k, v]) => [k, applyPatches(k, await v)] satisfies AnyTuple,
        ),
    ),
  );
}

export function extractHeaderSynopses(
  texFiles: Map<string, string>,
): HeaderSynopsis[] {
  const results: HeaderSynopsis[] = [];

  for (const [fileName, content] of texFiles) {
    results.push(...extractFromSingleFile(fileName, content));
  }

  return results;
}

function isClassDefinitionCodeblock(code: string): boolean {
  const hasStdNamespace =
    /\bnamespace\s+std(?:::[A-Za-z_][A-Za-z0-9_:]*)?\s*\{/.test(code);
  const hasClassLikeDefinition =
    /\b(class|struct|union|enum)\b[\s\S]*\{/.test(code) && /\};/.test(code);
  return hasStdNamespace && hasClassLikeDefinition;
}

function extractFromSingleFile(
  fileName: string,
  content: string,
): HeaderSynopsis[] {
  const results: HeaderSynopsis[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const headerName = isHeaderMarker(lines[i]);
    if (!headerName) {
      i++;
      continue;
    }
    let hasSynopsis = false;
    while (true) {
      let code: string | null;
      [code, i] = findNextCodeblockInThisHeader(fileName, lines, i + 1);
      if (code === null) {
        break;
      }
      if (hasSynopsis && !isClassDefinitionCodeblock(code)) {
        continue;
      }
      if (!hasSynopsis) {
        hasSynopsis = true;
        // add missing #include to the header synopsis
        if (REQUIRED_MISSING_INCLUDES[headerName]) {
          code =
            REQUIRED_MISSING_INCLUDES[headerName]
              .map((inc) => `#include <${inc}>`)
              .join("\n") +
            "\n" +
            code;
        }
      }
      results.push({
        header: headerName,
        code,
        sourceFile: fileName,
      });
    }
  }
  return results;
}

function isHeaderMarker(line: string): string | null {
  return line.match(/\\(?:indexheader|libheaderdef)\{([^}]+)\}/)?.[1] ?? null;
}

function findNextCodeblockInThisHeader(
  fileName: string,
  lines: string[],
  startFrom: number,
): [content: string | null, endIdx: number] {
  let startLine: number | null = null;
  for (let i = startFrom; i < lines.length; i++) {
    if (isHeaderMarker(lines[i])) {
      if (startLine) {
        throw new Error(`Unclosed codeblock starting at ${fileName}:${i + 1}`);
      }
      return [null, i];
    }
    const trimmed = lines[i].trim();
    if (startLine === null) {
      if (
        trimmed.startsWith("\\begin{codeblock}") ||
        trimmed.startsWith("\\begin{codeblockdigitsep}")
      ) {
        startLine = i;
      }
    } else {
      if (
        trimmed.startsWith("\\end{codeblock}") ||
        trimmed.startsWith("\\end{codeblockdigitsep}")
      ) {
        return [lines.slice(startLine + 1, i).join("\n"), i];
      }
    }
  }
  return [null, lines.length - 1];
}
