import type {
  ExtractKind,
  SymbolEntry,
  SymbolEntryBase,
  SymbolKind,
} from "../types";
import { resolveLatex } from "./latex";
import { Lexer, Location, Token, TokenType } from "./lexer";
import { produce } from "immer";

interface ParserContext {
  // TODO support class/enum scope
  readonly nsStack: readonly string[];
  readonly symbols: readonly SymbolEntry[];
}

interface AttributeInfo {
  raw: string;
}

interface TemplateParameterInfo {
  raw: string;
}

interface TemplateInfo {
  // explicitInstantiation?: boolean;

  fullSpecialization: boolean;
  templateParameters: TemplateParameterInfo[];

  requiresClause: string | null;
}

enum DeclSpecContextType {
  Unknown,
  Class,
  TopLevel,
  Trailing,
  Parameter,
  // TypeSpec, // e.g. new struct S;
  // AliasDecl, // e.g. using X = struct S;
}

interface ExpressionInfo {
  raw: string;
}

const DECL_SPECIFIER_KEYWORD = [
  "friend",
  "typedef",
  "constexpr",
  "consteval",
  "constinit",
  "inline",
  "virtual",
  "explicit",
  "static",
  "thread_local",
  "extern",
  "mutable",
] as const;
const TYPE_SPECIFIER_KEYWORD = [
  "void",
  "int",
  "short",
  "long",
  "char",
  "char8_t",
  "char16_t",
  "char32_t",
  "signed",
  "unsigned",
  "float",
  "double",
  "bool",
];
const CLASS_SPECIFIER_KEYWORD = ["class", "struct", "union"];

type DeclSpecifierKeyword = (typeof DECL_SPECIFIER_KEYWORD)[number];

enum IdPartKind {
  Identifier,
  // must be the tail
  Operator,
  Conversion,
  UDL,
  Destructor,
  // must be the scope
  Computed, // decltype, pack-index, splice
}

interface TemplateArgumentInfo {
  raw: string;
}

interface IdExpressionPartInfo {
  kind: IdPartKind;
  name: string;
  // type name (no template args), null for computed
  componentName: string | null;
  templateArgs: TemplateArgumentInfo[] | null;
}

interface IdExpressionInfo {
  name: string;
  fromGlobal: boolean;
  parts: IdExpressionPartInfo[];
}

type ClassTagKind = "class" | "struct" | "union";
type ClassSpecifierUseKind = "definition" | "declaration" | "reference";

interface ClassSpecifierInfo {
  tagKind: ClassTagKind;
  name: string;
  templateArgs: TemplateArgumentInfo[] | null;
  useKind: ClassSpecifierUseKind;
  raw: string;
}

interface CvQualifierSet {
  const: boolean;
  volatile: boolean;
}

interface DeclarationSpecifierInfo {
  typeSpecifiers: string[];
  cvQualifiers: CvQualifierSet;
  declSpecifiers: DeclSpecifierKeyword[];
  explicitSpecifier: boolean | ExpressionInfo;
  classSpecifier: ClassSpecifierInfo | null;
}

interface DeclaratorInfo {}

export class Parser {
  private readonly filename: string;

  private lexer: Lexer;
  private context: ParserContext;

  /** current token */
  private get tok() {
    return this.lexer.tok;
  }
  private nextTok(): Token {
    return this.lexer.peek();
  }

  constructor(lexer: Lexer, filename: string) {
    this.lexer = lexer;
    this.filename = filename;
    this.context = {
      nsStack: [],
      symbols: [],
    };
  }

  // ---- Token helpers ----

  /** @returns old token */
  private adv(): Token {
    const t = this.tok;
    this.lexer.next();
    return t;
  }

  /** is identifier or keyword */
  private isId(v: string): boolean {
    return this.tok.isId(v);
  }

  /** is punctuation */
  private isP(v: string): boolean {
    return this.tok.isP(v);
  }

  private isIdentifierOrLaTeX(): boolean {
    return (
      this.tok.type === TokenType.Identifier ||
      this.tok.type === TokenType.LatexEscape
    );
  }

  private assert(value: unknown, message: string): asserts value {
    if (!value) {
      this.die(message);
    }
  }

  private assertId(v: string): void {
    this.assert(this.isId(v), `Expected \`${v}\``);
  }
  private assertP(v: string): void {
    this.assert(this.isP(v), `Expected \`${v}\``);
  }

  private eof(): boolean {
    return this.tok.isEof();
  }

  private resolved(tok: Token): string {
    return tok.type === TokenType.LatexEscape ? resolveLatex(tok) : tok.value;
  }

  // ---- Balanced skip helpers ----

  private skipBalancedBrackets(open: "(", close: ")"): Token[];
  private skipBalancedBrackets(open: "{", close: "}"): Token[];
  private skipBalancedBrackets(open: "[", close: "]"): Token[];
  private skipBalancedBrackets(open: "[:", close: ":]"): Token[];
  private skipBalancedBrackets(open: string, close: string): Token[] {
    this.assertP(open);
    const openTok = this.adv(); // consume open
    const skipped = this.skipBalancedTokensUntilPunct([close], false);
    this.assertP(close);
    const closeTok = this.adv();
    return [openTok, ...skipped, closeTok];
  }
  private skipBalancedAngles(): Token[] {
    this.assertP("<");
    const openTok = this.adv(); // consume <
    const skipped = this.skipBalancedTokensUntilPunct([">"], true);
    const closeTok = this.adv(); // consume >
    return [openTok, ...skipped, closeTok];
  }

  private skipBalancedTokensUntilPunct(
    untilPuncts: string[],
    considerUnparenedAngle: boolean,
  ): Token[] {
    const tokens: Token[] = [];
    let depth = 0;
    let parenDepth = 0;
    while (!this.eof()) {
      const token = this.tok;
      const v = token.value;
      if (
        depth === 0 &&
        token.type === TokenType.Punct &&
        untilPuncts.includes(v)
      ) {
        break;
      }
      const open =
        parenDepth === 0 && considerUnparenedAngle
          ? ["(", "{", "[", "[:", "<"]
          : ["(", "{", "[", "[:"];
      tokens.push(token);
      this.adv();
      if (open.includes(v)) {
        depth++;
        if (v === "(") {
          parenDepth++;
        }
        continue;
      }
      const close =
        parenDepth === 0 && considerUnparenedAngle
          ? [")", "}", "]", ":]", ">"]
          : [")", "}", "]", ":]"];
      if (close.includes(v)) {
        depth--;
        if (v === ")") {
          parenDepth--;
        }
      }
    }
    return tokens;
  }

  private parseTemplateParams(): TemplateParameterInfo[] {
    this.assertP("<");
    this.adv(); // <
    const parameters: TemplateParameterInfo[] = [];
    // LOOSE PARSE: here might be a:
    // - type template parameter:
    //   `class|typename|<constraint> [...|<id> [= <typeid>]]`
    //   which: <constraints> cannot be disambiguate from NTTP without sema
    // - template template parameter:
    //   `template <parameters> [concept|class|typename|auto] [...|<id> [= <typeid>]]`
    // - NTTP: a parameter declaration
    // damn its too complex and we should skip!
    while (true) {
      const startLoc = this.tok.loc;
      this.skipBalancedTokensUntilPunct([",", ">"], true);
      const endLoc = this.tok.loc;
      parameters.push({ raw: this.lexer.range(startLoc, endLoc) });
      if (this.isP(">")) {
        this.adv();
        break;
      }
      this.assertP(",");
      this.adv();
    }
    return parameters;
  }

  private parseTemplateArgs(): TemplateArgumentInfo[] {
    this.assertP("<");
    this.adv(); // <
    const args: TemplateArgumentInfo[] = [];
    // LOOSE PARSE: same as template parameter, we cannot figure out
    // its detailed structure (should be a type-id, template-id, or constant expression?)
    while (true) {
      const startLoc = this.tok.loc;
      this.skipBalancedTokensUntilPunct([",", ">"], true);
      const endLoc = this.tok.loc;
      args.push({ raw: this.lexer.range(startLoc, endLoc) });
      if (this.isP(">")) {
        this.adv();
        break;
      }
      this.assertP(",");
      this.adv();
    }
    return args;
  }

  private isAttribute(): boolean {
    return this.isId("alignas") || (this.isP("[") && this.nextTok().isP("["));
  }

  private tryParseAttribute(): AttributeInfo[] {
    const attributes: AttributeInfo[] = [];
    while (this.isAttribute()) {
      if (this.isId("alignas")) {
        const startLoc = this.tok.loc;
        this.adv(); // alignas
        this.assertP("(");
        // LOOSE PARSE: parseExpression
        this.skipBalancedBrackets("(", ")");
        attributes.push({ raw: this.lexer.range(startLoc, this.tok.loc) });
      } else {
        const startLoc = this.tok.loc;
        this.skipBalancedBrackets("[", "]");
        attributes.push({ raw: this.lexer.range(startLoc, this.tok.loc) });
      }
    }
    return attributes;
  }

  private die(msg: string): never {
    const line = this.lexer.lines[this.tok.loc.line - 1] || "";
    throw new Error(
      `${this.filename}:${this.tok.loc.line}:${this.tok.loc.col}: ${line}\n    ${msg} at token \`${this.tok.value}\` ...`,
    );
  }
  private unimplemented(name?: string): never {
    this.die(`Unimplemented parser feature ${name || ""}`);
  }

  // ---- Top-level ----

  parseTopLevel(): void {
    while (!this.eof()) {
      if (this.tok.type === TokenType.Identifier) {
        switch (this.tok.value) {
          case "module":
          case "import": {
            this.die(`module declarations not supported`);
          }
          case "export": {
            if (this.lexer.peek().value === "import") {
              this.die(`module declarations not supported`);
            }
          }
        }
      }
      this.parseExternalDeclaration();
    }
  }

  // ---- Declaration ----

  private parseExternalDeclaration(): void {
    const startLoc = this.tok.loc;
    this.tryParseAttribute();
    if (this.isP(";")) {
      this.adv();
      return;
    }
    if (this.isId("extern")) {
      const nextTok = this.nextTok();
      if (nextTok.type === TokenType.StringLiteral) {
        return this.parseLinkage({ startLoc });
      }
    }
    if (this.isId("export")) {
      return this.parseExportDeclaration({ startLoc });
    }
    return this.parseDeclaration({ startLoc, scopeClassName: null });
  }

  private parseDeclaration({
    startLoc,
    scopeClassName,
  }: {
    startLoc: Location;
    scopeClassName: string | null;
  }): void {
    // template
    if (this.isId("template")) {
      const nextTok = this.nextTok();
      if (!nextTok.isP("<")) {
        // explicit instantiation e.g.
        // template void f<int>();
        this.unimplemented("explicit instantiation");
      }
      return this.parseTemplateDeclarationOrSpecialization({
        startLoc,
        scopeClassName,
      });
    }

    // [inline] namespace
    if (this.isId("namespace")) {
      return this.parseNamespace({ inline: false });
    }
    if (this.isId("inline")) {
      const nextTok = this.nextTok();
      if (nextTok.isId("namespace")) {
        return this.parseNamespace({ inline: true });
      }
    }
    if (this.isId("using")) {
      return this.parseUsingDirectiveOrDeclaration({
        startLoc,
        templateInfo: null,
      });
    }
    if (this.isId("static_assert")) {
      this.unimplemented("static_assert");
    }
    return this.parseSimpleDeclarationOrFunctionDefinition({
      startLoc,
      templateInfo: null,
      scopeClassName,
    });
  }

  private parseLinkage({}: { startLoc: Location }) {
    this.unimplemented("linkage specification");
  }

  private parseExportDeclaration({}: { startLoc: Location }) {
    this.unimplemented("export declaration");
  }

  /**
   * ```
   * simple-declaration:
   *     [decl-specifier-seq] [init-declarator-list] ;
   * function-definition:
   *     [decl-specifier-seq] declarator [some-stupid-grammar-here] function-body
   * ```
   */
  private parseSimpleDeclarationOrFunctionDefinition({
    startLoc,
    scopeClassName,
    templateInfo,
  }: {
    startLoc: Location;
    scopeClassName: string | null;
    templateInfo: TemplateInfo | null;
  }): void {
    const declSpecifier = this.parseDeclarationSpecifiers({
      declStartLoc: startLoc,
      templateInfo,
      scopeClassName,
      declSpecContextType: DeclSpecContextType.TopLevel,
    });

    let declarators: DeclaratorInfo[] = [];

    if (!this.isP(";")) {
      declarators = this.parseDeclaratorList({ declSpecifier });
    }
    this.adv(); // ;
    const { classSpecifier } = declSpecifier;
    if (classSpecifier && classSpecifier.useKind !== "reference") {
      if (classSpecifier.tagKind === "union") {
        this.assert(!templateInfo, "union cannot be template");
        this.emitSymbol("union", {
          name: classSpecifier.name,
          raw: classSpecifier.raw + ";",
        });
      } else if (templateInfo) {
        if (templateInfo.fullSpecialization) {
          this.assert(
            classSpecifier.templateArgs,
            "full specialization must have template args",
          );
          this.emitSymbol("fullTemplateSpecialization", {
            name: classSpecifier.name,
            raw: this.lexer.range(startLoc, this.tok.loc),
            templateArgs: classSpecifier.templateArgs.map((a) => a.raw),
          });
        } else if (classSpecifier.templateArgs) {
          this.emitSymbol("partialTemplateSpecialization", {
            name: classSpecifier.name,
            raw: this.lexer.range(startLoc, this.tok.loc),
            templateParams: templateInfo.templateParameters.map((p) => p.raw),
            templateArgs: classSpecifier.templateArgs.map((a) => a.raw),
          });
        } else {
          this.emitSymbol("classTemplate", {
            name: classSpecifier.name,
            raw: this.lexer.range(startLoc, this.tok.loc),
            templateParams: templateInfo.templateParameters.map((p) => p.raw),
          });
        }
      } else {
        this.emitSymbol("class", {
          name: classSpecifier.name,
          raw: classSpecifier.raw + ";",
        });
      }
    }
  }

  private parseDeclarationSpecifiers({
    declStartLoc,
    templateInfo,
    scopeClassName,
    declSpecContextType,
  }: {
    declStartLoc: Location;
    templateInfo: TemplateInfo | null;
    scopeClassName: string | null;
    declSpecContextType: DeclSpecContextType;
  }): DeclarationSpecifierInfo {
    // decl-specifier* attr-specifier*
    let classSpecifier: ClassSpecifierInfo | null = null;
    const typeSpecifiers: string[] = [];
    const cvQualifiers = {
      const: false,
      volatile: false,
    };
    const declSpecifiers: DeclSpecifierKeyword[] = [];
    let explicit: boolean | ExpressionInfo = false;

    const readIdExprAsType = (): { isCtor: boolean } => {
      // We hits an id-expression while parsing decl-specifier.
      // It might be the declarator of ctor declaration which is not a type-specifier
      const isCtor = this.isCtorDeclaration({
        scopeClassName,
        declSpecContextType,
      });
      if (!isCtor) {
        const idExpression = this.readIdExpression();
        typeSpecifiers.push(idExpression.name);
      }
      return { isCtor };
    };

    while (true) {
      if (this.isP("[") && this.nextTok().isP("[")) {
        // attribute-specifier should marks end of decl-specifiers
        break;
      } else if (
        // read a scoped/escaped id-expr as type-id
        // only if no type has been specified
        typeSpecifiers.length === 0 &&
        (this.isP("::") || this.tok.type === TokenType.LatexEscape)
      ) {
        const { isCtor } = readIdExprAsType();
        if (isCtor) {
          break;
        }
      }
      if (this.tok.type !== TokenType.Identifier) {
        break;
      }
      const id = this.tok.value;
      if (id === "decltype") {
        // decltype(...)
        this.unimplemented("decltype in decl-specifier");
      } else if ((DECL_SPECIFIER_KEYWORD as readonly string[]).includes(id)) {
        declSpecifiers.push(id as DeclSpecifierKeyword);
        this.adv();
        if (id === "explicit" && this.isP("(")) {
          // explicit(bool)
          this.adv(); // (
          const startLoc = this.tok.loc;
          this.skipBalancedTokensUntilPunct([")"], false);
          this.adv(); // )
          const endLoc = this.tok.loc;
          explicit = { raw: this.lexer.range(startLoc, endLoc) };
        }
        continue;
      } else if (TYPE_SPECIFIER_KEYWORD.includes(id)) {
        typeSpecifiers.push(id);
        this.adv();
        continue;
      } else if (id === "auto") {
        this.unimplemented("auto");
      } else if (CLASS_SPECIFIER_KEYWORD.includes(id)) {
        classSpecifier = this.parseClassSpecifier({
          previousSpecifiers: [...declSpecifiers],
          declStartLoc,
          templateInfo,
          declSpecContextType,
        });
      } else if (id === "enum") {
        // enum E e;     // elaborated-type-specifier
        // enum E { } e; // enum-specifier
        this.unimplemented("enum-head");
      } else if (id === "const" || id === "volatile") {
        cvQualifiers[id] = true;
        this.adv();
      } else if (id === "typename") {
        this.unimplemented("typename disambiguation");
      } else if (typeSpecifiers.length === 0) {
        const { isCtor } = readIdExprAsType();
        if (isCtor) {
          break;
        }
      } else {
        // start of declarator, stop
        break;
      }
    }
    this.tryParseAttribute();
    return {
      typeSpecifiers,
      cvQualifiers,
      declSpecifiers,
      explicitSpecifier: explicit,
      classSpecifier,
    };
  }

  private parseDeclaratorList({
    declSpecifier,
  }: {
    declSpecifier: DeclarationSpecifierInfo;
  }): DeclaratorInfo[] {
    this.unimplemented("declarator");
  }

  // ---- Namespace ----

  private parseNamespace({ inline }: { inline: boolean }) {
    if (inline) {
      this.assertId("inline");
      this.adv(); // "inline"
    }
    this.assertId("namespace");
    this.adv(); // "namespace"

    this.tryParseAttribute();

    let name = "";
    while (this.isIdentifierOrLaTeX()) {
      name += this.resolved(this.tok);
      this.adv();
      if (this.isP("::")) {
        name += "::";
        this.adv();
        // namespace X::inline Y { ... }
        if (this.isId("inline")) {
          this.adv();
        }
      } else {
        break;
      }
    }

    // namespace X = Y;
    if (this.isP("=")) {
      this.unimplemented("namespace alias");
    }

    // namespace { ... }
    if (!name) {
      this.unimplemented("anonymous namespaces");
    }

    this.assertP("{");
    this.adv(); // {

    this.context = produce(this.context, (ctx) => {
      ctx.nsStack.push(name);
    });

    while (!this.isP("}")) {
      this.parseExternalDeclaration();
    }
    this.context = produce(this.context, (ctx) => {
      ctx.nsStack.pop();
    });
    this.adv(); // }
  }

  // ---- Using ----

  private parseUsingDirectiveOrDeclaration({
    templateInfo,
    startLoc,
  }: {
    templateInfo: TemplateInfo | null;
    startLoc: Location;
  }): void {
    this.assertId("using");
    this.adv(); // "using"

    // using namespace X;
    if (this.isId("namespace")) {
      return this.parseUsingDirective();
    }

    return this.parseUsingDeclaration({ templateInfo, startLoc });
  }

  private parseUsingDirective(): void {
    this.assertId("namespace");
    this.unimplemented("using-directive");
  }

  private parseUsingDeclaration({
    templateInfo,
    startLoc,
  }: {
    templateInfo: TemplateInfo | null;
    startLoc: Location;
  }) {
    // using typename X::Y;
    if (this.isId("typename")) {
      this.adv();
    }

    if (this.isId("enum")) {
      this.unimplemented("using-enum-declaration");
    }

    let idExpr = this.readIdExpression();

    // using X = Y;
    if (this.isP("=")) {
      const { name, parts } = idExpr;
      this.assert(
        parts.length === 1 && parts[0].kind === IdPartKind.Identifier,
        `Name introduced by using-alias-declaration should be identifier`,
      );
      this.adv();
      this.skipBalancedTokensUntilPunct([",", ";"], true);
      if (this.isP(";")) this.adv();
      if (templateInfo) {
        this.emitSymbol("typeAliasTemplate", {
          name,
          raw: this.lexer.range(startLoc, this.tok.loc),
          syntax: "using",
          templateParams: templateInfo.templateParameters.map((p) => p.raw),
        });
      } else {
        this.emitSymbol("typeAlias", {
          name,
          raw: this.lexer.range(startLoc, this.tok.loc),
          syntax: "using",
        });
      }
      return;
    }

    // using X::Y, Z::W;
    while (true) {
      const { name, parts } = idExpr;
      this.emitSymbol("usingDeclaration", {
        name: parts.at(-1)!.name,
        raw: this.lexer.range(startLoc, this.tok.loc),
        target: name,
      });
      if (this.isP(";")) {
        this.adv();
        break;
      }
      this.assertP(",");
      this.adv();
      idExpr = this.readIdExpression();
    }
  }

  // ---- Template ----

  private parseTemplateDeclarationOrSpecialization({
    startLoc,
    scopeClassName,
  }: {
    startLoc: Location;
    scopeClassName: string | null;
  }): void {
    const templateParameters = [];
    let requiresClause: string | null = null;
    this.assertId("template");
    // there might be multiple template header...
    // we just keep the code structure but do not touch it now
    //   template<typename T>
    //     template<typename U>
    //       class A<T>::B { ... };
    let fullSpecialization = false;
    while (this.isId("template")) {
      this.adv(); // template
      const params = this.parseTemplateParams();
      if (params.length === 0) {
        fullSpecialization = true;
      }
      templateParameters.push(...params);
      if (this.isId("requires")) {
        this.adv(); // requires
        const startLoc = this.tok.loc;
        this.parseConstraintExpression();
        const endLoc = this.tok.loc;
        requiresClause = this.lexer.range(startLoc, endLoc);
      }
    }
    const templateInfo: TemplateInfo = {
      fullSpecialization: fullSpecialization,
      templateParameters,
      requiresClause,
    };
    if (this.isId("concept")) {
      return this.parseConcept({ templateInfo, startLoc });
    }
    return this.parseDeclarationAfterTemplate({
      startLoc,
      templateInfo,
      scopeClassName,
    });
  }

  private parseDeclarationAfterTemplate({
    startLoc,
    templateInfo,
    scopeClassName,
  }: {
    startLoc: Location;
    templateInfo: TemplateInfo;
    scopeClassName: string | null;
  }): void {
    // TODO if we are in member context, dispatch to a member declaration

    this.tryParseAttribute();

    if (this.isId("using")) {
      // template <...> using T = ...;
      return this.parseUsingDirectiveOrDeclaration({ startLoc, templateInfo });
    }

    return this.parseSimpleDeclarationOrFunctionDefinition({
      startLoc,
      templateInfo,
      scopeClassName,
    });
  }

  // ---- Class / struct / union ----

  private parseClassSpecifier({
    previousSpecifiers,
    templateInfo,
    declSpecContextType,
  }: {
    previousSpecifiers: readonly DeclSpecifierKeyword[];
    declStartLoc: Location;
    templateInfo: TemplateInfo | null;
    declSpecContextType: DeclSpecContextType;
  }): ClassSpecifierInfo {
    const startLoc = this.tok.loc;
    const tagKind = this.tok.value as ClassTagKind;
    this.adv(); // class|struct|union

    let useKind: ClassSpecifierUseKind = "reference";
    this.tryParseAttribute();
    const idExpr = this.readIdExpression();

    // friend class A, class B;
    // friend class Ts...;
    if (
      previousSpecifiers[0] === "friend" &&
      (this.isP(",") || this.isP("..."))
    ) {
      this.unimplemented("friend-type-declaration");
    }

    if (this.tok.isId("final")) {
      this.adv(); // final
    }

    if (this.tok.isP(":")) {
      this.adv();
      while (true) {
        this.tryParseAttribute();
        // access-specifier or virtual
        if (
          this.tok.type === TokenType.Identifier &&
          ["public", "protected", "private", "virtual"].includes(this.tok.value)
        ) {
          this.adv();
        }
        this.readIdExpression(); // class-or-decltype
        if (!this.isP(",")) {
          break;
        }
      }
      if (this.isP("...")) {
        this.adv(); // ...
      }
    }

    const mayDeclare =
      [DeclSpecContextType.TopLevel, DeclSpecContextType.Class].includes(
        declSpecContextType,
      ) && !previousSpecifiers.includes("friend");

    const templateArgs = idExpr.parts.at(-1)?.templateArgs ?? null;
    if (mayDeclare && !templateArgs) {
      this.assert(
        idExpr.parts.length === 1 &&
          idExpr.parts[0].kind === IdPartKind.Identifier,
        "Name of class declaration or definition should be a simple identifier",
      );
    }

    if (mayDeclare && this.tok.isP("{")) {
      this.skipBalancedBrackets("{", "}");
      useKind = "definition";
    }
    if (mayDeclare && this.tok.isP(";")) {
      useKind = "declaration";
    }

    const endLoc = this.tok.loc;
    const raw = this.lexer.range(startLoc, endLoc);
    return {
      tagKind,
      name: this.nameWithoutTemplateArg(idExpr),
      templateArgs,
      useKind,
      raw,
    };
  }

  // ---- Enum ----

  private parseEnum(): void {
    this.unimplemented("enum");
  }

  // ---- Concept ----

  private parseConcept({
    startLoc,
    templateInfo,
  }: {
    startLoc: Location;
    templateInfo: TemplateInfo;
  }): void {
    this.assertId("concept");
    this.adv(); // concept
    const name = this.readIdent();
    this.tryParseAttribute();

    this.assertP("=");
    this.adv(); // =
    this.parseConstraintExpression();
    this.assertP(";");
    this.adv(); // ;
    this.emitSymbol("concept", {
      name,
      raw: this.lexer.range(startLoc, this.tok.loc),
      templateParams: templateInfo.templateParameters.map((p) => p.raw),
    });
  }

  // ---- Expression ----

  private parseConstraintExpression(): void {
    // LOOSE PARSE: only consider:
    // - requires expression: requires (parameter-list) { requirement-seq }
    // - id-expression (single concept)
    // - balanced tokens start with '(' (assumes conjunction/disjunction are parenthesized)
    if (this.isId("requires")) {
      this.adv(); // requires
      if (this.isP("(")) {
        this.skipBalancedBrackets("(", ")");
      }
      this.assertP("{");
      this.skipBalancedBrackets("{", "}");
    } else if (this.isP("(")) {
      this.skipBalancedBrackets("(", ")");
    } else {
      this.readIdExpression();
    }
  }

  // ---- Helpers ----

  private readIdent(): string {
    if (this.isIdentifierOrLaTeX()) {
      const v = resolveLatex(this.tok);
      this.adv();
      return v;
    }
    this.die("Expected identifier");
  }

  private tryReadIdExpression(): IdExpressionInfo | null {
    try {
      using transaction = this.createRevertTransaction();
      const idExpr = this.readIdExpression();
      transaction.commit();
      return idExpr;
    } catch {
      return null;
    }
  }

  /**
   * Reads an `id-expression`. Might be:
   * - unqualified-id (e.g. `foo`, `operator+`, `A<B>`)
   * - qualified-id (e.g. `A::B`, `A::operator+`, `A::template B<C>`)
   * - computed-id (e.g. `decltype(foo)::bar`, `[:M:]::baz`, `A...[I]`)
   * @returns
   */
  private readIdExpression(): IdExpressionInfo {
    const parts: IdExpressionPartInfo[] = [];
    const fromGlobal = this.isP("::");
    let name = "";
    do {
      let hasTemplateDisambiguation = false;
      if (this.isP("::")) {
        this.adv();
        name += "::";
        if (this.isId("template")) {
          // A::template B<...>
          hasTemplateDisambiguation = true;
          this.adv();
        }
      }
      const part = this.readIdExpressionPart(hasTemplateDisambiguation);
      parts.push(part);
      name += part.name;
      if (
        part.kind !== IdPartKind.Identifier &&
        part.kind !== IdPartKind.Computed
      ) {
        break;
      }
    } while (this.isP("::"));
    return { name, fromGlobal, parts };
  }

  private readIdExpressionPart(
    hasTemplateDisambiguation: boolean,
  ): IdExpressionPartInfo {
    let name = hasTemplateDisambiguation ? "template " : "";
    let componentName: string | null = null;
    let kind: IdPartKind;
    let templateArgs: TemplateArgumentInfo[] | null = null;
    if (this.isId("decltype")) {
      this.adv();
      const startLoc = this.tok.loc;
      this.skipBalancedBrackets("(", ")");
      const endLoc = this.tok.loc;
      name += "decltype(" + this.lexer.range(startLoc, endLoc) + ")";
      kind = IdPartKind.Computed;
    } else if (this.isId("typename") || this.isId("template")) {
      name += this.tok.value + " ";
      this.adv();
      this.skipBalancedBrackets("[:", ":]");
      kind = IdPartKind.Computed;
    } else if (this.isP("~")) {
      name += "~";
      this.adv();
      this.unimplemented("destructor name parsing");
    } else if (this.isId("operator")) {
      name += "operator";
      this.adv();
      this.unimplemented(
        "operator-function, conversion-function or literal-operator name parsing",
      );
    } else if (this.isIdentifierOrLaTeX()) {
      componentName = this.resolved(this.tok);
      name += componentName;
      this.adv();
      kind = IdPartKind.Identifier;
    } else {
      this.die(`Unexpected token: ${this.tok.value}`);
    }
    // pack-index-expression
    if (this.isP("...") && this.nextTok().isP("[")) {
      const startLoc = this.tok.loc;
      this.adv(); // ...
      this.skipBalancedBrackets("[", "]");
      const endLoc = this.tok.loc;
      name += this.lexer.range(startLoc, endLoc);
      componentName = null;
      kind = IdPartKind.Computed;
    }
    // simple-template-id
    if (this.isP("<")) {
      const startLoc = this.tok.loc;
      templateArgs = this.parseTemplateArgs();
      const endLoc = this.tok.loc;
      name += this.lexer.range(startLoc, endLoc);
    }
    return { kind, name, componentName, templateArgs };
  }

  /** Used for specialization declarations */
  private nameWithoutTemplateArg(idExpr: IdExpressionInfo): string {
    const copy = [...idExpr.parts];
    const lastPart = copy.pop();
    this.assert(
      lastPart?.componentName,
      `Cannot call nameWithoutTemplateArg on a computed type-id`,
    );
    return `${idExpr.fromGlobal ? "::" : ""}${copy.map((p) => p.name + "::").join("")}${lastPart.componentName}`;
  }

  private isCtorDeclaration({
    scopeClassName,
    declSpecContextType,
  }: {
    scopeClassName: string | null;
    declSpecContextType: DeclSpecContextType;
  }): boolean {
    using _transaction = this.createRevertTransaction();
    const idExpr = this.readIdExpression();
    const lastPart = idExpr.parts.at(-1);
    this.assert(lastPart, "id-expression should have at least one part");
    if (lastPart.kind !== IdPartKind.Identifier) {
      // dtor
      return false;
    }
    if (lastPart.templateArgs) {
      // per C++20, ctor name cannot be template-id
      return false;
    }

    const mayInLineCtor =
      declSpecContextType === DeclSpecContextType.Class &&
      lastPart.name === scopeClassName;
    // comparing
    // `idExpr.parts.at(-2)?.componentName === lastPart.name`
    // is not a good idea since `using B = A;` can make ctor
    // declarations like `B::A()` valid
    const mayOutLineCtor =
      declSpecContextType === DeclSpecContextType.TopLevel &&
      idExpr.parts.length > 1;

    if (!mayInLineCtor && !mayOutLineCtor) {
      return false;
    }

    this.tryParseAttribute();
    if (!this.isP("(")) {
      return false;
    }
    this.adv(); // (
    if (this.isP(")")) {
      return true;
    } else if (this.isP("...")) {
      this.adv();
      // parameter-pack won't appear in TopLevel/Member decl-specifier)
      // so the ellipsis can only be end of variadic function
      this.assertP(")");
      return true;
    } else if (this.isP("[")) {
      this.adv();
      // must be attribute of parameter declaration
      this.assertP("[");
      return true;
    } else if (
      this.tok.type === TokenType.Identifier &&
      [
        ...DECL_SPECIFIER_KEYWORD,
        ...TYPE_SPECIFIER_KEYWORD,
        ...CLASS_SPECIFIER_KEYWORD,
        "auto",
        "decltype",
        "enum",
        "typename",
        "const",
        "volatile",
      ].includes(this.tok.value)
    ) {
      return true;
    } else if (this.isP("*") || this.isP("&") || this.isP("&&")) {
      // ptr-declarator
      return false;
    }
    const exprInfo = this.tryReadIdExpression();
    if (!exprInfo) {
      // must be a ptr-to-member declarator
      // e.g. `C (D::* p);`
      //          ^ we are here
      this.assert(
        this.isIdentifierOrLaTeX(),
        "Expected identifier in ptr-to-member declarator",
      );
      return false;
    }
    // already read another id-expression `T`, if we see
    // - identifier : e.g. C(T v);
    // - decl-spec  : e.g. C(T const& v);
    // - *          : e.g. C(T* v);
    // - &          : e.g. C(T& v);
    // - &&         : e.g. C(T&& v);
    // - ,          : e.g. C(T, int);
    // - ...        : e.g. C(T...);
    // then it must be a ctor declaration, otherwise we cannot disambiguate AT ALL.
    this.tryParseAttribute();
    if (
      this.isIdentifierOrLaTeX() ||
      (this.tok.type === TokenType.Punct &&
        ["*", "&", "&&", ",", "..."].includes(this.tok.value)) ||
      (this.isP("(") && declSpecContextType === DeclSpecContextType.Class)
    ) {
      return true;
    }
    this.die(
      `Disambiguate failure: cannot determine whether current declaration is a constructor`,
    );
  }

  private createRevertTransaction() {
    const currentLexer = this.lexer.clone();
    const currentContext = this.context;
    const self = this;
    return new (class Transaction {
      #settled = false;
      commit() {
        this.#settled = true;
      }
      revert() {
        self.lexer = currentLexer;
        self.context = currentContext;
        this.#settled = true;
      }
      [Symbol.dispose]() {
        if (!this.#settled) {
          this.revert();
        }
      }
    })();
  }

  private emitSymbol<Kind extends SymbolKind>(
    kind: Kind,
    info: Omit<
      ExtractKind<SymbolEntry, Kind>,
      Exclude<keyof SymbolEntryBase, "raw" | "name"> | "kind"
    >,
  ): void {
    const symbol = {
      kind,
      ...info,
      header: this.filename,
      namespace: this.context.nsStack.join("::"),
      // indicates a CPO
      // TODO inlineUnspecifiedNamespace
      // TODO languageLinkage
    } as SymbolEntry;
    console.log(symbol);
    this.context = produce(this.context, (ctx) => {
      ctx.symbols.push(symbol);
    });
  }

  get symbols() {
    return this.context.symbols;
  }
}
