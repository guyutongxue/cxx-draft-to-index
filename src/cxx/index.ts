import type {
  Codeblock,
  Header,
  PreprocessedCodeblock,
  PreprocessedHeader,
  SymbolEntry,
} from "../types";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { preprocessCode } from "./pp";

export { preprocessCode };

export function parseCodeblock(
  code: string,
  filename: string,
  parsedSymbols?: SymbolEntry[],
): SymbolEntry[] {
  const { preprocessedCode, macroSymbols } = preprocessCode(code, filename);

  const lexer = new Lexer(preprocessedCode);
  const parser = new Parser(lexer, filename, parsedSymbols);
  const symbols = parser.parseTopLevel();

  return [...macroSymbols, ...symbols];
}

function preprocessCodeblock(
  filename: string,
  codeblock: Codeblock,
  emitIncludes: (incs: string[]) => void,
): PreprocessedCodeblock {
  const { preprocessedCode, macroSymbols, includes } = preprocessCode(
    codeblock.code,
    filename,
  );
  emitIncludes(includes);
  return { ...codeblock, preprocessedCode, macroSymbols };
}

export function preprocessHeader(header: Header): PreprocessedHeader {
  const includes = new Set<string>();
  const emitIncludes = (incs: string[]) => {
    for (const inc of incs) {
      includes.add(inc);
    }
  };
  const synopsis = preprocessCodeblock(
    header.filename,
    header.synopsis,
    emitIncludes,
  );
  const classDefinitions = header.classDefinitions.map((codeblock) =>
    preprocessCodeblock(header.filename, codeblock, emitIncludes),
  );
  return { ...header, synopsis, classDefinitions, includes };
}
