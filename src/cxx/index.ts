import type {
  Codeblock,
  Header,
  PreprocessedCodeblock,
  PreprocessedHeader,
  SymbolEntry,
} from "../share/types.ts";
import { Lexer } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { preprocessCode } from "./pp.ts";

export { preprocessCode };

export function parseCodeblock(
  preprocessedCode: string,
  header: string,
  parsedSymbols?: SymbolEntry[],
): SymbolEntry[] {
  const lexer = new Lexer(preprocessedCode);
  const parser = new Parser(lexer, header, parsedSymbols);
  return parser.parseTopLevel();
}

function preprocessCodeblock(
  header: string,
  codeblock: Codeblock,
  emitIncludes: (incs: string[]) => void,
): PreprocessedCodeblock {
  const { preprocessedCode, macroSymbols, includes } = preprocessCode(
    codeblock.code,
    header,
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
    header.headerName,
    header.synopsis,
    emitIncludes,
  );
  const classDefinitions = header.classDefinitions.map((codeblock) =>
    preprocessCodeblock(header.headerName, codeblock, emitIncludes),
  );
  return { ...header, synopsis, classDefinitions, includes };
}
