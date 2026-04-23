import { FunctionLikeMacroSymbolEntry, MacroSymbolEntry } from "../types";
import { resolveSingleLaTeX } from "./latex";

/**
 * Used in extract macro symbols.
 * We should ONLY call this in preprocessing
 * @param text
 * @returns
 */
function resolveLaTeXInText(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      let j = i + 1;
      while (j < text.length && text[j] !== "@") {
        j++;
      }
      if (j < text.length) {
        result += resolveSingleLaTeX(text.slice(i + 1, j));
        i = j + 1;
      } else {
        result += text.slice(i);
        break;
      }
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

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