import type { PreprocessedCodeblock, SymbolEntry } from "../types";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { preprocessCode } from "./pp";
import type { GlobalSymbolTable } from "./symbol_table";

export { preprocessCode };

export function parseCodeblock(
  code: string,
  header: string,
  symTable?: GlobalSymbolTable,
): SymbolEntry[] {
  const { preprocessedCode, macroSymbols } = preprocessCode(code, header);

  const lexer = new Lexer(preprocessedCode);
  const parser = new Parser(lexer, header, symTable);
  const symbols = parser.parseTopLevel();

  return [...macroSymbols, ...symbols];
}

export function preprocessCodeblock(
  code: string,
  header: string,
): PreprocessedCodeblock {
  const { preprocessedCode, macroSymbols, includes } = preprocessCode(
    code,
    header,
  );
  return { header, preprocessedCode, macroSymbols, includes };
}
