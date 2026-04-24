import { Token, TokenType } from "./lexer";

const LATEX_SIMPLE: Record<string, string> = {
  "\\seebelow": "/*see_below*/",
  "\\seebelownc": "/*see_below*/",
  "\\seeabove": "/*see_above*/",
  "\\unspec": "/*unspecified*/",
  "\\unspecnc": "/*unspecified*/",
  "\\unspecbool": "/*unspecified-bool-type*/",
  "\\unspecalloctype": "/*unspecified-allocator-type*/",
  "\\unspecuniqtype": "/*unspecified-unique-type*/",
  "\\expos": "/*exposition-only*/",
  "\\ellip": "...",
  "\\brk": " ",
  "\\nocorr": "",
};

type Replacer = (match: string, ...groups: string[]) => string;
const EXPOSITION_ONLY_REPLACER: Replacer = (match, name) => `__${name.replaceAll("-", "_")}`;

const LATEX_BRACED: [RegExp, string | Replacer][] = [
  // as-is replacement with LaTeX labels
  [/^\\libmacro\{([^}]+)\}$/g, "$1"],
  [/^\\defnlibxname\{([^}]+)\}$/g, "$1"],
  [/^\\libglobal\{([^}]+)\}$/g, "$1"],
  [/^\\global\{([^}]+)\}$/g, "$1"],
  [/^\\deflibconcept\{([^}]+)\}$/g, "$1"],
  [/^\\libconcept\{([^}]+)\}$/g, "$1"],
  [/^\\libmember\{([^}]+)\}\{([^}]+)\}$/g, "$1"],
  [/^\\ref\{([^}]+)\}$/g, ""],
  [/^\\iref\{([^}]+)\}$/g, ""],

  // exposition-only symbols, prefix with __
  [/^\\defexposconcept\{([^}]+)\}$/g, EXPOSITION_ONLY_REPLACER],
  [/^\\exposconcept\{([^}]+)\}$/g, EXPOSITION_ONLY_REPLACER],
  [/^\\defexposconceptnc\{([^}]+)\}$/g, EXPOSITION_ONLY_REPLACER],
  [/^\\exposconceptnc\{([^}]+)\}$/g, EXPOSITION_ONLY_REPLACER],
  [/^\\exposid\{([^}]+)\}$/g, EXPOSITION_ONLY_REPLACER],
  [/^\\exposidnc\{([^}]+)\}$/g, EXPOSITION_ONLY_REPLACER],
  // placeholders, should be as-is
  [/^\\placeholder\{([^}]+)\}$/g, "$1"],
  [/^\\placeholdernc\{([^}]+)\}$/g, "$1"],

  // [/^\\tcode\{([^}]*)\}$/g, "$1"],
  // [/^\\keyword\{([^}]+)\}$/g, "$1"],
  // [/^\\term\{([^}]+)\}$/g, "$1"],

  // alignment
  [/^\\itcorr(?:\[[^\]]*\])?$/g, ""],
];

function resolveSingleLaTeX(text: string): string {
  if (typeof LATEX_SIMPLE[text] === "string") {
    return LATEX_SIMPLE[text];
  }
  for (const [regex, replacement] of LATEX_BRACED) {
    text = text.replace(regex, replacement as string);
  }
  // \textit command: replace with comment and drop its all inner LaTeX commands
  if (text.startsWith("\\textit{") && text.endsWith("}")) {
    text = `/* ${text.replace(/\\\w+\{|\}/g, "")} */`;
  }
  return text;
}

export function resolveLatex(tok: Token): string {
  if (tok.type !== TokenType.LatexEscape) return tok.value;
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