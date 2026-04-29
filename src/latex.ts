import { Glob } from "bun";
import { join, resolve } from "node:path";
import { Codeblock, Header } from "./share/types";

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
    [
      `    static constexpr array<result_type, @\\exposid{array-size>}@ round_consts;`,
      `    static constexpr array<result_type, @\\exposid{array-size}@> round_consts;`,
    ],
  ],
  "ranges.tex": [
    [
      `      requires Const && @\\libconcept{convertible_to}@<sentinel_t<V>, sentinel_t<@\\exposidnc{Base}@>>`,
      `      requires Const && @\\libconcept{convertible_to}@<sentinel_t<V>, sentinel_t<@\\exposidnc{Base}@>>;`,
    ],
  ],
  "exec.tex": [
    [
      `    void set_stopped() && noexcept\n`,
      `    void set_stopped() && noexcept {\n`,
    ],
  ],
  "containers.tex": [
    [
      `  template<ranges::@\\libconcept{input_range}@ R, class Compare = less<@\\exposid{range-key-type}@<R>,`,
      `  template<ranges::@\\libconcept{input_range}@ R, class Compare = less<@\\exposid{range-key-type}@<R>>,`,
    ],
  ],
  "threads.tex": [
    [
      `    constexpr @\\placeholdernc{floating-poin-type}@t fetch_min(@\\placeholdernc{floating-point-type}@,`,
      `    constexpr @\\placeholdernc{floating-point-type}@ fetch_min(@\\placeholdernc{floating-point-type}@,`,
    ],
    [
      `      bool wait_until(Lock& lock, chrono::time_point<Clock, Duration abs_time,`,
      `      bool wait_until(Lock& lock, chrono::time_point<Clock, Duration> abs_time,`,
    ],
  ],
};

const REQUIRED_MISSING_INCLUDES: Record<string, string[]> = {
  // uses specializations of std::ranges::enable_view
  filesystem: ["ranges"],
  span: ["ranges"],
  optional: ["ranges"],
  // containers, fs::path, and chrono, etc. uses std::formatter specializations, but its name
  // is unqualified so we don't care now. maybe we can fix that in the future if needed
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

export function extractHeaderSynopses(texFiles: Map<string, string>): Header[] {
  const results: Header[] = [];
  for (const [fileName, content] of texFiles) {
    results.push(...new LaTeXFile(fileName, content).extract());
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

function isHeaderMarker(line: string): string | null {
  return line.match(/\\(?:indexheader|libheaderdef)\{([^}]+)\}/)?.[1] ?? null;
}

class LaTeXFile {
  readonly lines: string[];
  lineIdx = 0;
  sectionTitle = "";
  sectionId = "";

  private get line() {
    return this.lines[this.lineIdx];
  }

  constructor(
    private filename: string,
    content: string,
  ) {
    this.lines = content.split("\n");
  }

  advLine() {
    this.lineIdx++;
    const match = /\\rSec\d\[([^\]]+)\]\{(.+)\}/.exec(this.line);
    if (match && !/^overview|general$/i.test(match[2])) {
      this.sectionId = match[1];
      this.sectionTitle = match[2].replace(/\\\w+\{|\}/g, "").trim();
    }
  }

  extract(): Header[] {
    const results: Header[] = [];
    while (this.lineIdx < this.lines.length) {
      const headerName = this.findNextHeaderMarker();
      if (headerName === null) {
        break;
      }
      if (results.find((h) => h.headerName === headerName)) {
        throw new Error(
          `Duplicate header marker for <${headerName}> in ${this.filename}`,
        );
      }
      this.advLine();
      let header: Header | null = null;
      while (true) {
        const code = this.findNextCodeblockInThisHeader(headerName);
        if (code === null) {
          if (header) {
            results.push(header);
          }
          break;
        }
        if (header && !isClassDefinitionCodeblock(code)) {
          continue;
        }
        const codeblock: Codeblock = {
          isSynopsis: !header,
          code: this.prepareSynopsisCode(headerName, code, !header),
          sectionTitle: this.sectionTitle,
          sectionId: this.sectionId,
        };
        if (!header) {
          header = {
            filename: this.filename,
            headerName,
            synopsis: codeblock,
            classDefinitions: [],
          };
        } else {
          header.classDefinitions.push(codeblock);
        }
      }
    }
    return results;
  }

  private findNextHeaderMarker(): string | null {
    while (this.lineIdx < this.lines.length) {
      const headerName = isHeaderMarker(this.line);
      if (headerName) {
        return headerName;
      }
      this.advLine();
    }
    return null;
  }

  private prepareSynopsisCode(
    headerName: string,
    code: string,
    isHeaderSyn: boolean,
  ): string {
    if (!isHeaderSyn) {
      return code;
    }
    const missingIncludes = REQUIRED_MISSING_INCLUDES[headerName];
    if (!missingIncludes) {
      return code;
    }
    return `${missingIncludes.map((inc) => `#include <${inc}>`).join("\n")}\n${code}`;
  }

  private findNextCodeblockInThisHeader(
    currentHeaderName: string,
  ): string | null {
    let codeblockStartLine: number | null = null;
    for (; this.lineIdx < this.lines.length; this.advLine()) {
      const newHeaderName = isHeaderMarker(this.line);
      if (newHeaderName && newHeaderName !== currentHeaderName) {
        if (codeblockStartLine !== null) {
          throw new Error(
            `Unclosed codeblock starting at ${this.filename}:${this.lineIdx + 1}`,
          );
        }
        return null;
      }

      const trimmed = this.line.trim();
      if (codeblockStartLine === null) {
        if (
          trimmed.startsWith("\\begin{codeblock}") ||
          trimmed.startsWith("\\begin{codeblockdigitsep}")
        ) {
          codeblockStartLine = this.lineIdx;
        }
        continue;
      }

      if (
        trimmed.startsWith("\\end{codeblock}") ||
        trimmed.startsWith("\\end{codeblockdigitsep}")
      ) {
        return this.lines
          .slice(codeblockStartLine + 1, this.lineIdx)
          .join("\n");
      }
    }
    return null;
  }
}
