import { SymbolEntry } from "../types";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { preprocessCode } from "./pp";

export function parseCodeblock(code: string, header: string): SymbolEntry[] {
  const { preprocessedCode, macroSymbols } = preprocessCode(code, header);

  if (header!="iterator")return[];

  const lexer = new Lexer(preprocessedCode);
  const parser = new Parser(lexer, header);
  parser.parseTopLevel();

  // Merge macro symbols at the beginning
  return [...macroSymbols, ...parser.symbols];
}
