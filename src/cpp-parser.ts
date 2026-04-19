import type { SymbolEntry, SymbolKind } from "./types";

export interface ParseContext {
  header: string;
  namespaceStack: string[];
}

function createDefaultContext(header: string): ParseContext {
  return {
    header,
    namespaceStack: [],
  };
}

export function parseCodeblock(code: string, header: string): SymbolEntry[] {
  const ctx = createDefaultContext(header);
  const symbols: SymbolEntry[] = [];
  const lines = code.split("\n");

  const cleanedLines = preprocessLatex(lines);

  const joinedLines = joinContinuationLines(cleanedLines);

  for (const line of joinedLines) {
    parseLine(line, ctx, symbols);
  }

  return symbols;
}

function preprocessLatex(lines: string[]): string[] {
  return lines.map((line) => {
    let r = line;

    r = r.replace(/@\\seebelow@/g, "/*see_below*/");
    r = r.replace(/@\\seebelownc@/g, "/*see_below*/");
    r = r.replace(/@\\seeabove@/g, "/*see_above*/");
    r = r.replace(/@\\unspec@/g, "/*unspecified*/");
    r = r.replace(/@\\unspecnc@/g, "/*unspecified*/");
    r = r.replace(/@\\unspecbool@/g, "/*unspecified-bool-type*/");
    r = r.replace(/@\\unspecalloctype@/g, "/*unspecified-allocator-type*/");
    r = r.replace(/@\\unspecuniqtype@/g, "/*unspecified-unique-type*/");
    r = r.replace(/@\\expos@/g, "/*exposition-only*/");

    r = r.replace(/@\\deflibconcept\{([^}]+)\}@/g, "$1");
    r = r.replace(/@\\libconcept\{([^}]+)\}@/g, "$1");
    r = r.replace(/@\\defexposconcept\{([^}]+)\}@/g, "$1");
    r = r.replace(/@\\exposconcept\{([^}]+)\}@/g, "$1");
    r = r.replace(/@\\exposconceptnc\{([^}]+)\}@/g, "$1");

    r = r.replace(/@\\exposid\{([^}]+)\}@/g, "__$1");
    r = r.replace(/@\\exposidnc\{([^}]+)\}@/g, "__$1");

    r = r.replace(/@\\placeholder\{([^}]+)\}@/g, "$1");
    r = r.replace(/@\\placeholdernc\{([^}]+)\}@/g, "$1");

    r = r.replace(/@\\tcode\{([^}]*)\}@/g, "$1");

    r = r.replace(/@\\keyword\{([^}]+)\}@/g, "$1");

    r = r.replace(/@\\term\{([^}]+)\}@/g, "$1");
    r = r.replace(/@\\ellip@/g, "...");
    r = r.replace(/@\\brk@/g, " ");
    r = r.replace(/@\\itcorr(?:\[[^\]]*\])?@/g, "");
    r = r.replace(/@\\nocorr@/g, "");

    r = r.replace(/@\\ref\{([^}]+)\}@/g, "");
    r = r.replace(/\\ref\{([^}]+)\}/g, "");
    r = r.replace(/@\\iref\{([^}]+)\}@/g, "");

    r = r.replace(/\\tcode\{([^}]*)\}/g, "$1");
    r = r.replace(/\\keyword\{([^}]+)\}/g, "$1");
    r = r.replace(/\\libconcept\{([^}]+)\}/g, "$1");
    r = r.replace(/\\deflibconcept\{([^}]+)\}/g, "$1");
    r = r.replace(/\\placeholder\{([^}]+)\}/g, "$1");
    r = r.replace(/\\exposid\{([^}]+)\}/g, "__$1");
    r = r.replace(/\\grammarterm\{([^}]+)\}/g, "$1");
    r = r.replace(/\\term\{([^}]+)\}/g, "$1");

    r = r.replace(/\\libmacro\{([^}]+)\}/g, "$1");
    r = r.replace(/\\defnlibxname\{([^}]+)\}/g, "$1");
    r = r.replace(/\\libxmacro\{([^}]+)\}/g, "$1");
    r = r.replace(/\\xname\{([^}]+)\}/g, "__$1");
    r = r.replace(/\\defnlibxname\{([^}]+)\}/g, "$1");
    r = r.replace(/\\mname\{([^}]+)\}/g, "__$1__");
    r = r.replace(/\\UNSP\{([^}]*)\}/g, "/*$1*/");
    r = r.replace(/\\UNSPnc\{([^}]*)\}/g, "/*$1*/");

    r = r.replace(/\\indexlibrary\{[^}]*\}/g, "");
    r = r.replace(/\\indexlibraryglobal\{[^}]*\}/g, "");
    r = r.replace(/\\indexheader\{[^}]*\}/g, "");
    r = r.replace(/\\indexlibrarymisc\{[^}]*\}/g, "");
    r = r.replace(/\\indexlibraryctor\{[^}]*\}/g, "");
    r = r.replace(/\\indexlibrarydtor\{[^}]*\}/g, "");
    r = r.replace(/\\indextext\{[^}]*\}/g, "");
    r = r.replace(/\\idxcode\{([^}]+)\}/g, "$1");

    r = r.replace(/\\\*\\\*/g, "**");

    r = r.replace(/@/g, "");

    r = r.replace(/#if\s+defined\([^)]+\)/g, "");
    r = r.replace(/#endif/g, "");
    r = r.replace(/#ifdef\s+\w+/g, "");
    r = r.replace(/#ifndef\s+\w+/g, "");
    r = r.replace(/#else/g, "");
    r = r.replace(/#elif\s+.*/g, "");

    const commentIdx = r.indexOf("//");
    if (commentIdx !== -1) {
      r = r.substring(0, commentIdx).trimEnd();
    }

    return r.trim();
  }).filter((line) => line.length > 0);
}

function joinContinuationLines(lines: string[]): string[] {
  const result: string[] = [];
  let buffer = "";
  let braceDepth = 0;
  let angleDepth = 0;
  let inString = false;
  let inChar = false;

  function depth(): number {
    return braceDepth + angleDepth;
  }

  for (const line of lines) {
    if (buffer.length > 0) {
      buffer += " " + line;
    } else {
      buffer = line;
    }

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1] || "";
      if (inString) {
        if (ch === '"' && line[i - 1] !== "\\") inString = false;
        continue;
      }
      if (inChar) {
        if (ch === "'" && line[i - 1] !== "\\") inChar = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "'") { inChar = true; continue; }
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }

    if (braceDepth <= 0 && !buffer.trim().startsWith("template<") && buffer.endsWith(";")) {
      result.push(buffer.trim());
      buffer = "";
      braceDepth = 0;
      angleDepth = 0;
    } else if (braceDepth <= 0 && buffer.endsWith("{")) {
      result.push(buffer.trim());
      buffer = "";
    } else if (braceDepth === 0 && !buffer.endsWith(";") && !buffer.endsWith("{") && !buffer.endsWith(",") && depth() === 0) {
      if (buffer.trim().startsWith("#") || buffer.trim().startsWith("namespace ")) {
        result.push(buffer.trim());
        buffer = "";
      }
    }
  }

  if (buffer.trim()) {
    result.push(buffer.trim());
  }

  return result;
}

function parseLine(line: string, ctx: ParseContext, symbols: SymbolEntry[]): void {
  if (!line || line.trim().length === 0) return;
  const s = line.trim();

  if (s === "{" || s === "}") return;

  if (/^#define\s+/.test(s)) {
    const m = s.match(/^#define\s+(\w+)/);
    if (m) {
      symbols.push(makeSym(ctx, m[1], "macro", undefined, undefined, s));
    }
    return;
  }

  if (/^#include\s+/.test(s)) return;

  if (s === "}") {
    ctx.namespaceStack.pop();
    return;
  }

  if (s.endsWith("}") && /^(namespace|inline\s+namespace)\s/.test(s.replace(/\}\s*;?\s*$/, ""))) {
    const nsMatch = s.match(/^(?:inline\s+)?namespace\s+([\w:]+)\s*\{/);
    if (nsMatch) {
      ctx.namespaceStack.push(nsMatch[1]);
      const innerStart = s.indexOf("{");
      const innerEnd = s.lastIndexOf("}");
      if (innerStart !== -1 && innerEnd !== -1) {
        const inner = s.substring(innerStart + 1, innerEnd).trim();
        if (inner) {
          parseInnerBlock(inner, ctx, symbols);
        }
      }
      ctx.namespaceStack.pop();
    }
    return;
  }

  if (/^(?:inline\s+)?namespace\s+/.test(s) && s.includes("{")) {
    const nsMatch = s.match(/^(?:inline\s+)?namespace\s+([\w:]+)\s*\{/);
    if (nsMatch) {
      ctx.namespaceStack.push(nsMatch[1]);
      const braceStart = s.indexOf("{");
      const braceEnd = s.lastIndexOf("}");
      if (braceEnd > braceStart) {
        const inner = s.substring(braceStart + 1, braceEnd).trim();
        if (inner) {
          parseInnerBlock(inner, ctx, symbols);
        }
        ctx.namespaceStack.pop();
      }
      return;
    }
  }

  if (/^(?:inline\s+)?namespace\s+/.test(s) && !s.includes("{")) {
    const nsMatch = s.match(/^(?:inline\s+)?namespace\s+([\w:]+)/);
    if (nsMatch) {
      ctx.namespaceStack.push(nsMatch[1]);
    }
    return;
  }

  if (/^static_assert\s*\(/.test(s)) {
    return;
  }

  if (/^using\s+namespace\s+/.test(s)) {
    const m = s.match(/^using\s+namespace\s+([\w:]+)/);
    if (m) {
      symbols.push(makeSym(ctx, "using namespace " + m[1], "namespace_alias", undefined, undefined, s));
    }
    return;
  }

  if (/^template\s*</.test(s)) {
    parseTemplateDeclaration(s, ctx, symbols);
    return;
  }

  if (/^(?:class|struct|union)\s/.test(s) || /^(?:class|struct|union)\s*$/.test(s)) {
    parseClassOrStruct(s, undefined, ctx, symbols);
    return;
  }

  if (/^enum\s+(class\s+|struct\s+)?/.test(s)) {
    parseEnum(s, undefined, ctx, symbols);
    return;
  }

  if (/^typedef\s+/.test(s)) {
    parseTypedef(s, ctx, symbols);
    return;
  }

  if (/^using\s+\w+\s*=\s*/.test(s)) {
    parseTypeAlias(s, undefined, ctx, symbols);
    return;
  }

  if (s.startsWith("using ")) {
    parseUsingDecl(s, undefined, ctx, symbols);
    return;
  }

  if (/operator/.test(s) && !/operator[<>]=?/.test(s.replace(/operator[<>]=?/g, ""))) {
    parseOperator(s, undefined, ctx, symbols);
    return;
  }

  const funcInfo = tryParseFunction(s, ctx);
  if (funcInfo) {
    symbols.push(funcInfo);
    return;
  }

  const varInfo = tryParseVariable(s, ctx);
  if (varInfo) {
    symbols.push(varInfo);
    return;
  }

  const identifier = extractIdentifier(s);
  if (identifier && !/^[{};]/.test(identifier)) {
    symbols.push(makeSym(ctx, identifier, guessKind(s), undefined, undefined, s));
  }
}

function parseInnerBlock(text: string, ctx: ParseContext, symbols: SymbolEntry[]): void {
  const stmts = splitBySemicolonsAndBraces(text);
  for (const stmt of stmts) {
    parseLine(stmt, ctx, symbols);
  }
}

function splitBySemicolonsAndBraces(text: string): string[] {
  const results: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;

    if (ch === ";" && braceDepth <= 0) {
      if (current.trim()) results.push(current.trim() + ";");
      current = "";
    } else if (ch === "}" && braceDepth <= 0) {
      current += ch;
      if (current.trim()) results.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) results.push(current.trim());
  return results;
}

function parseTemplateDeclaration(s: string, ctx: ParseContext, symbols: SymbolEntry[]): void {
  const templateMatch = s.match(/^template\s*<(.+?)>\s*([\s\S]*)$/);
  if (!templateMatch) return;

  const templateParams = "<" + templateMatch[1].trim() + ">";
  const remainder = templateMatch[2].trim();

  if (!remainder) return;

  if (/^concept\s+/.test(remainder)) {
    const m = remainder.match(/^concept\s+(\w+)\s*=/);
    if (m) {
      symbols.push(makeSym(ctx, m[1], "concept", templateParams, undefined, s));
      return;
    }
  }

  if (/^(?:class|struct|union)\s/.test(remainder)) {
    parseClassOrStruct(remainder, templateParams, ctx, symbols);
    return;
  }

  if (/^enum\s+(class\s+|struct\s+)?/.test(remainder)) {
    parseEnum(remainder, templateParams, ctx, symbols);
    return;
  }

  if (/^using\s+\w+\s*=\s*/.test(remainder)) {
    parseTypeAlias(remainder, templateParams, ctx, symbols);
    return;
  }

  if (/operator/.test(remainder)) {
    parseOperator(remainder, templateParams, ctx, symbols);
    return;
  }

  const specifiers = "inline|constexpr|consteval|constinit|static|virtual|explicit|friend|volatile|extern|thread_local|mutable";
  const specRe = new RegExp(`^(?:(?:${specifiers})\\s+)*`);
  const stripped = remainder.replace(specRe, "").trim();

  if (isFunctionish(stripped)) {
    const nameMatch = extractFunctionName(stripped);
    if (nameMatch) {
      symbols.push(makeSym(ctx, nameMatch, "function_template", templateParams, undefined, s));
      return;
    }
  }

  if (/requires\s/.test(remainder) && /\w+\s*\{/.test(remainder)) {
    const nameMatch = remainder.match(/(\w+)\s*\{/);
    if (nameMatch) {
      symbols.push(makeSym(ctx, nameMatch[1], "class", templateParams, undefined, s));
      return;
    }
  }

  const varMatch = remainder.match(/^(?:(?:inline|constexpr|constinit|static|thread_local|volatile|extern)\s+)*(.+?)\s+(\w+)\s*(?:=|;)/);
  if (varMatch) {
    symbols.push(makeSym(ctx, varMatch[2], "variable_template", templateParams, varMatch[1].trim(), s));
    return;
  }

  const lastIdent = extractLastIdentifier(remainder);
  if (lastIdent) {
    symbols.push(makeSym(ctx, lastIdent, "function_template", templateParams, undefined, s));
  }
}

function parseClassOrStruct(
  s: string,
  templateParams: string | undefined,
  ctx: ParseContext,
  symbols: SymbolEntry[],
): void {
  const m = s.match(/^(?:export\s+)?(?:inline\s+)?(class|struct|union)\s+(?:MANGLE_ON_\w+\s+)?(\w+)/);
  if (m) {
    const kind = m[1] as "class" | "struct" | "union";
    symbols.push(makeSym(ctx, m[2], kind, templateParams, undefined, s));
  }
}

function parseEnum(
  s: string,
  templateParams: string | undefined,
  ctx: ParseContext,
  symbols: SymbolEntry[],
): void {
  const m = s.match(/^enum\s+(class\s+|struct\s+)?(\w+)/);
  if (m) {
    const isScoped = !!m[1];
    symbols.push(makeSym(ctx, m[2], isScoped ? "enum_class" : "enum", templateParams, undefined, s));
  }
}

function parseTypedef(s: string, ctx: ParseContext, symbols: SymbolEntry[]): void {
  const m = s.match(/^typedef\s+.*\s+(\w+)\s*;/);
  if (m) {
    symbols.push(makeSym(ctx, m[1], "typedef", undefined, undefined, s));
  } else {
    const lastId = extractLastIdentifier(s.replace(/;$/, ""));
    if (lastId) symbols.push(makeSym(ctx, lastId, "typedef", undefined, undefined, s));
  }
}

function parseTypeAlias(
  s: string,
  templateParams: string | undefined,
  ctx: ParseContext,
  symbols: SymbolEntry[],
): void {
  const m = s.match(/^using\s+(\w+)\s*=\s*/);
  if (m) {
    const rhs = s.replace(/^using\s+\w+\s*=\s*/, "").replace(/;$/, "").trim();
    const kind: SymbolKind = templateParams ? "variable_template" : "type_alias";
    symbols.push(makeSym(ctx, m[1], kind, templateParams, rhs, s));
  }
}

function parseUsingDecl(
  s: string,
  templateParams: string | undefined,
  ctx: ParseContext,
  symbols: SymbolEntry[],
): void {
  const m = s.match(/^using\s+([\w:]+)/);
  if (m) {
    const name = m[1].includes("::") ? m[1].split("::").pop()! : m[1];
    symbols.push(makeSym(ctx, name, "using_declaration", templateParams, undefined, s));
  }
}

function parseOperator(
  s: string,
  templateParams: string | undefined,
  ctx: ParseContext,
  symbols: SymbolEntry[],
): void {
  const opPatterns = [
    /operator\s*\(\s*\)/,
    /operator\s*\[\s*\]/,
    /operator\s*->/,
    /operator\s*""\s*\w+/,
    /operator\s+"'[^']*'/,
    /operator\s*([^({[\s;=,]+)\s*\(/,
    /operator\s*(\(\))\s*\(/,
    /operator\s*(\[\])\s*\(/,
  ];

  let opName = "";
  for (const pat of opPatterns) {
    const m = s.match(pat);
    if (m) {
      if (pat === opPatterns[0]) opName = "operator()";
      else if (pat === opPatterns[1]) opName = "operator[]";
      else if (pat === opPatterns[2]) opName = "operator->";
      else if (pat === opPatterns[3]) {
        const m2 = s.match(/operator\s*""\s*(\w+)/);
        opName = m2 ? 'operator""' + m2[1] : 'operator""';
      } else if (pat === opPatterns[4]) {
        const m2 = s.match(/operator\s*('[^']*')/);
        opName = m2 ? "operator" + m2[1] : "operator''";
      } else if (pat === opPatterns[5]) {
        opName = "operator" + m[1].trim();
      } else if (pat === opPatterns[6]) {
        opName = "operator()";
      } else if (pat === opPatterns[7]) {
        opName = "operator[]";
      }
      break;
    }
  }

  if (!opName) {
    const litMatch = s.match(/operator\s*""(\w+)/);
    if (litMatch) opName = 'operator""' + litMatch[1];
  }
  if (!opName) {
    opName = "operator";
  }

  const kind: SymbolKind = templateParams ? "function_template" : "operator";
  symbols.push(makeSym(ctx, opName, kind, templateParams, undefined, s));
}

function isOperatorDeclaration(stmt: string): boolean {
  const s = stripSpecifiersAll(stmt);
  if (/operator\s*[([\w<>]/.test(s)) return true;
  if (/operator\s*""\s*[_a-zA-Z]/.test(s)) return true;
  return false;
}

function findMatchingParen(s: string, start: number): number {
  const idx = s.indexOf("(", start);
  if (idx === -1) return -1;
  let depth = 0;
  for (let i = idx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    if (s[i] === ")") depth--;
    if (depth === 0) return idx;
  }
  return -1;
}

function stripSpecifiersAll(s: string): string {
  const specifiers = "inline|constexpr|consteval|constinit|static|virtual|explicit|friend|volatile|extern|thread_local|mutable";
  const specRe = new RegExp(`^(?:(?:${specifiers})\\s+)*`, "s");
  return s.replace(specRe, "").trim();
}

function isFunctionish(s: string): boolean {
  const stripped = stripSpecifiersAll(s);
  const parenIdx = findMatchingParen(stripped, 0);
  if (parenIdx <= 0) return false;
  const beforeParen = stripped.substring(0, parenIdx).trimEnd();
  const lastWord = beforeParen.match(/(\w+)\s*$/);
  if (lastWord && !isFunctionishKeyword(lastWord[1])) return true;
  if (/[*&]\s*$/.test(beforeParen)) return true;
  return false;
}

function isFunctionishKeyword(w: string): boolean {
  return ["class", "struct", "union", "enum", "namespace", "using", "typedef", "template", "concept", "if", "else", "for", "while", "do", "switch", "case", "return", "static_assert", "extern", "volatile", "const", "constexpr", "inline", "friend", "operator"].includes(w);
}

function extractFunctionName(s: string): string | null {
  const stripped = stripSpecifiersAll(s);
  const parenIdx = findMatchingParen(stripped, 0);
  if (parenIdx <= 0) return null;
  const beforeParen = stripped.substring(0, parenIdx).trimEnd();
  const lastWord = beforeParen.match(/(\w+)\s*$/);
  return lastWord ? lastWord[1] : null;
}

function tryParseFunction(s: string, ctx: ParseContext): SymbolEntry | null {
  if (isOperatorDeclaration(s)) return null;
  if (!isFunctionish(s)) return null;

  const name = extractFunctionName(s);
  if (name) {
    return makeSym(ctx, name, "function", undefined, undefined, s);
  }

  const stripped = stripSpecifiersAll(s);
  const funcMatch = stripped.match(/^([\w:&*]+(?:<[^>]*>)?)\s+(\w+)\s*\(/);
  if (funcMatch) {
    return makeSym(ctx, funcMatch[2], "function", undefined, funcMatch[1], s);
  }

  return null;
}

function tryParseVariable(s: string, ctx: ParseContext): SymbolEntry | null {
  if (isFunctionish(s)) return null;
  if (isOperatorDeclaration(s)) return null;

  const stripped = stripSpecifiersAll(s);

  const varMatch = stripped.match(/^([\w:]+(?:<[^>]*>)?(?:\s*[*&]+)?)\s+(\w+)\s*(?:=|;)/);
  if (varMatch) {
    const kw = ["class", "struct", "union", "enum", "namespace", "using", "typedef", "template", "concept", "if", "else", "for", "while", "do", "switch", "case", "return", "static_assert", "void", "operator"];
    if (!kw.includes(varMatch[2])) {
      return makeSym(ctx, varMatch[2], "variable", undefined, varMatch[1].trim(), s);
    }
  }

  return null;
}

function makeSym(
  ctx: ParseContext,
  name: string,
  kind: SymbolKind,
  templateParams?: string,
  typeInfo?: string,
  raw?: string,
): SymbolEntry {
  return {
    header: ctx.header,
    namespace: ctx.namespaceStack.join("::") || "std",
    name,
    kind,
    ...(templateParams ? { template_params: templateParams } : {}),
    ...(typeInfo ? { type_info: typeInfo } : {}),
    ...(raw ? { raw: raw.substring(0, 500) } : { raw: name }),
  };
}

function extractIdentifier(s: string): string {
  const m = s.match(/([a-zA-Z_]\w*)/);
  return m ? m[1] : "";
}

function extractLastIdentifier(s: string): string {
  const m = s.match(/([a-zA-Z_]\w*)\s*$/);
  return m ? m[1] : "";
}

function guessKind(s: string): SymbolKind {
  if (/^(class|struct|union)\s/.test(s)) return "class";
  if (/^enum/.test(s)) return "enum";
  if (/^concept\s/.test(s)) return "concept";
  if (/^typedef\s/.test(s)) return "typedef";
  if (/^using\s/.test(s)) return "type_alias";
  if (/#define/.test(s)) return "macro";
  if (/operator/.test(s)) return "operator";
  if (/\(/.test(s) && !/=\s*\[/.test(s)) return "function";
  return "variable";
}