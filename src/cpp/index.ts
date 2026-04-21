import { SymbolEntry } from "../types";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { preprocessCode } from "./pp";

export function parseCodeblock(code: string, header: string): SymbolEntry[] {
  // (because @...@ LaTeX escapes interfere with token-level #define parsing)
  const { preprocessedCode, macroSymbols } = preprocessCode(code, header);

  const lexer = new Lexer(preprocessedCode);
  const parser = new Parser(lexer, header);
  parser.parseTopLevel();

  // Merge macro symbols at the beginning
  return [...macroSymbols, ...parser.symbols];
}
