import { FunctionLikeMacroSymbolEntry, MacroSymbolEntry } from "../types";
import { resolveLaTeXInText } from "./latex";

interface PreprocessResult {
  preprocessedCode: string;
  macroSymbols: (MacroSymbolEntry | FunctionLikeMacroSymbolEntry)[];
}

// Replace these commands to empty string:
// \vdots: renders a vertical ellipsis, which is used to omit lines
// \itcorr: alignment correction for italic text, should not appear in code
const PREPROCESSED_LATEX = /@(\\vdots|\\itcorr(\[[^\]]*\])?)@/g;

export function preprocessCode(code: string, header: string): PreprocessResult {
  const symbols: (MacroSymbolEntry | FunctionLikeMacroSymbolEntry)[] = [];
  const lines = code.replace(PREPROCESSED_LATEX, "").split("\n");

  // join lines with backslashes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let join = false;
    if (line.endsWith("\\")) {
      join = true;
    }
    // A % at the end of line comment indicates concatenation
    // since comments are automatically escaped
    if (line.match(/\/\/.*%$/)) {
      join = true;
      lines[i] = line.slice(0, -1);
    }
    // Join with next line
    if (join && i + 1 < lines.length) {
      lines[i] = line.slice(0, -1) + lines[i + 1];
      lines.splice(i + 1, 1);
      i--; // reprocess this line in case of multiple continuations
    }
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const resolved = resolveLaTeXInText(line);
    const directive = /^#\s*(\w+)(.*)$/.exec(resolved);
    if (directive) {
      const raw = resolved
        .replace(/\s+/g, " ")
        .replace(/\/\/.*/gm, " ")
        .trim();
      // preprocessor directive
      const [, directiveName, rest] = directive;
      if (directiveName === "define") {
        // Extract macro name and parameters
        const match = rest.match(/^\s*(\w+)(?:\(([^)]*)\))?/);
        if (!match) {
          console.warn(`#define regex matching failed: ${rest}`);
          continue;
        }
        const namespace: never[] = []; // macros should not have namespace
        const [, name, parameterStr] = match;
        if (parameterStr) {
          const parameters = parameterStr
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          symbols.push({
            header,
            namespace,
            name,
            kind: "functionLikeMacro",
            raw,
            parameters,
            languageLinkage: null,
          });
        } else {
          symbols.push({
            header,
            namespace,
            name,
            kind: "macro",
            raw,
            languageLinkage: null,
          });
        }
      }
      // preprocessed
      lines[i] = "";
    }
  }
  return {
    preprocessedCode: lines.join("\n"),
    macroSymbols: symbols,
  };
}
