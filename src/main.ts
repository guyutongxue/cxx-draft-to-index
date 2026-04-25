import type { IndexOutput, HeaderIndex, SymbolEntry } from "./types";
import { loadAllTexFiles, extractHeaderSynopses } from "./latex";
import { parseCodeblock } from "./cxx";
import { mergeSymbols } from "./merge";

const OUTPUT_FILE = "dist/std-index.json";

async function main() {
  console.log("C++ Draft to Index: Generating std symbol index...\n");

  console.log(`Loading .tex files from C++ draft...`);
  const texFiles = await loadAllTexFiles();
  console.log(`Loaded ${texFiles.size} .tex files.\n`);

  console.log(`\nExtracting header synopses...`);
  const synopses = extractHeaderSynopses(texFiles);
  console.log(`Found ${synopses.length} header synopses.\n`);

  const headers: HeaderIndex[] = [];

  for (const synopsis of synopses) {
    console.log(`Parsing <${synopsis.header}> (${synopsis.sourceFile})...`);
    const symbols = parseCodeblock(synopsis.code, synopsis.header);

    headers.push({
      header: synopsis.header,
      symbols,
    });

    console.log(`  -> ${symbols.length} symbols`);
  }

  const mergedHeaders: HeaderIndex[] = headers.map((h) => ({
    header: h.header,
    symbols: mergeSymbols(h.symbols),
  }));

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
