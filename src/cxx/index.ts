import { Codeblock } from "../latex";
import type { PreprocessedCodeblock, SymbolEntry } from "../types";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { preprocessCode } from "./pp";

export { preprocessCode };

export function parseCodeblock(
  code: string,
  header: string,
  parsedSymbols?: SymbolEntry[],
): SymbolEntry[] {
  const { preprocessedCode, macroSymbols } = preprocessCode(code, header);

  const lexer = new Lexer(preprocessedCode);
  const parser = new Parser(lexer, header, parsedSymbols);
  const symbols = parser.parseTopLevel();

  return [...macroSymbols, ...symbols];
}

export function preprocessCodeblock(
  codeblock: Codeblock,
): PreprocessedCodeblock {
  const { preprocessedCode, macroSymbols, includes } = preprocessCode(
    codeblock.code,
    codeblock.header,
  );
  return { ...codeblock, preprocessedCode, macroSymbols, includes };
}
