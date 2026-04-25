import { Glob } from "bun";
import { join, resolve } from "node:path";

export interface HeaderSynopsis {
  header: string;
  code: string;
  sourceFile: string;
}

const SUBMODULE_SOURCE_DIR = resolve(import.meta.dir, "../deps/draft/source");

const PATCHES = {
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
      `    constexpr resize_t<(basic_mask<Bytes, Abis>::size() + ...),`
    ]
  ]
} as Record<string, [string, string][]>;

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
  const seen = new Set<string>();

  for (const [fileName, content] of texFiles) {
    const synopses = extractFromSingleFile(fileName, content);
    for (const syn of synopses) {
      if (!seen.has(syn.header)) {
        seen.add(syn.header);
        results.push(syn);
      }
    }
  }

  return results;
}

function extractFromSingleFile(
  fileName: string,
  content: string,
): HeaderSynopsis[] {
  const results: HeaderSynopsis[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const headerName = findHeaderMarker(lines, i);
    if (!headerName) continue;

    const codeStart = findNextCodeblock(lines, i + 1);
    if (codeStart === null) continue;

    const codeEnd = findCodeblockEnd(lines, codeStart);
    if (codeEnd === null) continue;

    const codeLines = lines.slice(codeStart + 1, codeEnd);
    results.push({
      header: headerName,
      code: codeLines.join("\n"),
      sourceFile: fileName,
    });
  }

  return results;
}

function findHeaderMarker(lines: string[], lineIdx: number): string | null {
  const line = lines[lineIdx];

  const indexHeaderMatch = line.match(/\\indexheader\{([^}]+)\}/);
  if (indexHeaderMatch) return indexHeaderMatch[1];

  // e.g.
  // \rSec2[array.syn]{Header \tcode{<array>} synopsis}
  const sectionMatch = line.match(
    /\\rSec\d\[(\w+(?:\.\w+)*)\]\{.*\\tcode\{<(\w+(?:\.\w+)*)>\}\s*synopsis\}/,
  );
  if (sectionMatch) return sectionMatch[2];

  return null;
}

function findNextCodeblock(lines: string[], startFrom: number): number | null {
  for (let i = startFrom; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith("\\begin{codeblock}") ||
      trimmed.startsWith("\\begin{codeblocktu}")
    ) {
      return i;
    }
    if (trimmed.startsWith("\\rSec") || trimmed.startsWith("\\indexheader")) {
      return null;
    }
  }
  return null;
}

function findCodeblockEnd(lines: string[], codeStart: number): number | null {
  for (let i = codeStart + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith("\\end{codeblock}") ||
      trimmed.startsWith("\\end{codeblocktu}")
    ) {
      return i;
    }
  }
  return null;
}
