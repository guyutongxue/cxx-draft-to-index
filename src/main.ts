import type { IndexOutput, HeaderIndex, PreprocessedCodeblock, SymbolEntry } from "./types";
import { loadAllTexFiles, extractHeaderSynopses } from "./latex";
import { preprocessCodeblock, parseCodeblock } from "./cxx";
import { mergeSymbols } from "./merge";
import { topologicalSortCodeblocks } from "./sort";

const OUTPUT_FILE = "dist/std-index.json";

async function main() {
  console.log("C++ Draft to Index: Generating std symbol index...\n");

  console.log(`Loading .tex files from C++ draft...`);
  const texFiles = await loadAllTexFiles();
  console.log(`Loaded ${texFiles.size} .tex files.\n`);

  console.log(`\nExtracting header synopses...`);
  const synopses = extractHeaderSynopses(texFiles);
  console.log(`Found ${synopses.length} header synopses.\n`);

  console.log(`Preprocessing codeblocks...`);
  const codeblocks: PreprocessedCodeblock[] = synopses.map((s) =>
    preprocessCodeblock(s.code, s.header),
  );
  const totalIncludes = codeblocks.reduce(
    (sum, cb) => sum + cb.includes.length,
    0,
  );
  console.log(
    `Preprocessed ${codeblocks.length} codeblocks (${totalIncludes} #include directives found).\n`,
  );

  const sortedCodeblocks = topologicalSortCodeblocks(codeblocks);
  if (
    sortedCodeblocks.length !== codeblocks.length ||
    sortedCodeblocks.some((cb, i) => cb.header !== codeblocks[i].header)
  ) {
    console.log(
      `Topologically sorted codeblocks (${sortedCodeblocks.map((cb) => cb.header).join(", ")}).\n`,
    );
  }

  console.log(`Parsing codeblocks...`);
  const parsedSymbols: SymbolEntry[] = [];
  const headers: HeaderIndex[] = [];

  for (const block of sortedCodeblocks) {
    console.log(`Parsing <${block.header}>...`);
    const symbols = parseCodeblock(
      block.preprocessedCode,
      block.header,
      parsedSymbols,
    );
    parsedSymbols.push(...symbols);
    headers.push({
      header: block.header,
      symbols: [...block.macroSymbols, ...symbols],
    });
    console.log(`  -> ${symbols.length} symbols`);
  }

  const groupedByHeader = new Map<string, SymbolEntry[]>();
  for (const h of headers) {
    const existing = groupedByHeader.get(h.header);
    if (existing) {
      existing.push(...h.symbols);
    } else {
      groupedByHeader.set(h.header, [...h.symbols]);
    }
  }

  const mergedHeaders: HeaderIndex[] = [];
  for (const [header, syms] of groupedByHeader) {
    mergedHeaders.push({
      header,
      symbols: mergeSymbols(syms),
    });
  }

  const output: IndexOutput = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    headers: mergedHeaders,
  };

  const outputPath = import.meta.dir
    ? Bun.file(import.meta.dir + "/../" + OUTPUT_FILE)
    : Bun.file(OUTPUT_FILE);

  await Bun.write(outputPath, JSON.stringify(output, null, 2));
  const totalSymbols = mergedHeaders.reduce((sum, h) => sum + h.symbols.length, 0);
  console.log(
    `\nDone! Wrote ${totalSymbols} symbols across ${mergedHeaders.length} headers to ${OUTPUT_FILE}`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
