import type { HeaderIndex, IndexOutput, SymbolEntry } from "./share/types.ts";
import { loadAllTexFiles, extractHeaderSynopses } from "./latex.ts";
import { preprocessHeader, parseCodeblock } from "./cxx/index.ts";
import { mergeSymbols } from "./merge.ts";
import { topologicalSort } from "./sort.ts";
import assert from "node:assert";
import path from "node:path";
import { writeFile } from "node:fs/promises";

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
    `Preprocessed ${preprocessed.length} headers (${totalIncludes} #include directives found).\n`,
  );

  const sortedHeaders = topologicalSort(preprocessed);

  const parsedSymbols: SymbolEntry[] = [];
  const parsedHeaders: HeaderIndex[] = [];

  for (const h of sortedHeaders) {
    const headerSymbols: SymbolEntry[] = [];
    for (const block of [h.synopsis, ...h.classDefinitions]) {
      process.stdout.write(
        block.isSynopsis
          ? `Parsing <${h.headerName}>`
          : `  Parsing ${block.sectionTitle}...`,
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
    console.log(`Merged -> ${mergedSymbols.length} symbols`);
    assert(mergedSymbols.length <= headerSymbols.length);
    parsedHeaders.push({ header: h.headerName, symbols: mergedSymbols });
  }

  const output: IndexOutput = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    headers: parsedHeaders,
  };

  const outputPath = path.join(import.meta.dirname, "..", OUTPUT_FILE);

  await writeFile(outputPath, JSON.stringify(output, null, 2));
  const totalSymbols = output.headers.reduce(
    (sum, h) => sum + h.symbols.length,
    0,
  );
  console.log(
    `\nDone! Wrote ${totalSymbols} symbols across ${output.headers.length} headers to ${OUTPUT_FILE}`,
  );
}

await main();
