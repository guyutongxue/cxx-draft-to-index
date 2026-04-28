import { Token, TokenType } from "./lexer";

const LATEX_SIMPLE: Record<string, string> = {
  "\\seebelow": "/* see_below */",
  "\\seebelownc": "/* see_below */",
  "\\seeabove": "/* see_above */",
  "\\unspec": "/* unspecified */",
  "\\unspecnc": "/* unspecified */",
  "\\unspecbool": "/* unspecified-bool-type */",
  "\\unspecalloctype": "/* unspecified-allocator-type */",
  "\\unspecuniqtype": "/* unspecified-unique-type */",
  "\\expos": "/* exposition-only */",
};

const useExpositionOnlyReplace: unique symbol = Symbol(
  "useExpositionOnlyReplace",
);
type Replacer = (match: string, ...groups: string[]) => string;
const EXPOSITION_ONLY_REPLACER: Replacer = (match, name) =>
  `__${name.replaceAll("-", "_")}`;
const EXPOSITION_ONLY_INLINE_REPLACER: Replacer = (match, name) =>
  `⟨${name.replaceAll("-", "_")}⟩`;

const LATEX_BRACED: [RegExp, string | typeof useExpositionOnlyReplace][] = [
  // as-is replacement with LaTeX labels
  [/^\\libmacro\{([^}]+)\}$/g, "$1"],
  [/^\\defnlibxname\{([^}]+)\}$/g, "$1"],
  [/^\\libglobal\{([^}]+)\}$/g, "$1"],
  [/^\\global\{([^}]+)\}$/g, "$1"],
  [/^\\deflibconcept\{([^}]+)\}$/g, "$1"],
  [/^\\libconcept\{([^}]+)\}$/g, "$1"],
  [/^\\libmember\{([^}]+)\}\{([^}]+)\}$/g, "$1"],
  [/^\\libspec\{([^}]+)\}\{([^}]+)\}$/g, "$1"],
  [/^\\ref\{([^}]+)\}$/g, ""],
  [/^\\iref\{([^}]+)\}$/g, ""],

  // exposition-only symbols, prefix with __
  [/^\\defexposconcept\{([^}]+)\}$/g, useExpositionOnlyReplace],
  [/^\\exposconcept\{([^}]+)\}$/g, useExpositionOnlyReplace],
  [/^\\defexposconceptnc\{([^}]+)\}$/g, useExpositionOnlyReplace],
  [/^\\exposconceptnc\{([^}]+)\}$/g, useExpositionOnlyReplace],
  [/^\\exposid\{([^}]+)\}$/g, useExpositionOnlyReplace],
  [/^\\exposidnc\{([^}]+)\}$/g, useExpositionOnlyReplace],
  // placeholders
  [/^\\placeholder\{([^}]+)\}$/g, useExpositionOnlyReplace],
  [/^\\placeholdernc\{([^}]+)\}$/g, useExpositionOnlyReplace],
];

function resolveSingleLaTeX(text: string, inline = false): string {
  if (typeof LATEX_SIMPLE[text] === "string") {
    return LATEX_SIMPLE[text];
  }
  for (const [regex, replacement] of LATEX_BRACED) {
    if (replacement === useExpositionOnlyReplace) {
      text = text.replace(
        regex,
        inline ? EXPOSITION_ONLY_INLINE_REPLACER : EXPOSITION_ONLY_REPLACER,
      );
    } else {
      text = text.replace(regex, replacement);
    }
  }
  // \textit command: replace with comment and drop its all inner LaTeX commands
  if (
    (text.startsWith("\\textit{") || text.startsWith("\\impdefx{")) &&
    text.endsWith("}")
  ) {
    text = `/* ${text.replace(/\\\w+\{|\}/g, "")} */`;
  }
  return text;
}

export function resolveLatex(tok: Token): string {
  if (tok.type !== TokenType.LatexEscape) {
    if (tok.value.includes("@")) {
      return resolveLaTeXInText(tok.value);
    }
    return tok.value;
  }
  return resolveSingleLaTeX(tok.value.slice(1, -1));
}

/**
 * replace @...@ LaTeX mark to codes
 * @param text
 * @returns
 */
export function resolveLaTeXInText(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      let j = i + 1;
      while (j < text.length && text[j] !== "@") {
        j++;
      }
      if (j < text.length) {
        const inline = i > 0 && /[A-Za-z_]/.test(text[i - 1]);
        result += resolveSingleLaTeX(text.slice(i + 1, j), inline);
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
