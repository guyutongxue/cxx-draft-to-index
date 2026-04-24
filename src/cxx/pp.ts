import { FunctionLikeMacroSymbolEntry, MacroSymbolEntry } from "../types";
import { resolveLaTeXInText } from "./latex";


interface PreprocessResult {
  preprocessedCode: string;
  macroSymbols: (MacroSymbolEntry | FunctionLikeMacroSymbolEntry)[];
}

export function preprocessCode(code: string, header: string): PreprocessResult {
  const symbols: (MacroSymbolEntry | FunctionLikeMacroSymbolEntry)[] = [];
  const lines = code.split("\n");

  // join lines with backslashes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.endsWith("\\")) {
      // Join with next line
      if (i + 1 < lines.length) {
        lines[i] = line.slice(0, -1) + lines[i + 1];
        lines.splice(i + 1, 1);
        i--; // reprocess this line in case of multiple continuations
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const resolved = resolveLaTeXInText(line);
    const directive = /^#\s*(\w+)(.*)$/.exec(resolved);
    if (directive) {
      // preprocessor directive
      const [, directiveName, rest] = directive;
      if (directiveName === "define") {
        // Extract macro name and parameters
        const match = rest.match(/^\s*(\w+)(?:\(([^)]*)\))?/);
        if (!match) {
          console.warn(`#define regex matching failed: ${rest}`);
          continue;
        }
        const namespace = ""; // macros should not have namespace
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
            raw: resolved,
            parameters,
          });
        } else {
          symbols.push({
            header,
            namespace,
            name,
            kind: "macro",
            raw: resolved,
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