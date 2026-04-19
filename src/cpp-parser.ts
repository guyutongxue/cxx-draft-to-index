import type {
  FunctionLikeMacroSymbolEntry,
  MacroSymbolEntry,
  SymbolEntry,
  SymbolKind,
} from "./types";

// ============================================================
// Token types
// ============================================================

export enum TokenType {
  Identifier,
  Number,
  StringLiteral,
  CharLiteral,
  Punct,
  Ellipsis,
  ScopeRes, // ::
  Arrow, // ->
  LatexEscape, // @...@
  EOF,
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ============================================================
// Lexer
// ============================================================

const PUNCT_CHARS = new Set("{}()[],;:=*%+!~^&.|/<>?#@".split(""));

export class Lexer {
  public src: string;
  public pos: number;
  public line: number;
  public col: number;
  public cur: number;

  constructor(src: string) {
    this.src = src;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.cur = this.src.length;
  }

  private ch(offset: number = 0): string {
    const idx = this.pos + offset;
    return idx < this.cur ? this.src[idx] : "\0";
  }

  private advance(): string {
    const c = this.src[this.pos];
    if (c === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    this.pos++;
    return c;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.cur) {
      const c = this.ch();
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        this.advance();
      } else if (c === "/" && this.ch(1) === "/") {
        while (this.pos < this.cur && this.ch() !== "\n") this.advance();
      } else if (c === "/" && this.ch(1) === "*") {
        this.advance();
        this.advance();
        while (this.pos < this.cur) {
          if (this.ch() === "*" && this.ch(1) === "/") {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  next(): Token {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.cur) {
      return { type: TokenType.EOF, value: "", line: this.line, col: this.col };
    }

    const sl = this.line;
    const sc = this.col;
    const c = this.ch();

    // @...@ LaTeX escape
    if (c === "@") {
      this.advance();
      let val = "@";
      while (this.pos < this.cur && this.ch() !== "@") val += this.advance();
      if (this.pos < this.cur) val += this.advance();
      return { type: TokenType.LatexEscape, value: val, line: sl, col: sc };
    }

    // String literal
    if (c === '"') {
      let val = this.advance();
      while (this.pos < this.cur) {
        const x = this.advance();
        val += x;
        if (x === '"' && val[val.length - 2] !== "\\") break;
      }
      return { type: TokenType.StringLiteral, value: val, line: sl, col: sc };
    }

    // Char literal
    if (c === "'") {
      let val = this.advance();
      while (this.pos < this.cur) {
        const x = this.advance();
        val += x;
        if (x === "'" && val[val.length - 2] !== "\\") break;
      }
      return { type: TokenType.CharLiteral, value: val, line: sl, col: sc };
    }

    // Number
    if (c >= "0" && c <= "9") {
      let val = "";
      while (this.pos < this.cur && /[0-9a-fA-FxX.'_]/.test(this.ch()))
        val += this.advance();
      return { type: TokenType.Number, value: val, line: sl, col: sc };
    }

    // Identifier / keyword
    if (c === "_" || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
      let val = "";
      while (
        this.pos < this.cur &&
        (this.ch() === "_" ||
          (this.ch() >= "a" && this.ch() <= "z") ||
          (this.ch() >= "A" && this.ch() <= "Z") ||
          (this.ch() >= "0" && this.ch() <= "9"))
      ) {
        val += this.advance();
      }
      return { type: TokenType.Identifier, value: val, line: sl, col: sc };
    }

    // ...
    if (c === "." && this.ch(1) === "." && this.ch(2) === ".") {
      this.advance();
      this.advance();
      this.advance();
      return { type: TokenType.Ellipsis, value: "...", line: sl, col: sc };
    }

    // ->
    if (c === "-" && this.ch(1) === ">") {
      this.advance();
      this.advance();
      return { type: TokenType.Arrow, value: "->", line: sc, col: sc };
    }

    // ::
    if (c === ":" && this.ch(1) === ":") {
      this.advance();
      this.advance();
      return { type: TokenType.ScopeRes, value: "::", line: sl, col: sc };
    }

    // Single-char punctuation
    if (PUNCT_CHARS.has(c)) {
      this.advance();
      return { type: TokenType.Punct, value: c, line: sl, col: sc };
    }

    // Fallback: skip unknown
    this.advance();
    return this.next();
  }

  peekToken(): Token {
    const sp = this.pos;
    const sl = this.line;
    const sc2 = this.col;
    const tok = this.next();
    this.pos = sp;
    this.line = sl;
    this.col = sc2;
    return tok;
  }
}

// ============================================================
// LaTeX resolution
// ============================================================

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

const LATEX_BRACED: [RegExp, string][] = [
  // as-is replacement with LaTeX labels
  [/^\\libmacro\{([^}]+)\}$/g, "$1"],
  [/^\\defnlibxname\{([^}]+)\}$/g, "$1"],
  [/^\\libglobal\{([^}]+)\}$/g, "$1"],
  [/^\\global\{([^}]+)\}$/g, "$1"],
  [/^\\deflibconcept\{([^}]+)\}$/g, "$1"],
  [/^\\libconcept\{([^}]+)\}$/g, "$1"],
  [/^\\ref\{([^}]+)\}$/g, ""],
  [/^\\iref\{([^}]+)\}$/g, ""],

  // exposition-only symbols, prefix with __
  [/^\\defexposconcept\{([^}]+)\}$/g, "__$1"],
  [/^\\exposconcept\{([^}]+)\}$/g, "__$1"],
  [/^\\exposconceptnc\{([^}]+)\}$/g, "__$1"],
  [/^\\exposid\{([^}]+)\}$/g, "__$1"],
  [/^\\exposidnc\{([^}]+)\}$/g, "__$1"],
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
    text = text.replace(regex, replacement);
  }
  // \textit command: replace with comment and drop its all inner LaTeX commands
  if (text.startsWith("\\textit{") && text.endsWith("}")) {
    text = `/* ${text.replace(/\\\w+\{|\}/g, "")} */`;
  }
  return text;
}

export function resolveLatex(tok: Token): string {
  if (tok.type !== TokenType.LatexEscape) return tok.value;
  return resolveSingleLaTeX(tok.value);
}

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

// ============================================================
// Specifier tracking
// ============================================================

interface SpecifierSet {
  inline: boolean;
  constexpr: boolean;
  constinit: boolean;
  static: boolean;
  virtual: boolean;
  explicit: boolean;
  friend: boolean;
  volatile: boolean;
  extern: boolean;
  thread_local: boolean;
  mutable: boolean;
}

const SPECIFIER_KW = new Set([
  "inline",
  "constexpr",
  "consteval",
  "constinit",
  "static",
  "virtual",
  "explicit",
  "friend",
  "volatile",
  "extern",
  "thread_local",
  "mutable",
]);

function emptySpecs(): SpecifierSet {
  return {
    inline: false,
    constexpr: false,
    constinit: false,
    static: false,
    virtual: false,
    explicit: false,
    friend: false,
    volatile: false,
    extern: false,
    thread_local: false,
    mutable: false,
  };
}

// ============================================================
// Template info
// ============================================================

interface TemplateInfo {
  templateParams: string[];
  templateRequires: string | null;
  isFullSpecialization: boolean;
}

// ============================================================
// Declarator analysis result
// ============================================================

interface DeclaratorInfo {
  name: string;
  kind: "function" | "variable" | "deductionGuide";
  returnType: string;
  parameters: string[];
  hasTemplateArgsOnName: boolean;
}

// ============================================================
// Parser
// ============================================================

export class Parser {
  private lexer: Lexer;
  private header: string;
  private nsStack: string[];
  private inlineUnspec: boolean;
  private langLinkage: "C" | "C++" | null;
  symbols: SymbolEntry[];
  private la: Token;
  private savedPos: number;
  private savedLine: number;
  private savedCol: number;

  constructor(lexer: Lexer, header: string) {
    this.lexer = lexer;
    this.header = header;
    this.nsStack = [];
    this.inlineUnspec = false;
    this.langLinkage = null;
    this.symbols = [];
    this.la = lexer.next();
    this.savedPos = 0;
    this.savedLine = 1;
    this.savedCol = 1;
  }

  // ---- Token helpers ----

  private adv(): Token {
    const t = this.la;
    this.la = this.lexer.next();
    return t;
  }

  private acceptVal(v: string): Token | null {
    if (this.la.value === v) return this.adv();
    return null;
  }

  private isId(v: string): boolean {
    return this.la.type === TokenType.Identifier && this.la.value === v;
  }

  private isP(v: string): boolean {
    return this.la.type === TokenType.Punct && this.la.value === v;
  }

  private isTT(tt: TokenType): boolean {
    return this.la.type === tt;
  }

  private eof(): boolean {
    return this.la.type === TokenType.EOF;
  }

  private resolved(tok: Token): string {
    return tok.type === TokenType.LatexEscape ? resolveLatex(tok) : tok.value;
  }

  private save(): void {
    this.savedPos = this.lexer["pos"];
    this.savedLine = this.lexer["line"];
    this.savedCol = this.lexer["col"];
  }

  private restore(): void {
    this.lexer["pos"] = this.savedPos;
    this.lexer["line"] = this.savedLine;
    this.lexer["col"] = this.savedCol;
    this.la = this.lexer.next();
    // But we need to re-skip whitespace/comments from the saved position
  }

  // ---- Balanced skip helpers ----

  private skipBalanced(open: string, close: string): string {
    let depth = 0;
    let raw = "";
    let started = false;
    while (!this.eof()) {
      const v = this.la.value;
      if (v === open) {
        depth++;
        started = true;
      }
      if (v === close) depth--;
      raw += v;
      this.adv();
      if (started && depth === 0) break;
    }
    return raw;
  }

  private skipBalancedNoCollect(open: string, close: string): void {
    let depth = 0;
    let started = false;
    while (!this.eof()) {
      const v = this.la.value;
      if (v === open) {
        depth++;
        started = true;
      }
      if (v === close) depth--;
      this.adv();
      if (started && depth === 0) break;
    }
  }

  private skipToSemicolon(): void {
    let depth = 0;
    while (!this.eof()) {
      const v = this.la.value;
      if (v === "(" || v === "[" || v === "<") depth++;
      else if (v === ")" || v === "]" || v === ">") depth--;
      else if (depth === 0 && v === ";") break;
      else if (depth === 0 && v === "{") {
        this.skipBalancedNoCollect("{", "}");
        continue;
      }
      this.adv();
    }
  }

  private skipToSemicolonOrBrace(): string {
    let depth = 0;
    let raw = "";
    while (!this.eof()) {
      const v = this.la.value;
      if (depth === 0 && (v === ";" || v === "{")) break;
      if (v === "(" || v === "<") depth++;
      else if (v === ")" || v === ">") depth--;
      else if (v === "[") {
        /* skip */
      } else if (v === "]") {
        /* skip */
      }
      raw += (raw ? " " : "") + this.resolved(this.la);
      this.adv();
    }
    return raw;
  }

  private skipInitializer(): void {
    let depth = 0;
    while (!this.eof()) {
      const v = this.la.value;
      if (v === "(" || v === "{" || v === "<") depth++;
      else if (v === ")" || v === "}" || v === ">") depth--;
      else if (depth === 0 && (v === ";" || v === ",")) break;
      this.adv();
    }
  }

  private skipBaseClasses(): void {
    this.adv(); // consume :
    let depth = 0;
    while (!this.eof()) {
      const v = this.la.value;
      if (v === "(") depth++;
      else if (v === ")") depth--;
      else if (v === "<") depth++;
      else if (v === ">") depth--;
      else if (depth === 0 && (v === "{" || v === ";")) break;
      this.adv();
    }
  }

  // ---- Specifier parsing ----

  private parseSpecifiers(): SpecifierSet {
    const s = emptySpecs();
    while (!this.eof()) {
      if (
        this.la.type === TokenType.Identifier &&
        SPECIFIER_KW.has(this.la.value)
      ) {
        const kw = this.la.value;
        this.adv();
        if (kw === "inline") s.inline = true;
        else if (kw === "constexpr") s.constexpr = true;
        else if (kw === "constinit") s.constinit = true;
        else if (kw === "static") s.static = true;
        else if (kw === "virtual") s.virtual = true;
        else if (kw === "friend") s.friend = true;
        else if (kw === "volatile") s.volatile = true;
        else if (kw === "mutable") s.mutable = true;
        else if (kw === "thread_local") s.thread_local = true;
        else if (kw === "explicit") {
          s.explicit = true;
          if (this.isP("(")) this.skipBalancedNoCollect("(", ")");
        } else if (kw === "extern") {
          s.extern = true;
          if ((this.la.type as number) === TokenType.StringLiteral) {
            this.langLinkage = this.la.value.replace(/"/g, "") as "C" | "C++";
            this.adv();
          }
        }
      } else break;
    }
    return s;
  }

  // ---- Template parameter list ----

  private parseTemplateParams(): TemplateInfo {
    this.adv(); // consume <
    let depth = 1;
    const params: string[] = [];
    let cur = "";
    let requiresText: string | null = null;

    while (!this.eof() && depth > 0) {
      const v = this.la.value;

      if (v === "<") {
        depth++;
        cur += "< ";
        this.adv();
      } else if (v === ">") {
        depth--;
        if (depth === 0) {
          if (cur.trim()) params.push(cur.trim());
          this.adv();
          break;
        }
        cur += "> ";
        this.adv();
      } else if (depth === 1 && v === ",") {
        if (cur.trim()) params.push(cur.trim());
        cur = "";
        this.adv();
      } else {
        const r =
          this.la.type === TokenType.LatexEscape
            ? resolveLatex(this.la)
            : this.la.value;
        if (r.length > 0) {
          const needsSp =
            cur.length > 0 &&
            /[a-zA-Z0-9_]/.test(cur[cur.length - 1]) &&
            /[a-zA-Z0-9_]/.test(r);
          cur += (needsSp ? " " : "") + r;
        }
        this.adv();
      }
    }

    const isFull = params.length === 0;

    if (this.isId("requires")) {
      this.adv();
      requiresText = this.skipRequiresExpression();
    }

    return {
      templateParams: params,
      templateRequires: requiresText,
      isFullSpecialization: isFull,
    };
  }

  private skipRequiresExpression(): string {
    let raw = "";

    if (this.isP("(")) {
      raw = this.skipBalanced("(", ")");
      return raw;
    }

    if (this.isP("{")) {
      this.skipBalancedNoCollect("{", "}");
      return "{ ... }";
    }

    // Otherwise, consume tokens that are part of the requires expression.
    // A requires-clause after template<...> ends when we see a declaration keyword
    // (class, struct, union, enum, using, concept, typedef) or an identifier that starts
    // the actual declaration. We track balanced parens and angle brackets.
    let depth = 0;
    const DECL_KEYWORDS = new Set([
      "class",
      "struct",
      "union",
      "enum",
      "using",
      "concept",
      "typedef",
      "inline",
      "constexpr",
      "consteval",
      "constinit",
      "static",
      "virtual",
      "explicit",
      "friend",
      "extern",
      "thread_local",
      "mutable",
      "volatile",
    ]);
    let tokenCount = 0;
    while (!this.eof()) {
      const v = this.la.value;
      if (v === "(") depth++;
      else if (v === ")") depth--;
      else if (v === "<") depth++;
      else if (v === ">") depth--;

      // Stop at declaration-starting keywords at depth 0
      if (
        depth === 0 &&
        this.la.type === TokenType.Identifier &&
        DECL_KEYWORDS.has(v)
      ) {
        break;
      }

      // Also stop at ; or { at depth 0 (end of requires clause context)
      if (depth === 0 && (v === ";" || v === "{")) {
        break;
      }

      raw += (raw ? " " : "") + this.resolved(this.la);
      this.adv();
      tokenCount++;

      // Safety: don't consume more than 200 tokens
      if (tokenCount > 200) break;

      // After depth returns to 0 and we've consumed at least one token,
      // check if the next token could start a declaration
      if (depth <= 0 && tokenCount > 0) {
        // If we just closed balanced parens/brackets and the next token
        // looks like it starts a declaration, stop
        const nextIsDecl =
          this.la.type === TokenType.Identifier &&
          DECL_KEYWORDS.has(this.la.value);
        if (nextIsDecl) break;
      }
    }
    return raw.trim();
  }

  // ---- Top-level ----

  parseTopLevel(): void {
    let lastPos = -1;
    let stallCount = 0;
    while (!this.eof()) {
      const curPos = this.lexer.pos;
      if (curPos === lastPos) {
        stallCount++;
        if (stallCount > 100) {
          // Completely stuck — advance past current token
          this.adv();
          stallCount = 0;
        }
      } else {
        lastPos = curPos;
        stallCount = 0;
      }

      if (this.isP("}")) {
        if (this.nsStack.length > 0) this.nsStack.pop();
        this.adv();
        continue;
      }
      this.parseDeclaration(emptySpecs(), null);
    }
  }

  // ---- Declaration dispatch ----

  private parseDeclaration(
    specs: SpecifierSet,
    tInfo: TemplateInfo | null,
  ): void {
    if (this.eof()) return;

    // template<...>
    if (this.isId("template")) {
      this.adv();
      const ti = this.parseTemplateParams();
      const combined = this.combineTI(tInfo, ti);
      const inner = this.parseSpecifiers();
      this.parseDeclaration(inner, combined);
      return;
    }

    // namespace
    if (this.isId("namespace")) {
      this.parseNamespace();
      return;
    }

    // class/struct/union (but not inside template params)
    if (this.isId("class") || this.isId("struct") || this.isId("union")) {
      this.parseClassOrStruct(specs, tInfo);
      return;
    }

    // enum
    if (this.isId("enum")) {
      this.parseEnum(tInfo);
      return;
    }

    // typedef
    if (this.isId("typedef")) {
      this.parseTypedef();
      return;
    }

    // using
    if (this.isId("using")) {
      this.parseUsing(tInfo);
      return;
    }

    // concept
    if (this.isId("concept")) {
      this.parseConcept(tInfo);
      return;
    }

    // static_assert
    if (this.isId("static_assert")) {
      this.skipToSemicolon();
      if (this.isP(";")) this.adv();
      return;
    }

    // extern "C"/"C++" linkage specification
    if (specs.extern && this.la.type === TokenType.StringLiteral) {
      const lang = this.la.value.replace(/"/g, "");
      this.langLinkage = lang as "C" | "C++";
      this.adv();
      if (this.isP("{")) {
        this.adv();
        while (!this.eof() && !this.isP("}")) {
          if (this.isP("}")) break;
          const inner = this.parseSpecifiers();
          this.parseDeclaration(inner, null);
        }
        if (this.isP("}")) this.adv();
        this.langLinkage = null;
        return;
      }
    }

    // requires clause before declaration
    if (this.isId("requires")) {
      this.adv();
      this.skipRequiresExpression();
      const inner = this.parseSpecifiers();
      this.parseDeclaration(inner, tInfo);
      return;
    }

    // Disambiguate: function, variable, operator, deduction guide
    this.parseFunctionOrVariableOrOperator(specs, tInfo);
  }

  // ---- Namespace ----

  private parseNamespace(): void {
    this.adv(); // "namespace"

    let isInline = false;
    if (this.isId("inline")) {
      isInline = true;
      this.adv();
    }

    const name = this.readQualifiedIdent();
    if (!name) {
      this.skipToSemicolon();
      if (this.isP(";")) this.adv();
      return;
    }

    // namespace X = Y;
    if (this.isP("=")) {
      this.adv();
      const target = this.readQualifiedIdent();
      if (this.isP(";")) this.adv();
      this.push(
        this.makeSym(target, "namespaceAlias", null, undefined, undefined),
      );
      return;
    }

    // namespace X { ... }
    if (this.isP("{")) {
      this.adv();
      this.nsStack.push(name);
      return;
    }

    // namespace X; (forward declaration)
    this.nsStack.push(name);
    if (this.isP(";")) this.adv();
  }

  // ---- Using ----

  private parseUsing(tInfo: TemplateInfo | null): void {
    this.adv(); // "using"

    // using namespace X;
    if (this.isId("namespace")) {
      this.adv();
      const target = this.readQualifiedIdent();
      if (this.isP(";")) this.adv();
      this.push(
        this.makeSym(target, "usingDirective", null, undefined, undefined, {
          targetNamespace: target,
        }),
      );
      return;
    }

    // using typename X::Y;
    if (this.isId("typename")) {
      this.adv();
    }

    const first = this.readIdentOrLatex();
    if (!first) {
      this.skipToSemicolon();
      if (this.isP(";")) this.adv();
      return;
    }

    // using X = TYPE;
    if (this.isP("=")) {
      this.adv();
      const typeText = this.skipToSemicolonOrBrace();
      if (this.isP(";")) this.adv();
      const kind: SymbolKind = tInfo ? "typeAliasTemplate" : "typeAlias";
      this.push(
        this.makeSym(first, kind, tInfo, typeText || undefined, undefined, {
          syntax: "using" as const,
        }),
      );
      return;
    }

    // using X::Y::Z;
    let target = first;
    while (this.la.type === TokenType.ScopeRes) {
      this.adv();
      const part = this.readIdentOrLatex();
      target += "::" + (part || "");
    }

    if (this.isP(";")) this.adv();
    const simpleName = target.includes("::")
      ? target.split("::").pop()!
      : target;
    this.push(
      this.makeSym(simpleName, "usingDeclaration", null, undefined, undefined, {
        target,
      }),
    );
  }

  // ---- Class / struct / union ----

  private parseClassOrStruct(
    specs: SpecifierSet,
    tInfo: TemplateInfo | null,
  ): void {
    const classKey = this.la.value;
    if (classKey !== "class" && classKey !== "struct" && classKey !== "union")
      return;
    this.adv();

    // Skip MANGLE_ON_* attributes
    while (
      !this.eof() &&
      this.la.type === TokenType.Identifier &&
      this.la.value.startsWith("MANGLE_ON_")
    ) {
      this.adv();
    }

    const name = this.readIdentOrLatex();
    if (!name) {
      this.skipToSemicolonOrBrace();
      if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
      if (this.isP(";")) this.adv();
      return;
    }

    let hasTemplateArgs = false;
    if (this.isP("<")) {
      hasTemplateArgs = true;
      this.skipBalancedNoCollect("<", ">");
    }

    // final/abstract
    if (this.isId("final") || this.isId("abstract")) this.adv();

    // : base classes
    if (this.isP(":")) this.skipBaseClasses();

    let kind: SymbolKind;
    if (tInfo) {
      if (hasTemplateArgs) {
        kind = tInfo.isFullSpecialization
          ? "fullTemplateSpecialization"
          : "partialTemplateSpecialization";
      } else {
        kind = (classKey === "union" ? "class" : classKey) as
          | "class"
          | "struct";
        kind = (kind + "Template") as SymbolKind;
      }
    } else {
      if (hasTemplateArgs) {
        kind = "fullTemplateSpecialization";
      } else {
        kind = classKey as "class" | "struct" | "union";
      }
    }

    this.push(this.makeSym(name, kind, tInfo, undefined, undefined));

    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  // ---- Enum ----

  private parseEnum(tInfo: TemplateInfo | null): void {
    this.adv(); // "enum"

    let scoped = false;
    if (this.isId("class") || this.isId("struct")) {
      scoped = true;
      this.adv();
    }

    const name = this.readIdentOrLatex();
    if (!name) {
      this.skipToSemicolonOrBrace();
      if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
      if (this.isP(";")) this.adv();
      return;
    }

    if (this.isP(":")) {
      this.adv();
      this.skipToSemicolonOrBrace();
    }

    this.push(
      this.makeSym(name, "enum", tInfo, undefined, undefined, { scoped }),
    );

    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  // ---- Typedef ----

  private parseTypedef(): void {
    this.adv(); // "typedef"

    let lastIdent = "";
    while (!this.eof() && !this.isP(";")) {
      if (
        this.la.type === TokenType.Identifier ||
        this.la.type === TokenType.LatexEscape
      ) {
        lastIdent = this.resolved(this.la);
      }
      this.adv();
    }
    if (this.isP(";")) this.adv();

    if (lastIdent) {
      this.push(
        this.makeSym(lastIdent, "typeAlias", null, undefined, undefined, {
          syntax: "typedef" as const,
        }),
      );
    }
  }

  // ---- Concept ----

  private parseConcept(tInfo: TemplateInfo | null): void {
    this.adv(); // "concept"
    const name = this.readIdentOrLatex();
    if (!name) {
      this.skipToSemicolon();
      if (this.isP(";")) this.adv();
      return;
    }

    this.skipToSemicolon();
    if (this.isP(";")) this.adv();
    this.push(this.makeSym(name, "concept", tInfo, undefined, undefined));
  }

  // ---- Operator detection ----

  private isOperatorAhead(): boolean {
    // Instead of scanning forward (which is fragile with lexer state),
    // we check if the current token sequence starts with something that
    // could contain "operator". We simply delegate to the scanner
    // which will detect "operator" during declarator analysis.
    // The real check happens in parseFunctionOrVariableOrOperator.
    return false;
  }

  // ---- Big disambiguator ----

  private parseFunctionOrVariableOrOperator(
    specs: SpecifierSet,
    tInfo: TemplateInfo | null,
  ): void {
    // Check if current token stream starts with or contains "operator"
    // before we reach ( or ;
    if (this.detectOperator()) {
      this.parseOperator(specs, tInfo);
      return;
    }

    // Scan forward to classify the declaration
    const info = this.scanDeclarator(specs, tInfo);
    if (info) {
      this.emitDeclarator(info, specs, tInfo);
      return;
    }

    // Fallback: skip
    this.skipToSemicolonOrBrace();
    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  private detectOperator(): boolean {
    // Clone the lexer at the current position to look ahead without advancing
    const clone = new Lexer("");
    clone.src = this.lexer.src;
    clone.pos = this.lexer.pos;
    clone.line = this.lexer.line;
    clone.col = this.lexer.col;
    clone.cur = this.lexer.cur;

    let depth = 0;
    let maxScan = 80;
    while (maxScan-- > 0) {
      const tok = clone.next();
      if (tok.type === TokenType.EOF) break;
      if (tok.type === TokenType.Identifier && tok.value === "operator")
        return true;
      if (tok.value === "(" || tok.value === "<") depth++;
      if (tok.value === ")" || tok.value === ">") depth--;
      if (
        depth === 0 &&
        (tok.value === ";" || tok.value === "{" || tok.value === "=")
      )
        break;
    }
    return false;
  }

  private scanDeclarator(
    specs: SpecifierSet,
    tInfo: TemplateInfo | null,
  ): DeclaratorInfo | null {
    // Walk tokens collecting type/name, looking for '(' to indicate function,
    // '=' for variable, or '->' for deduction guide / trailing return type.
    const tokens: { resolved: string; raw: string }[] = [];
    let lastIdentIdx = -1;
    let hasNameAngleBracket = false;
    let sawOpenParen = false;
    let paramDepth = 0;
    let angleDepth = 0;
    let state: "type" | "params" | "afterParams" = "type";
    let paramText = "";
    let nameIdent = "";
    let returnType = "";
    let isDeductionGuide = false;
    let trailingRT = "";

    while (!this.eof()) {
      const v = this.la.value;

      if (state === "type") {
        if (v === "(") {
          sawOpenParen = true;
          state = "params";
          paramDepth = 1;
          this.adv();
          continue;
        } else if (v === "=" || v === ";") {
          break;
        } else if (v === "{") {
          break;
        } else if (v === ",") {
          // Multiple declarators on one line - just take first
          break;
        } else if (
          this.la.type === TokenType.Identifier ||
          this.la.type === TokenType.LatexEscape
        ) {
          const r = this.resolved(this.la);
          tokens.push({ resolved: r, raw: v });
          nameIdent = r;
          lastIdentIdx = tokens.length - 1;
          // Reset template args flag — only the last identifier before ( should have this set
          hasNameAngleBracket = false;
          this.adv();
          // Check for < after identifier (template args on name)
          // BUT: this might be part of a return type (e.g., vector<int> foo;)
          // We'll set hasNameAngleBracket here, but it gets reset if another
          // identifier follows before (
          if (this.isP("<")) {
            hasNameAngleBracket = true;
            this.skipBalancedNoCollect("<", ">");
          }
          continue;
        } else if (this.la.type === TokenType.ScopeRes) {
          tokens.push({ resolved: "::", raw: "::" });
          this.adv();
          nameIdent = "";
          lastIdentIdx = -1;
          hasNameAngleBracket = false;
          continue;
        } else if ((this.la.type as number) === TokenType.ScopeRes) {
          tokens.push({ resolved: "::", raw: "::" });
          this.adv();
          nameIdent = "";
          lastIdentIdx = -1;
          continue;
        } else if (v === "<") {
          // Part of type (e.g., allocator<T>)
          angleDepth++;
          tokens.push({ resolved: "<", raw: "<" });
          this.adv();
          this.skipBalancedNoCollect("<", ">");
          angleDepth--;
          tokens.push({ resolved: ">", raw: ">" });
          continue;
        } else {
          tokens.push({ resolved: v, raw: v });
          this.adv();
          continue;
        }
      }

      if (state === "params") {
        if (v === "(") {
          paramDepth++;
          paramText += "( ";
          this.adv();
          continue;
        } else if (v === ")") {
          paramDepth--;
          if (paramDepth > 0) {
            paramText += ") ";
          }
          this.adv();
          if (paramDepth === 0) {
            state = "afterParams";
          }
          continue;
        } else {
          paramText += this.resolved(this.la) + " ";
          this.adv();
          continue;
        }
      }

      if (state === "afterParams") {
        if (this.la.type === TokenType.Arrow) {
          isDeductionGuide = true;
          this.adv();
          while (!this.eof() && !this.isP(";") && !this.isP("{")) {
            trailingRT += this.resolved(this.la) + " ";
            this.adv();
          }
          break;
        } else if (v === ";") {
          break;
        } else if (v === "{") {
          break;
        } else if (this.isId("noexcept")) {
          this.adv();
          if (this.isP("(")) this.skipBalancedNoCollect("(", ")");
          continue;
        } else if (this.isId("requires")) {
          this.adv();
          this.skipRequiresExpression();
          continue;
        } else if (
          this.isId("const") ||
          this.isId("override") ||
          this.isId("final")
        ) {
          this.adv();
          continue;
        } else if (v === "&" || v === "&&") {
          this.adv();
          continue;
        } else {
          this.adv();
          continue;
        }
      }

      this.adv();
    }

    // Analyze
    if (!sawOpenParen) {
      // Variable
      if (nameIdent) {
        returnType = tokens
          .slice(0, lastIdentIdx >= 0 ? lastIdentIdx : undefined)
          .filter((t) => t.resolved.trim().length > 0)
          .map((t) => t.resolved)
          .join(" ")
          .trim();
        return {
          name: nameIdent,
          kind: hasNameAngleBracket ? "variable" : "variable",
          returnType,
          parameters: [],
          hasTemplateArgsOnName: hasNameAngleBracket,
        };
      }
      return null;
    }

    // Function or deduction guide
    returnType = tokens
      .slice(0, lastIdentIdx >= 0 ? lastIdentIdx : undefined)
      .filter((t) => t.resolved.trim().length > 0)
      .map((t) => t.resolved)
      .join(" ")
      .trim();

    const params = this.splitParams(paramText);

    if (isDeductionGuide) {
      return {
        name: nameIdent,
        kind: "deductionGuide",
        returnType,
        parameters: params,
        hasTemplateArgsOnName: hasNameAngleBracket,
      };
    }

    return {
      name: nameIdent,
      kind: "function",
      returnType,
      parameters: params,
      hasTemplateArgsOnName: hasNameAngleBracket,
    };
  }

  private emitDeclarator(
    info: DeclaratorInfo,
    specs: SpecifierSet,
    tInfo: TemplateInfo | null,
  ): void {
    if (info.kind === "deductionGuide") {
      this.push(
        this.makeSym(info.name, "deductionGuide", tInfo, undefined, undefined, {
          constructorName: info.name,
          parameters: info.parameters,
          targetType: info.returnType,
        }),
      );
      if (this.isP(";")) this.adv();
      return;
    }

    if (info.kind === "function") {
      if (info.hasTemplateArgsOnName) {
        this.push(
          this.makeSym(
            info.name,
            tInfo?.isFullSpecialization
              ? "fullTemplateSpecialization"
              : "partialTemplateSpecialization",
            tInfo,
            info.returnType || undefined,
            undefined,
          ),
        );
      } else {
        const kind: SymbolKind = tInfo ? "functionTemplate" : "function";
        this.push(
          this.makeSym(
            info.name,
            kind,
            tInfo,
            info.returnType || undefined,
            undefined,
            {
              returnType: info.returnType || "",
              parameters: info.parameters,
              constexpr: specs.constexpr || undefined,
            },
          ),
        );
      }
      // Skip function body if { ... }
      if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
      if (this.isP(";")) this.adv();
      return;
    }

    // Variable
    if (info.hasTemplateArgsOnName && tInfo) {
      this.push(
        this.makeSym(
          info.name,
          tInfo.isFullSpecialization
            ? "fullTemplateSpecialization"
            : "partialTemplateSpecialization",
          tInfo,
          info.returnType || undefined,
          undefined,
        ),
      );
    } else {
      const kind: SymbolKind = tInfo ? "variableTemplate" : "variable";
      this.push(
        this.makeSym(
          info.name,
          kind,
          tInfo,
          info.returnType || undefined,
          undefined,
          {
            type: info.returnType || "",
            constexpr: specs.constexpr || undefined,
            inline: specs.inline || undefined,
            extern: specs.extern || undefined,
          },
        ),
      );
    }
    // Skip initializer
    if (this.isP("=")) {
      this.adv();
      this.skipInitializer();
    }
    if (this.isP(";")) this.adv();
  }

  // ---- Operator ----

  private parseOperator(specs: SpecifierSet, tInfo: TemplateInfo | null): void {
    // Collect return type tokens until "operator"
    let returnType = "";
    while (
      !this.eof() &&
      !(this.la.type === TokenType.Identifier && this.la.value === "operator")
    ) {
      returnType += (returnType ? " " : "") + this.resolved(this.la);
      this.adv();
    }
    returnType = returnType.trim();

    if (!this.isId("operator")) {
      this.skipToSemicolonOrBrace();
      if (this.isP(";")) this.adv();
      return;
    }
    this.adv(); // consume "operator"

    let opName = "";
    let explicitConv = specs.explicit;

    // Determine which operator
    if (this.isP("(")) {
      // operator() - call operator
      this.adv();
      if (this.isP(")")) {
        opName = "()";
        this.adv();
      }
    } else if (this.isP("[")) {
      this.adv();
      if (this.isP("]")) {
        opName = "[]";
        this.adv();
      }
    } else if (this.la.type === TokenType.Arrow) {
      opName = "->";
      this.adv();
      if (this.isP("*")) {
        opName = "->*";
        this.adv();
      }
    } else if (
      (this.la.type as number) === TokenType.StringLiteral &&
      this.la.value.startsWith('"')
    ) {
      // operator""suffix
      let sv = this.la.value;
      // Extract suffix from string literal like ""sv or "sv"
      sv = sv.replace(/^"/, "").replace(/"$/, "");
      opName = 'operator""' + sv;
      this.adv();
    } else if (this.la.type === TokenType.Identifier) {
      // Conversion operator: operator int, operator bool, operator basic_string, etc.
      opName = this.resolved(this.la);
      this.adv();
      // Could be qualified: operator std::size_t
      while ((this.la.type as number) === TokenType.ScopeRes) {
        opName += "::";
        this.adv();
        if (
          this.la.type === TokenType.Identifier ||
          this.la.type === TokenType.LatexEscape
        ) {
          opName += this.resolved(this.la);
          this.adv();
        }
      }
      // Template type: operator vector<T>
      if (this.isP("<")) {
        // Skip template args
        this.skipBalancedNoCollect("<", ">");
      }
    } else if (
      this.la.type === TokenType.Punct &&
      "+-*/%^&|~!=<>".includes(this.la.value)
    ) {
      // Symbolic operator: + - * / % ^ & | ~ ! = < >
      // Could be compound: ++ -- += -= *= /= %= ^= &= |= <<= >>=
      opName = this.la.value;
      this.adv();
      // Accumulate more punct chars that form compound operators
      const compoundOps = [
        "<<=",
        ">>=",
        "<=",
        ">=",
        "&&",
        "||",
        "==",
        "!=",
        "+=",
        "-=",
        "*=",
        "/=",
        "%=",
        "^=",
        "&=",
        "|=",
        "++",
        "--",
        "<<",
        ">>",
        "<=>",
      ];
      // Try to extend
      while (
        !this.eof() &&
        this.la.type === TokenType.Punct &&
        "+-*/%^&|~!=<>".includes(this.la.value)
      ) {
        const candidate = opName + this.la.value;
        if (
          compoundOps.some((co) => co.startsWith(candidate) || candidate === co)
        ) {
          opName += this.la.value;
          this.adv();
        } else {
          break;
        }
      }
    } else if (this.la.type === TokenType.Ellipsis) {
      // Not a real C++ operator, but handle gracefully
      opName = "...";
      this.adv();
    } else if (this.isP("~")) {
      opName = "~";
      this.adv();
      // Usually followed by class name: ~ClassName()
      if ((this.la.type as number) === TokenType.Identifier) {
        opName += this.resolved(this.la);
        this.adv();
      }
    }

    // Parse parameter list
    const params = this.parseParameterList();

    // Skip trailing: noexcept, requires, const, &, &&, override, final
    this.skipFunctionTrailing();

    const kind: SymbolKind = tInfo ? "operatorTemplate" : "operator";
    this.push(
      this.makeSym(
        "operator" + opName,
        kind,
        tInfo,
        returnType || undefined,
        undefined,
        {
          operator: opName,
          explicit: explicitConv || undefined,
          parameters: params,
        },
      ),
    );

    if (this.isP("{")) this.skipBalancedNoCollect("{", "}");
    if (this.isP(";")) this.adv();
  }

  // ---- Parameter list ----

  private parseParameterList(): string[] {
    if (!this.isP("(")) return [];
    const raw = this.skipBalanced("(", ")");
    let inner = raw.trim();
    if (inner.startsWith("(")) inner = inner.slice(1);
    if (inner.endsWith(")")) inner = inner.slice(0, -1);
    return this.splitParams(inner);
  }

  private splitParams(text: string): string[] {
    const t = text.trim();
    if (!t) return [];
    const params: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of t) {
      if (ch === "(" || ch === "<" || ch === "[") depth++;
      else if (ch === ")" || ch === ">" || ch === "]") depth--;
      if (ch === "," && depth === 0) {
        const p = current.trim();
        if (p) params.push(p);
        current = "";
      } else {
        current += ch;
      }
    }
    const p = current.trim();
    if (p) params.push(p);
    return params;
  }

  private skipFunctionTrailing(): void {
    while (!this.eof()) {
      if (this.isId("noexcept")) {
        this.adv();
        if (this.isP("(")) this.skipBalancedNoCollect("(", ")");
        continue;
      }
      if (
        this.isId("const") ||
        this.isId("override") ||
        this.isId("final") ||
        this.isId("volatile")
      ) {
        this.adv();
        continue;
      }
      if (this.isP("&")) {
        this.adv();
        continue;
      }
      if (this.isP("{")) {
        this.skipBalancedNoCollect("{", "}");
        return;
      }
      if (this.isP(";")) return;
      if (this.isId("requires")) {
        this.adv();
        this.skipRequiresExpression();
        continue;
      }
      // Check for && (rvalue ref qualifier)
      if (this.la.value === "&&") {
        this.adv();
        continue;
      }
      break;
    }
  }

  // ---- Helpers ----

  private readIdentOrLatex(): string {
    if (this.la.type === TokenType.Identifier) {
      const v = this.la.value;
      this.adv();
      return v;
    }
    if (this.la.type === TokenType.LatexEscape) {
      const v = resolveLatex(this.la);
      this.adv();
      if (v.includes("::")) return v.split("::").pop()!;
      return v;
    }
    return "";
  }

  private readQualifiedIdent(): string {
    let name = "";
    while (!this.eof()) {
      if (
        this.la.type === TokenType.Identifier ||
        this.la.type === TokenType.LatexEscape
      ) {
        name += this.resolved(this.la);
        this.adv();
      } else if (this.la.type === TokenType.ScopeRes) {
        name += "::";
        this.adv();
      } else if (this.isP("<")) {
        this.skipBalancedNoCollect("<", ">");
      } else {
        break;
      }
    }
    return name;
  }

  private combineTI(
    outer: TemplateInfo | null,
    inner: TemplateInfo,
  ): TemplateInfo {
    if (!outer) return inner;
    return {
      templateParams: [...outer.templateParams, ...inner.templateParams],
      templateRequires: outer.templateRequires || inner.templateRequires,
      isFullSpecialization:
        outer.isFullSpecialization || inner.isFullSpecialization,
    };
  }

  private push(entry: SymbolEntry): void {
    this.symbols.push(entry);
  }

  private makeSym(
    name: string,
    kind: SymbolKind,
    tInfo: TemplateInfo | null,
    typeInfo?: string,
    raw?: string,
    extra?: Record<string, any>,
  ): SymbolEntry {
    const entry: Record<string, any> = {
      header: this.header,
      namespace: this.nsStack.join("::") || "std",
      name,
      kind,
    };
    if (this.inlineUnspec) entry.inlineUnspecifiedNamespace = true;
    if (this.langLinkage) entry.languageLinkage = this.langLinkage;
    if (tInfo && !tInfo.isFullSpecialization) {
      entry.templateParams = tInfo.templateParams;
      if (tInfo.templateRequires)
        entry.templateRequires = tInfo.templateRequires;
    }
    if (typeInfo) entry.type_info = typeInfo;
    entry.raw = (raw ?? name).substring(0, 500);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== false) entry[k] = v;
      }
    }
    return entry as SymbolEntry;
  }
}

// ============================================================
// Trailing return type tracking (needed for deduction guides)
// ============================================================

// The emitDeclarator function needs the trailingRT variable from scanDeclarator,
// but it's not directly accessible. We'll pass it through the info object instead.

// Override DeclaratorInfo to include trailingReturn
interface DeclaratorInfoFull extends DeclaratorInfo {
  trailingReturnType?: string;
}

// ============================================================
// Preprocessing
// ============================================================

interface PreprocessResult {
  preprocessedCode: string;
  macroSymbols: (MacroSymbolEntry | FunctionLikeMacroSymbolEntry)[];
}

function preprocessCode(code: string, header: string): PreprocessResult {
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
    }
    // preprocessed
    lines[i] = "";
  }
  return {
    preprocessedCode: lines.join("\n"),
    macroSymbols: symbols,
  };
}

// ============================================================
// Public API
// ============================================================

export function parseCodeblock(code: string, header: string): SymbolEntry[] {
  // (because @...@ LaTeX escapes interfere with token-level #define parsing)
  const { preprocessedCode, macroSymbols } = preprocessCode(code, header);

  // TODO DEBUG
  return macroSymbols;

  const lexer = new Lexer(preprocessedCode);
  const parser = new Parser(lexer, header);
  parser.parseTopLevel();

  // Merge macro symbols at the beginning
  return [...macroSymbols, ...parser.symbols];
}
