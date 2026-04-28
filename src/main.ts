import type { HeaderIndex, IndexOutput, SymbolEntry } from "./share/types";
import { loadAllTexFiles, extractHeaderSynopses } from "./latex";
import { preprocessHeader, parseCodeblock } from "./cxx";
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
  const preprocessed = synopses.map(preprocessHeader);
  const totalIncludes = preprocessed.reduce(
    (sum, cb) => sum + cb.includes.size,
    0,
  );
  console.log(
    `Preprocessed ${preprocessed.length} codeblocks (${totalIncludes} #include directives found).\n`,
  );

  const sortedHeaders = topologicalSort(preprocessed);

  const parsedSymbols: SymbolEntry[] = [];
  const parsedHeaders: HeaderIndex[] = [];

  for (const h of sortedHeaders) {
    const headerSymbols: SymbolEntry[] = [];
    for (const block of [h.synopsis, ...h.classDefinitions]) {
      process.stdout.write(
        block.isSynopsis ? `Parsing <${h.headerName}>` : `  Parsing ${block.sectionTitle}...`,
      );
      const symbols = parseCodeblock(
        block.preprocessedCode,
        h.headerName,
        parsedSymbols,
      );
      parsedSymbols.push(...symbols);
      headerSymbols.push(...block.macroSymbols, ...symbols);
      console.log(`  -> ${symbols.length} symbols`);
    }
    console.log(`-> ${headerSymbols.length} symbols`);
    const mergedSymbols = mergeSymbols(headerSymbols);
    console.log(
      `Merged -> ${mergedSymbols.length} symbols`,
    );
    assert(mergedSymbols.length <= headerSymbols.length);
    parsedHeaders.push({ header: h.headerName, symbols: mergedSymbols });
  }

  const output: IndexOutput = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    headers: parsedHeaders,
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
