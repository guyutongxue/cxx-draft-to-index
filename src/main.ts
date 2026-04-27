import type {
  IndexOutput,
  SymbolEntry,
} from "./types";
import { loadAllTexFiles, extractHeaderSynopses } from "./latex";
import { preprocessCodeblock, parseCodeblock } from "./cxx";
import { mergeSymbols } from "./merge";
import { topologicalSort } from "./sort";
import assert from "node:assert";

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
  const preprocessed = synopses.map(preprocessCodeblock);
  const totalIncludes = preprocessed.reduce(
    (sum, cb) => sum + cb.includes.length,
    0,
  );
  console.log(
    `Preprocessed ${preprocessed.length} codeblocks (${totalIncludes} #include directives found).\n`,
  );

  const sortedCodeblocks = topologicalSort(preprocessed);

  const parsedSymbols: SymbolEntry[] = [];
  const headers = new Map<string, SymbolEntry[]>();

  for (const block of sortedCodeblocks) {
    console.log(
      `Parsing ${block.isSynopsis ? `<${block.header}>` : block.sectionTitle}...`,
    );
    const symbols = parseCodeblock(
      block.preprocessedCode,
      block.header,
      parsedSymbols,
    );
    parsedSymbols.push(...symbols);
    if (!headers.has(block.header)) {
      headers.set(block.header, []);
    }
    headers.get(block.header)!.push(...block.macroSymbols, ...symbols);
    console.log(`  -> ${symbols.length} symbols`);
  }

  for (const [header, symbols] of headers) {
    const mergedSymbols = mergeSymbols(symbols);
    headers.set(header, mergedSymbols);
    console.log(
      `Merged symbols for <${header}>: ${symbols.length} -> ${mergedSymbols.length}`,
    );
    assert(mergedSymbols.length <= symbols.length);
  }

  const output: IndexOutput = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    headers: Array.from(headers, ([header, symbols]) => ({ header, symbols })),
  };

  const outputPath = import.meta.dir
    ? Bun.file(import.meta.dir + "/../" + OUTPUT_FILE)
    : Bun.file(OUTPUT_FILE);

  await Bun.write(outputPath, JSON.stringify(output, null, 2));
  const totalSymbols = output.headers.reduce(
    (sum, h) => sum + h.symbols.length,
    0,
  );
  console.log(
    `\nDone! Wrote ${totalSymbols} symbols across ${output.headers.length} headers to ${OUTPUT_FILE}`,
  );
}

await main();
