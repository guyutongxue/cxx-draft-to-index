import type {
  ClassMemberEntry,
  EnumeratorEntry,
  ExtractKind,
  NamespaceInfo,
  SymbolEntry,
  SymbolEntryBase,
  SymbolKind,
  Template,
  TemplateParameter,
} from "../types";
import { resolveLatex } from "./latex";
import { Lexer, Location, Punctuation, Token, TokenType } from "./lexer";
import { produce } from "immer";

interface ParserContext {
  readonly linkageStack: readonly string[];
  readonly nsStack: readonly NamespaceInfo[];
}

interface AttributeInfo {
  raw: string;
}

interface TemplateParameterInfo {
  kind: "constant" | "type" | "template";
  name: string | null;
  pack: boolean;
  defaultArg: string | null;
  raw: string;
  typeInfo: string | null;
}

interface ParameterInfo {
  raw: string;
  declSpecifier: DeclarationSpecifierInfo;
  name: string | null;
  pack: boolean;
  defaultArg: ExpressionInfo | null;
  typeInfo: string;
}

interface PlainTemplateInfo {
  fullSpecialization: boolean;
  templateParameters: TemplateParameterInfo[];
  requiresClause: string | null;
}
// include outer template head, e.g.
// template <typename T>     // <- nested: [{...}]
//    template <typename U>
// class A<T>::B { ... }
interface TemplateInfo extends PlainTemplateInfo {
  nested: PlainTemplateInfo[]; // from outer to inner
}

enum DeclarationContextType {
  Unknown = "unknown",
  Class = "class",
  TopLevel = "topLevel",
  Trailing = "trailing",
  Parameter = "parameter",
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

type VertSpecifierKw = "override" | "final";

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
  PointerToMember, // T::*
}

interface TemplateArgumentInfo {
  raw: string;
}

interface IdExpressionPartInfo {
  kind: IdPartKind;
  /* The "printed" name */
  name: string;
  /**
   * - For Identifier, the name without template args
   * - For Operator, the operator token's value
   * - For UDL, the UDL suffix
   * - For Conversion, the type-id in conversion function
   * - For Destructor, the class name
   * - Otherwise, null
   */
  value: string | null;
  templateArgs: TemplateArgumentInfo[] | null;
  // The code is using @\libconcept{blah}@, indicate this is a concept-name
  conceptName: boolean;
}

/**
 * A parsing result of id-expression or type-id.
 * For id-expression, the last part should not be Computed
 */
interface IdExpressionInfo {
  name: string;
  fromGlobal: boolean;
  parts: IdExpressionPartInfo[];
}

type ClassTagKind = "class" | "struct" | "union";
type ClassSpecifierUseKind =
  | "definition"
  | "declaration"
  | "reference"
  | "friendType";

interface BaseSpecifierInfo {
  raw: string;
  access: "public" | "protected" | "private" | null;
  virtual: boolean;
  typeId: IdExpressionInfo;
}

interface ClassSpecifierInfo {
  tagKind: ClassTagKind;
  id: IdExpressionInfo;
  baseSpecifiers: BaseSpecifierInfo[];
  /**
   * The last part of `id`'s templateArgs.
   * Indicate this specifier references-to or declares a specialization.
   */
  templateArgs: TemplateArgumentInfo[] | null;
  useKind: ClassSpecifierUseKind;
  raw: string;
  members: ClassMemberEntry[] | null;
}

interface EnumSpecifierInfo {
  scoped: boolean | "class" | "struct";
  id: IdExpressionInfo | null;
  baseType: string | null;
  enumerators: EnumeratorEntry[] | null;
}

interface CvQualifierSet {
  const: boolean;
  volatile: boolean;
}

interface DeclarationSpecifierInfo {
  raw: string;
  constraint: string | null;
  typeSpecifiers: string[];
  // cv-qualifiers type-specifiers|class-name|enum-name
  typeString: string;
  cvQualifiers: CvQualifierSet;
  declSpecifiers: DeclSpecifierKeyword[];
  explicitSpecifier: boolean | ExpressionInfo;
  classSpecifier: ClassSpecifierInfo | null;
  enumSpecifier: EnumSpecifierInfo | null;
}

interface DeclaratorInfo {
  pack: boolean;
  idExpr: IdExpressionInfo | null;
  // no declspec
  raw: string;
  /** type-id, e.g. `int (*) ()` */
  typeInfo: string;
  function: FunctionInfo | null;
}

interface InitDeclaratorInfo extends DeclaratorInfo {
  initializer: ExpressionInfo | null;
}

type SpecialFunctionBody = "pure" | "defaulted" | "deleted";

interface DeclaratorListInfo {
  declarators: InitDeclaratorInfo[];
  kind: "simple" | "functionDefinition" | "friendType" | "deductionGuide";
  specialFunctionBody: SpecialFunctionBody | null;
}

interface FunctionQualifierInfo {
  const: boolean;
  volatile: boolean;
  ref: "&" | "&&" | null;
  noexcept: boolean | ExpressionInfo;
}

interface ParameterListInfo {
  parameters: ParameterInfo[];
  variadic: boolean;
}

interface FunctionInfo extends ParameterListInfo {
  kind: "function";
  qualifiers: FunctionQualifierInfo;
  trailingReturnType: string | null;
  vertSpecifiers: VertSpecifierKw[];
  constraint: ExpressionInfo | null;
  contracts: { raw: string }[];
}

type DeclaratorSurrounding =
  | FunctionInfo
  | {
      kind: "array";
      size: string; // raw
    }
  | {
      kind: "*" | "&" | "&&" | "const" | "volatile";
    }
  | {
      kind: "pointerToMember";
      raw: string; // e.g. A::*
    };

interface PartialDeclaratorInfo {
  pack: boolean;
  idExpr: IdExpressionInfo | null;
  surrounding: DeclaratorSurrounding[];
}

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
      linkageStack: [],
      nsStack: [],
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

  private consumeId(v: string): Token {
    this.assertId(v);
    return this.adv();
  }

  private consumeP(v: Punctuation): Token {
    this.assertP(v);
    return this.adv();
  }

  private eof(): boolean {
    return this.tok.isEof();
  }

  private resolved(tok: Token): string {
    return tok.type === TokenType.LatexEscape ? resolveLatex(tok) : tok.value;
  }

  // MARK: ---- Balanced skip helpers ----

  private skipBalancedBrackets(open: "(", close: ")"): Token[];
  private skipBalancedBrackets(open: "{", close: "}"): Token[];
  private skipBalancedBrackets(open: "[", close: "]"): Token[];
  private skipBalancedBrackets(open: "[:", close: ":]"): Token[];
  private skipBalancedBrackets(open: Punctuation, close: Punctuation): Token[] {
    const openTok = this.consumeP(open);
    const skipped = this.skipBalancedTokensUntilPunct([close], false);
    const closeTok = this.consumeP(close);
    return [openTok, ...skipped, closeTok];
  }
  private skipBalancedAngles(): Token[] {
    const openTok = this.consumeP("<");
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

  private isAttribute(): boolean {
    return this.isId("alignas") || (this.isP("[") && this.nextTok().isP("["));
  }

  private tryParseAttribute(): AttributeInfo[] {
    const attributes: AttributeInfo[] = [];
    while (this.isAttribute()) {
      if (this.isId("alignas")) {
        const startLoc = this.tok.loc;
        this.consumeId("alignas");
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

  // MARK: ---- Top-level ----

  parseTopLevel(): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
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
      symbols.push(...this.parseExternalDeclaration());
    }
    return symbols;
  }

  // MARK: ---- Declaration ----

  private parseExternalDeclaration(): SymbolEntry[] {
    const startLoc = this.tok.loc;
    this.tryParseAttribute();
    if (this.isP(";")) {
      this.consumeP(";");
      return [];
    }
    if (this.isId("extern")) {
      const nextTok = this.nextTok();
      if (nextTok.type === TokenType.StringLiteral) {
        return this.parseLinkage();
      }
    }
    if (this.isId("export")) {
      return this.parseExportDeclaration();
    }
    return this.parseDeclaration({
      startLoc,
      contextType: DeclarationContextType.TopLevel,
      scopeClassName: null,
    });
  }

  private parseDeclaration({
    startLoc,
    contextType,
    scopeClassName,
  }: {
    startLoc: Location;
    contextType: DeclarationContextType;
    scopeClassName: string | null;
  }): SymbolEntry[] {
    // template
    if (this.isId("template") && !this.nextTok().isP("[:")) {
      const nextTok = this.nextTok();
      if (!nextTok.isP("<")) {
        // explicit instantiation e.g.
        // template void f<int>();
        this.unimplemented("explicit instantiation");
      }
      return this.parseTemplateDeclarationOrSpecialization({
        startLoc,
        contextType,
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
      // skip
      this.consumeId("static_assert");
      this.skipBalancedBrackets("(", ")");
      this.consumeP(";");
      return [];
    }
    return this.parseSimpleDeclarationOrFunctionDefinition({
      startLoc,
      templateInfo: null,
      contextType,
      scopeClassName,
    });
  }

  private parseLinkage(): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    this.consumeId("extern");
    this.assert(
      this.tok.type === TokenType.StringLiteral,
      "Expected string literal",
    );
    const linkage = this.tok.value.slice(1, -1);
    this.adv();
    this.context = produce(this.context, (ctx) => {
      ctx.linkageStack.push(linkage);
    });
    if (this.isP("{")) {
      while (!this.isP("}")) {
        symbols.push(...this.parseExternalDeclaration());
      }
      this.consumeP("}");
    } else {
      symbols.push(...this.parseExternalDeclaration());
    }
    this.context = produce(this.context, (ctx) => {
      ctx.linkageStack.pop();
    });
    return symbols;
  }

  private parseExportDeclaration(): SymbolEntry[] {
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
    contextType,
    scopeClassName,
    templateInfo,
  }: {
    startLoc: Location;
    contextType: DeclarationContextType;
    scopeClassName: string | null;
    templateInfo: TemplateInfo | null;
  }): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const declSpecifier = this.parseDeclarationSpecifiers({
      declStartLoc: startLoc,
      templateInfo,
      scopeClassName,
      contextType,
    });

    let declaratorList: DeclaratorListInfo | null = null;

    if (!this.isP(";")) {
      declaratorList = this.parseDeclaratorList({ declSpecifier });
    }
    if (declaratorList?.kind !== "functionDefinition") {
      this.consumeP(";");
    }
    const { classSpecifier, enumSpecifier } = declSpecifier;
    if (
      classSpecifier?.useKind === "declaration" ||
      classSpecifier?.useKind === "definition"
    ) {
      if (classSpecifier.tagKind === "union") {
        if (classSpecifier.id.parts.length !== 1) {
          console.warn(`(Re-)declaration of a union is not supported`);
        } else {
          symbols.push(
            this.buildSymbol("union", {
              name: classSpecifier.id.name,
              raw: classSpecifier.raw + ";",
              members: classSpecifier.members,
            }),
          );
        }
      } else if (templateInfo) {
        if (templateInfo.fullSpecialization) {
          this.assert(
            classSpecifier.templateArgs,
            "full specialization must have template args",
          );
          symbols.push(
            this.buildNestedSymbol(
              "classFullSpecialization",
              templateInfo,
              classSpecifier.id,
              {
                classKey: classSpecifier.tagKind,
                base: classSpecifier.baseSpecifiers.map((b) => b.raw),
                raw: this.lexer.range(startLoc, this.tok.loc),
                templateArgs: classSpecifier.templateArgs.map((a) => a.raw),
                members: classSpecifier.members,
              },
            ),
          );
        } else if (classSpecifier.templateArgs) {
          symbols.push(
            this.buildNestedSymbol(
              "classPartialSpecialization",
              templateInfo,
              classSpecifier.id,
              {
                classKey: classSpecifier.tagKind,
                base: classSpecifier.baseSpecifiers.map((b) => b.raw),
                raw: this.lexer.range(startLoc, this.tok.loc),
                templateArgs: classSpecifier.templateArgs.map((a) => a.raw),
                members: classSpecifier.members,
              },
            ),
          );
        } else {
          symbols.push(
            this.buildNestedSymbol(
              "classTemplate",
              templateInfo,
              classSpecifier.id,
              {
                classKey: classSpecifier.tagKind,
                base: classSpecifier.baseSpecifiers.map((b) => b.raw),
                raw: this.lexer.range(startLoc, this.tok.loc),
                members: classSpecifier.members,
              },
            ),
          );
        }
      } else {
        symbols.push(
          this.buildNestedSymbol("class", templateInfo, classSpecifier.id, {
            classKey: classSpecifier.tagKind,
            base: classSpecifier.baseSpecifiers.map((b) => b.raw),
            raw: classSpecifier.raw + ";",
            members: classSpecifier.members,
          }),
        );
      }
    }
    if (classSpecifier?.useKind === "friendType") {
      this.unimplemented("friend type declaration");
    }
    if (enumSpecifier?.id) {
      symbols.push(
        this.buildSymbol("enum", {
          name: enumSpecifier.id.name,
          raw: this.lexer.range(startLoc, this.tok.loc),
          scoped: !!enumSpecifier.scoped,
          enumerators: enumSpecifier.enumerators,
        }),
      );
    }
    if (!declaratorList) {
      return symbols;
    }
    for (const declarator of declaratorList.declarators) {
      const constexpr = declSpecifier.declSpecifiers.includes("constexpr");
      this.assert(declarator.idExpr, `Declarator must have an id-expression`);
      if (declarator.idExpr.parts.length !== 1) {
        console.warn(
          `(Re-)declaration of a scoped function or variable (or corresponding template or specialization) is not supported: ${declarator.idExpr.name}`,
        );
        continue;
      }
      const idLastPart = declarator.idExpr.parts.at(-1)!;
      const partialSpecialization = templateInfo && idLastPart.templateArgs;
      if (declarator.function) {
        let operator: string | null = null;
        switch (idLastPart.kind) {
          case IdPartKind.UDL:
          case IdPartKind.Operator:
          case IdPartKind.Conversion:
            operator = idLastPart.value;
            break;
        }
        const parameters = declarator.function.parameters.map((p) => ({
          raw: p.raw,
          name: p.name,
          type: p.typeInfo,
          defaultArg: p.defaultArg?.raw ?? null,
          pack: p.pack,
        }));
        const returnType =
          declarator.function.trailingReturnType ?? declSpecifier.typeString;
        const isTrailingReturnType = !!declarator.function.trailingReturnType;
        const explicit =
          typeof declSpecifier.explicitSpecifier === "boolean"
            ? declSpecifier.explicitSpecifier
            : declSpecifier.explicitSpecifier.raw;
        const variadic = declarator.function.variadic;
        const friend = declSpecifier.declSpecifiers.includes("friend");
        if (
          declSpecifier.typeSpecifiers.length === 0 &&
          declarator.function.trailingReturnType
        ) {
          // must be deduction guide e.g. C(T) -> C<T>
          if (templateInfo) {
            symbols.push(
              this.buildSymbol("deductionGuideTemplate", {
                name: declarator.idExpr.name,
                raw: this.lexer.range(startLoc, this.tok.loc),
                parameters,
                targetType: declarator.function.trailingReturnType,
                templateParams: this.buildTemplateParams(templateInfo),
                templateRequires: templateInfo.requiresClause,
              }),
            );
          } else {
            symbols.push(
              this.buildSymbol("deductionGuide", {
                name: declarator.idExpr.name,
                raw: this.lexer.range(startLoc, this.tok.loc),
                parameters,
                targetType: declarator.function.trailingReturnType,
              }),
            );
          }
          break;
        }
        if (templateInfo) {
          this.assert(
            declaratorList.declarators.length === 1,
            "Function template cannot have multiple declarators",
          );
          if (templateInfo.fullSpecialization) {
            this.assert(
              idLastPart.templateArgs,
              `full template specialization should have template args`,
            );
            symbols.push(
              this.buildSymbol("functionFullSpecialization", {
                name: this.nameWithoutTemplateArg(declarator.idExpr),
                raw: this.lexer.range(startLoc, this.tok.loc),
                templateArgs: idLastPart.templateArgs.map((a) => a.raw),
                operator,
                parameters,
                returnType,
                isTrailingReturnType,
                constexpr,
                explicit,
                friend,
                variadic,
                signatureRequires: declarator.function.constraint?.raw || null,
              }),
            );
          } else {
            if (partialSpecialization) {
              this.die(`Function template cannot be partial specialized`);
            }
            symbols.push(
              this.buildSymbol("functionTemplate", {
                name: declarator.idExpr.name,
                operator,
                parameters,
                raw: this.lexer.range(startLoc, this.tok.loc),
                returnType,
                isTrailingReturnType,
                constexpr,
                explicit,
                friend,
                variadic,
                templateParams: this.buildTemplateParams(templateInfo),
                templateRequires: templateInfo.requiresClause,
                signatureRequires: declarator.function.constraint?.raw || null,
              }),
            );
          }
          break;
        } else {
          symbols.push(
            this.buildSymbol("function", {
              name: declarator.idExpr.name,
              operator,
              parameters,
              raw: declSpecifier.raw + " " + declarator.raw + ";",
              returnType,
              isTrailingReturnType,
              constexpr,
              explicit,
              friend,
              variadic,
              signatureRequires: null,
            }),
          );
        }
      } else {
        const type = declarator.typeInfo;
        const constexpr = declSpecifier.declSpecifiers.includes("constexpr");
        const inline = declSpecifier.declSpecifiers.includes("inline");
        const extern =
          declSpecifier.declSpecifiers.includes("extern") ||
          (!inline && this.context.linkageStack.length > 0);
        const raw = this.lexer.range(startLoc, this.tok.loc);

        if (templateInfo) {
          this.assert(
            declaratorList.declarators.length === 1,
            "Variable template cannot have multiple declarators",
          );
          if (templateInfo.fullSpecialization) {
            this.assert(
              idLastPart.templateArgs,
              `full template specialization should have template args`,
            );
            symbols.push(
              this.buildSymbol("variableFullSpecialization", {
                name: this.nameWithoutTemplateArg(declarator.idExpr),
                templateArgs: idLastPart?.templateArgs.map((a) => a.raw),
                type,
                raw,
                constexpr,
                extern,
                inline,
              }),
            );
          } else if (partialSpecialization) {
            symbols.push(
              this.buildSymbol("variablePartialSpecialization", {
                name: this.nameWithoutTemplateArg(declarator.idExpr),
                templateParams: this.buildTemplateParams(templateInfo),
                templateArgs: partialSpecialization.map((a) => a.raw),
                raw,
                type,
                constexpr,
                extern,
                inline,
              }),
            );
          } else {
            symbols.push(
              this.buildSymbol("variableTemplate", {
                name: declarator.idExpr.name,
                type,
                raw,
                constexpr,
                extern,
                inline,
                templateParams: this.buildTemplateParams(templateInfo),
                templateRequires: templateInfo.requiresClause,
              }),
            );
          }
        } else {
          symbols.push(
            this.buildSymbol("variable", {
              name: declarator.idExpr.name,
              type,
              constexpr,
              extern,
              inline,
              raw: declSpecifier.raw + " " + declarator.raw + ";",
            }),
          );
        }
      }
    }
    return symbols;
  }

  private parseDeclarationSpecifiers({
    declStartLoc,
    templateInfo,
    scopeClassName,
    contextType,
  }: {
    declStartLoc: Location;
    templateInfo: TemplateInfo | null;
    scopeClassName: string | null;
    contextType: DeclarationContextType;
  }): DeclarationSpecifierInfo {
    const startLoc = this.tok.loc;
    // decl-specifier* attr-specifier*
    let classSpecifier: ClassSpecifierInfo | null = null;
    let enumSpecifier: EnumSpecifierInfo | null = null;
    let constraint: string | null = null;
    const typeSpecifiers: string[] = [];
    const cvQualifiers = {
      const: false,
      volatile: false,
    };
    const declSpecifiers: DeclSpecifierKeyword[] = [];
    let explicit: boolean | ExpressionInfo = false;

    const readIdExprAsType = (): { notAType: boolean } => {
      // We hits an id-expression while parsing decl-specifier.
      // It might be the declarator of ctor declaration which is not a type-specifier
      const notAType = this.isTypeSpecifierDisallowed({
        declSpecifiers: [...declSpecifiers],
        scopeClassName,
        contextType,
      });
      if (!notAType) {
        const idExpression = this.readIdExpression();
        if (idExpression.parts.at(-1)?.conceptName) {
          constraint = idExpression.name;
        } else {
          typeSpecifiers.push(idExpression.name);
        }
      }
      return { notAType };
    };

    while (true) {
      if (this.isP("[") && this.nextTok().isP("[")) {
        // attribute-specifier should marks end of decl-specifiers
        break;
      } else if (
        // read a scoped/escaped id-expr as type-id
        // only if no type has been specified
        typeSpecifiers.length === 0 &&
        (this.isP("::") ||
          this.isId("decltype") ||
          this.isP("[:") ||
          this.isP("template") || // template [: M :]<T>::A
          this.tok.type === TokenType.LatexEscape)
      ) {
        const { notAType } = readIdExprAsType();
        if (notAType) {
          break;
        }
      }
      if (this.tok.type !== TokenType.Identifier) {
        break;
      }
      const id = this.tok.value;
      if (id === "decltype") {
        const startLoc = this.tok.loc;
        this.consumeId("decltype");
        this.skipBalancedBrackets("(", ")");
        const endLoc = this.tok.loc;
        typeSpecifiers.push(this.lexer.range(startLoc, endLoc));
      } else if ((DECL_SPECIFIER_KEYWORD as readonly string[]).includes(id)) {
        declSpecifiers.push(id as DeclSpecifierKeyword);
        this.adv();
        if (id === "explicit" && this.isP("(")) {
          // explicit(bool)
          this.consumeP("(");
          const startLoc = this.tok.loc;
          this.skipBalancedTokensUntilPunct([")"], false);
          this.consumeP(")");
          const endLoc = this.tok.loc;
          explicit = { raw: this.lexer.range(startLoc, endLoc) };
        }
      } else if (TYPE_SPECIFIER_KEYWORD.includes(id)) {
        typeSpecifiers.push(id);
        this.adv();
      } else if (id === "auto") {
        this.assert(
          typeSpecifiers.length < 2,
          `in a decl-specifier, only "auto" and "Constraint auto" is allowed`,
        );
        typeSpecifiers.push("auto");
        this.adv();
        continue;
      } else if (CLASS_SPECIFIER_KEYWORD.includes(id)) {
        classSpecifier = this.parseClassSpecifier({
          previousSpecifiers: [...declSpecifiers],
          declStartLoc,
          contextType,
        });
      } else if (id === "enum") {
        enumSpecifier = this.parseEnumSpecifier();
      } else if (id === "const" || id === "volatile") {
        cvQualifiers[id] = true;
        this.adv();
      } else if (id === "typename") {
        // omit disambiguator `typename`, we don't care
        this.adv();
      } else if (typeSpecifiers.length === 0) {
        const { notAType } = readIdExprAsType();
        if (notAType) {
          break;
        }
      } else {
        // start of declarator, stop
        break;
      }
    }
    this.tryParseAttribute();
    const typeString = [
      ...(cvQualifiers.const ? ["const"] : []),
      ...(cvQualifiers.volatile ? ["volatile"] : []),
      ...(constraint ? [constraint] : []),
      ...typeSpecifiers,
      ...(classSpecifier ? [classSpecifier.id.name] : []),
      ...(enumSpecifier?.id ? [enumSpecifier.id.name] : []),
    ].join(" ");
    return {
      typeSpecifiers,
      typeString,
      cvQualifiers,
      declSpecifiers,
      explicitSpecifier: explicit,
      classSpecifier,
      enumSpecifier,
      constraint,
      raw: this.lexer.range(startLoc, this.tok.loc),
    };
  }

  private parseDeclaratorList({
    declSpecifier,
  }: {
    declSpecifier: DeclarationSpecifierInfo;
  }): DeclaratorListInfo {
    let declarators: InitDeclaratorInfo[] = [];
    let kind: DeclaratorListInfo["kind"] = "simple";
    let specialFunctionBody: SpecialFunctionBody | null = null;
    outermost: while (true) {
      // friend class A, class B;
      // friend class Ts...;
      if (
        declSpecifier.declSpecifiers[0] === "friend" &&
        (this.isP(",") || this.isP("..."))
      ) {
        this.unimplemented("rest friend-types");
      }
      const declarator = this.parseDeclarator({
        declSpecifier,
        abstract: false,
      });
      let initializer: ExpressionInfo | null = null;
      if (declarator.function) {
        if (this.isP("=")) {
          kind = "functionDefinition";
          this.consumeP("=");
          if (this.tok.type === TokenType.Number && this.tok.value === "0") {
            // pure virtual function
            specialFunctionBody = "pure";
          } else if (this.isId("default")) {
            this.consumeId("default");
            specialFunctionBody = "defaulted";
          } else {
            this.consumeId("delete");
            if (this.isP("(")) {
              this.skipBalancedBrackets("(", ")");
            }
            specialFunctionBody = "deleted";
          }
          break outermost;
        }
        let isTryBlock = false;
        if (this.isId("try")) {
          this.consumeId("try");
          isTryBlock = true;
        }
        if (this.isP(":")) {
          // SKIP ctor initializer list
          this.skipBalancedTokensUntilPunct(["{"], false);
        }
        if (this.isP("{")) {
          this.skipBalancedBrackets("{", "}");
          if (isTryBlock) {
            this.assertP("catch");
            while (this.isId("catch")) {
              this.consumeId("catch");
              this.skipBalancedBrackets("(", ")");
              this.skipBalancedBrackets("{", "}");
            }
          }
          kind = "functionDefinition";
          break outermost;
        }
      } else {
        if (this.isP("=")) {
          // int v = x;
          const startLoc = this.tok.loc;
          this.consumeP("=");
          // LOOSE PARSE skip initializer
          this.skipBalancedTokensUntilPunct([",", ";"], true);
          const endLoc = this.tok.loc;
          initializer = { raw: this.lexer.range(startLoc, endLoc) };
        } else if (this.isP("{")) {
          // int v{ x };
          const startLoc = this.tok.loc;
          this.skipBalancedBrackets("{", "}");
          const endLoc = this.tok.loc;
          initializer = { raw: this.lexer.range(startLoc, endLoc) };
        }
      }
      declarators.push({ ...declarator, initializer });
      if (this.isP(";")) {
        break;
      }
      this.consumeP(",");
    }
    return { declarators, kind, specialFunctionBody };
  }

  private parseDeclarator({
    declSpecifier,
    abstract,
  }: {
    declSpecifier: DeclarationSpecifierInfo;
    abstract: boolean;
  }): DeclaratorInfo {
    const startLoc = this.tok.loc;
    const { pack, idExpr, surrounding } = this.parseDeclaratorImpl({
      abstract,
      depth: 0,
    });
    const endLoc = this.tok.loc;
    let typeInfo = "";
    let direction: "postfix" | "prefix" | null = null;
    for (const s of surrounding) {
      if (["*", "&", "&&"].includes(s.kind)) {
        direction = "prefix";
        typeInfo = `${s.kind}${typeInfo}`;
      } else if (s.kind === "const" || s.kind === "volatile") {
        direction = "prefix";
        const join = /^\w/.test(typeInfo) ? " " : "";
        typeInfo = `${s.kind}${join}${typeInfo}`;
      } else if (s.kind === "pointerToMember") {
        direction = "prefix";
        typeInfo = `${s.raw} ${typeInfo}`;
      } else {
        if (direction === "prefix") {
          typeInfo = `(${typeInfo})`;
          direction = "postfix";
        }
        if (s.kind === "function") {
          const params = s.parameters.map((p) => p.raw);
          typeInfo += `(${params.join(", ")})`;
          if (s.qualifiers.const) {
            typeInfo += " const";
          }
          if (s.qualifiers.volatile) {
            typeInfo += " volatile";
          }
          if (s.qualifiers.ref) {
            typeInfo += ` ${s.qualifiers.ref}`;
          }
          if (s.qualifiers.noexcept) {
            typeInfo += ` noexcept`;
            if (typeof s.qualifiers.noexcept !== "boolean") {
              typeInfo += `(${s.qualifiers.noexcept.raw})`;
            }
          }
          if (s.trailingReturnType) {
            typeInfo += ` -> ${s.trailingReturnType}`;
          }
        } else if (s.kind === "array") {
          typeInfo += `[${s.size}]`;
        }
      }
    }
    let join = " ";
    typeInfo = typeInfo.replace(/^(\*|&&|&)/, (_, punct) => {
      join = "";
      return punct + " ";
    });
    const leading = declSpecifier.typeString;
    const functionInfo =
      surrounding[0]?.kind === "function" ? surrounding[0] : null;
    if (declSpecifier.typeString === "") {
      this.assert(
        functionInfo,
        `Declaration without type-specifier must be function (ctor, dtor or conversion)`,
      );
    }
    typeInfo = `${leading}${join}${typeInfo}`.trim();
    return {
      pack,
      idExpr,
      raw: this.lexer.range(startLoc, endLoc),
      typeInfo,
      function: functionInfo,
    };
  }

  private parseDeclaratorImpl({
    abstract,
    depth,
  }: {
    abstract: boolean;
    depth: number;
  }): PartialDeclaratorInfo {
    const prefix: DeclaratorSurrounding[] = [];
    while (true) {
      const ptrToMemberPrefix = this.tryReadPointerToMemberDeclaratorPrefix();
      if (ptrToMemberPrefix) {
        prefix.push({
          kind: "pointerToMember",
          raw: ptrToMemberPrefix.raw,
        });
      } else if (
        (this.tok.type === TokenType.Punct &&
          ["*", "&", "&&"].includes(this.tok.value)) ||
        this.isId("const") ||
        this.isId("volatile")
      ) {
        prefix.push({
          kind: this.tok.value as "*" | "&" | "&&" | "const" | "volatile",
        });
        this.adv();
      } else {
        break;
      }
    }
    const { pack, idExpr, surrounding } = this.parseDirectDeclarator({
      abstract,
      depth,
    });
    surrounding.push(...prefix.toReversed());
    return { pack, idExpr, surrounding };
  }

  private parseDirectDeclarator({
    abstract,
    depth,
  }: {
    abstract: boolean;
    depth: number;
  }): PartialDeclaratorInfo {
    let idExpr: IdExpressionInfo | null = null;
    const surrounding: DeclaratorSurrounding[] = [];
    let pack = false;
    if (this.isP("(")) {
      this.consumeP("(");
      const inner = this.parseDeclaratorImpl({ abstract, depth: depth + 1 });
      this.consumeP(")");
      pack = inner.pack;
      idExpr = inner.idExpr;
      surrounding.push(...inner.surrounding);
    } else {
      if (this.isP("...")) {
        pack = true;
        this.consumeP("...");
      }
      if (abstract) {
        idExpr = this.tryReadIdExpression();
      } else {
        idExpr = this.readIdExpression();
      }
      this.tryParseAttribute();
    }
    while (this.isP("[") || this.isP("(")) {
      if (this.isP("(")) {
        //! LOOSE PARSE: always consider this is a function declarator,
        // not the start of direct-initializer since latter case is rarely used
        // in standard synopsis... and we CANNOT disambiguate them AT ALL, e.g.:
        // `int f(X);` is this function accepting X or variable initialized from X?
        try {
          using transaction = this.createRevertTransaction();
          surrounding.push(this.parseParameterAndQualifiers());
          transaction.commit();
        } catch (e) {
          console.warn(
            "Function declaration parsing failure, fallback to variable initialization; this MIGHT not happened: ",
            e,
          );
          // Should not fail when depth > 0 i.e. `int (x (HERE));`
          // which HERE must be parsed parameter list not initializer
          if (depth > 0) {
            throw e;
          }
          // If we have an error while parsing parameters and qualifiers
          // this must be a variable declaration with direct initializer,
          // e.g. `int x(42);`, then we break out declarator parsing.
          break;
        }
      } else {
        this.consumeP("[");
        const startLoc = this.tok.loc;
        this.skipBalancedTokensUntilPunct(["]"], false);
        const endLoc = this.tok.loc;
        this.consumeP("]");
        const size = this.lexer.range(startLoc, endLoc);
        surrounding.push({ kind: "array", size });
      }
    }
    return { pack, idExpr, surrounding };
  }

  // MARK: ---- Namespace ----

  private parseNamespace({ inline }: { inline: boolean }): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    if (inline) {
      this.consumeId("inline");
    }
    const startLoc = this.tok.loc;
    this.consumeId("namespace");

    this.tryParseAttribute();

    let nsInfo: NamespaceInfo[] = [];
    while (this.isIdentifierOrLaTeX()) {
      nsInfo.push({
        name: this.resolved(this.tok),
        inline,
      });
      this.adv();
      if (this.isP("::")) {
        this.consumeP("::");
        // namespace X::inline Y { ... }
        if (this.isId("inline")) {
          this.consumeId("inline");
          inline = true;
        }
      } else {
        break;
      }
    }

    // namespace X = Y;
    if (nsInfo.length >= 0 && this.isP("=")) {
      this.assert(
        nsInfo.every((n) => n.name !== null && !inline),
        `Namespace alias cannot be inline or unnamed`,
      );
      const name = nsInfo.map((n) => n.name).join("::");
      this.consumeP("=");
      const targetExpr = this.readIdExpression();
      this.consumeP(";");
      symbols.push(
        this.buildSymbol("namespaceAlias", {
          name,
          targetNamespace: targetExpr.name,
          raw: this.lexer.range(startLoc, this.tok.loc),
        }),
      );
      return symbols;
    }

    // namespace { ... }
    if (nsInfo.length === 0) {
      this.tryParseAttribute();
      nsInfo.push({
        name: null,
        inline: false,
      });
    }

    this.consumeP("{");

    this.context = produce(this.context, (ctx) => {
      ctx.nsStack.push(...nsInfo);
    });

    while (!this.isP("}")) {
      symbols.push(...this.parseExternalDeclaration());
    }
    this.context = produce(this.context, (ctx) => {
      ctx.nsStack.splice(-nsInfo.length, nsInfo.length);
    });
    this.consumeP("}");
    return symbols;
  }

  // MARK: ---- Using ----

  private parseUsingDirectiveOrDeclaration({
    templateInfo,
    startLoc,
  }: {
    templateInfo: TemplateInfo | null;
    startLoc: Location;
  }): SymbolEntry[] {
    this.consumeId("using");

    // using namespace X;
    if (this.isId("namespace")) {
      this.assert(!templateInfo, `using-directive cannot be templated`);
      return this.parseUsingDirective({ startLoc });
    }

    return this.parseUsingDeclaration({ templateInfo, startLoc });
  }

  private parseUsingDirective({
    startLoc,
  }: {
    startLoc: Location;
  }): SymbolEntry[] {
    this.consumeId("namespace");
    const idExpr = this.readIdExpression();
    this.consumeP(";");
    return [
      this.buildSymbol("usingDirective", {
        name: "", // using-directive does not introduce a name
        targetNamespace: idExpr.name,
        raw: this.lexer.range(startLoc, this.tok.loc),
      }),
    ];
  }

  private parseUsingEnumDeclaration(): SymbolEntry[] {
    this.consumeId("enum");
    this.readIdExpression();
    this.consumeP(";");
    // TODO should we emit symbol for using enum declaration?
    return [];
  }

  private parseUsingDeclaration({
    templateInfo,
    startLoc,
  }: {
    templateInfo: TemplateInfo | null;
    startLoc: Location;
  }): SymbolEntry[] {
    // using typename X::Y;
    if (this.isId("typename")) {
      this.consumeId("typename");
    }

    if (this.isId("enum")) {
      this.assert(!templateInfo, `using-enum cannot be templated`);
      return this.parseUsingEnumDeclaration();
    }

    let idExpr = this.readIdExpression();

    // using X = Y;
    if (this.isP("=")) {
      const { name, parts } = idExpr;
      this.assert(
        parts.length === 1 && parts[0].kind === IdPartKind.Identifier,
        `Name introduced by using-alias-declaration should be identifier`,
      );
      this.consumeP("=");
      this.skipBalancedTokensUntilPunct([";"], true);
      this.consumeP(";");
      if (templateInfo) {
        return [
          this.buildSymbol("typeAliasTemplate", {
            name,
            raw: this.lexer.range(startLoc, this.tok.loc),
            syntax: "using",
            templateParams: this.buildTemplateParams(templateInfo),
          }),
        ];
      } else {
        return [
          this.buildSymbol("typeAlias", {
            name,
            raw: this.lexer.range(startLoc, this.tok.loc),
            syntax: "using",
          }),
        ];
      }
    }
    const symbols: SymbolEntry[] = [];

    // using X::Y, Z::W;
    while (true) {
      const { name, parts } = idExpr;
      symbols.push(
        this.buildSymbol("usingDeclaration", {
          name: parts.at(-1)!.name,
          raw: this.lexer.range(startLoc, this.tok.loc) + ";",
          target: name,
        }),
      );
      if (this.isP(";")) {
        this.consumeP(";");
        break;
      }
      this.consumeP(",");
      idExpr = this.readIdExpression();
    }
    return symbols;
  }

  // MARK: ---- Template ----

  private parseTemplateParameter(): TemplateParameterInfo {
    // here might be a:
    // - NTTP: a parameter declaration
    // - template template parameter:
    //   `template <parameters> [concept|class|typename|auto] [...|<id> [= <typeid>]]`
    // - type template parameter:
    //   `class|typename|<constraint> [...|<id> [= <typeid>]]`
    // since `<constraints> [...|<id> [= <typeid>]]` has same syntax with NTTP so
    // we just call `parseParameterDeclaration` and it might work lol
    const startLoc = this.tok.loc;
    let name: string | null = null;
    let kind: TemplateParameterInfo["kind"];
    let pack = false;
    let defaultArg: string | null = null;
    let typeInfo: string | null = null;
    const readNameAndDefaultArg = () => {
      if (this.isP("...")) {
        pack = true;
        this.consumeP("...");
      }
      if (this.isIdentifierOrLaTeX()) {
        name = this.resolved(this.tok);
        this.adv();
      }
      if (!pack && this.isP("=")) {
        this.consumeP("=");
        const startLoc = this.tok.loc;
        this.skipBalancedTokensUntilPunct([",", ">"], true);
        const endLoc = this.tok.loc;
        defaultArg = this.lexer.range(startLoc, endLoc);
      }
    };
    do {
      if (this.isId("template")) {
        kind = "template";
        this.consumeId("template");
        this.parseTemplateParameterList();
        this.assert(
          this.isId("class") ||
            this.isId("typename") ||
            this.isId("concept") ||
            this.isId("auto"),
          "should be one of `class`, `typename`, `concept`, or `auto` after template-head in tt-parameter",
        );
        this.adv();
        readNameAndDefaultArg();
      } else if (this.isId("class") || this.isId("typename")) {
        kind = "type";
        this.adv();
        readNameAndDefaultArg();
      } else {
        {
          using transaction = this.createRevertTransaction();
          const idExpression = this.tryReadIdExpression();
          if (
            idExpression &&
            idExpression.parts.length === 1 &&
            idExpression.parts[0].conceptName
          ) {
            kind = "type";
            typeInfo = idExpression.name;
            readNameAndDefaultArg();
            transaction.commit();
            break;
          }
        }
        const paramInfo = this.parseParameterDeclaration();
        kind = "constant";
        name = paramInfo.name;
        pack = paramInfo.pack;
        defaultArg = paramInfo.defaultArg?.raw || null;
        typeInfo = paramInfo.typeInfo;
      }
    } while (false);
    const endLoc = this.tok.loc;
    return {
      kind,
      name,
      pack,
      defaultArg,
      raw: this.lexer.range(startLoc, endLoc),
      typeInfo,
    };
  }

  private parseTemplateParameterList(): TemplateParameterInfo[] {
    this.consumeP("<");
    const parameters: TemplateParameterInfo[] = [];
    while (!this.isP(">")) {
      const parameter = this.parseTemplateParameter();
      parameters.push(parameter);
      if (this.isP(">")) {
        break;
      }
      this.consumeP(",");
    }
    this.consumeP(">");
    return parameters;
  }

  private parseTemplateArgs(): TemplateArgumentInfo[] {
    this.consumeP("<");
    const args: TemplateArgumentInfo[] = [];
    // LOOSE PARSE: we cannot figure out its detailed structure
    // (should be a type-id, template-id, or constant expression?)
    while (!this.isP(">")) {
      const startLoc = this.tok.loc;
      this.skipBalancedTokensUntilPunct([",", ">"], true);
      const endLoc = this.tok.loc;
      args.push({ raw: this.lexer.range(startLoc, endLoc) });
      if (this.isP(">")) {
        break;
      }
      this.consumeP(",");
    }
    this.consumeP(">");
    return args;
  }

  private parseTemplateDeclarationOrSpecialization({
    startLoc,
    contextType,
    scopeClassName,
  }: {
    startLoc: Location;
    contextType: DeclarationContextType;
    scopeClassName: string | null;
  }): SymbolEntry[] {
    const templateHeadList: PlainTemplateInfo[] = [];
    do {
      const templateParameters = [];
      let requiresClause: string | null = null;
      let fullSpecialization = false;
      this.consumeId("template");
      const params = this.parseTemplateParameterList();
      if (params.length === 0) {
        fullSpecialization = true;
      }
      templateParameters.push(...params);
      if (this.isId("requires")) {
        this.consumeId("requires");
        const startLoc = this.tok.loc;
        this.parseConstraintExpression();
        const endLoc = this.tok.loc;
        requiresClause = this.lexer.range(startLoc, endLoc);
      }
      templateHeadList.push({
        templateParameters,
        requiresClause,
        fullSpecialization,
      });
    } while (this.isId("template"));
    const lastHead = templateHeadList.pop()!;
    const templateInfo: TemplateInfo = {
      ...lastHead,
      nested: templateHeadList,
    };
    if (this.isId("concept")) {
      this.assert(
        templateInfo.nested.length === 0,
        `Concept cannot have multiple template heads`,
      );
      return this.parseConcept({ templateInfo, startLoc, contextType });
    }
    return this.parseDeclarationAfterTemplate({
      startLoc,
      contextType,
      templateInfo,
      scopeClassName,
    });
  }

  private parseDeclarationAfterTemplate({
    startLoc,
    contextType,
    templateInfo,
    scopeClassName,
  }: {
    startLoc: Location;
    contextType: DeclarationContextType;
    templateInfo: TemplateInfo;
    scopeClassName: string | null;
  }): SymbolEntry[] {
    // TODO if we are in member context, dispatch to a member declaration

    this.tryParseAttribute();

    if (this.isId("using")) {
      // template <...> using T = ...;
      return this.parseUsingDirectiveOrDeclaration({
        startLoc,
        templateInfo,
      });
    }

    return this.parseSimpleDeclarationOrFunctionDefinition({
      startLoc,
      contextType,
      templateInfo,
      scopeClassName,
    });
  }

  // MARK: ---- Class ----

  private parseClassSpecifier({
    previousSpecifiers,
    contextType,
  }: {
    previousSpecifiers: readonly DeclSpecifierKeyword[];
    declStartLoc: Location;
    contextType: DeclarationContextType;
  }): ClassSpecifierInfo {
    const startLoc = this.tok.loc;
    const tagKind = this.tok.value as ClassTagKind;
    this.adv(); // class|struct|union

    let useKind: ClassSpecifierUseKind = "reference";
    this.tryParseAttribute();
    const idExpr = this.readIdExpression();

    // TODO
    // friend class A, class B;
    // friend class Ts...;
    if (
      previousSpecifiers[0] === "friend" &&
      (this.isP(",") || this.isP("..."))
    ) {
      return {
        tagKind,
        useKind: "friendType",
        id: idExpr,
        templateArgs: null,
        raw: this.lexer.range(startLoc, this.tok.loc),
        baseSpecifiers: [],
        members: null,
      };
    }

    if (this.isId("final")) {
      this.consumeId("final");
    }

    const baseSpecifiers: BaseSpecifierInfo[] = [];

    if (this.isP(":")) {
      this.consumeP(":");
      while (true) {
        const startLoc = this.tok.loc;
        let accessSpecifier: "public" | "protected" | "private" | null = null;
        let virtual = false;
        this.tryParseAttribute();
        // access-specifier or virtual
        if (
          this.tok.type === TokenType.Identifier &&
          ["public", "protected", "private", "virtual"].includes(this.tok.value)
        ) {
          if (this.tok.value === "virtual") {
            virtual = true;
          } else {
            accessSpecifier = this.tok.value as
              | "public"
              | "protected"
              | "private";
          }
          this.adv();
        }
        const baseTypeId = this.readIdExpression(); // class-or-decltype
        const raw = this.lexer.range(startLoc, this.tok.loc);
        baseSpecifiers.push({
          raw,
          access: accessSpecifier,
          virtual,
          typeId: baseTypeId,
        });
        if (!this.isP(",")) {
          break;
        }
      }
      if (this.isP("...")) {
        this.consumeP("...");
      }
    }

    const mayDeclare =
      [DeclarationContextType.TopLevel, DeclarationContextType.Class].includes(
        contextType,
      ) && !previousSpecifiers.includes("friend");

    const templateArgs = idExpr.parts.at(-1)?.templateArgs ?? null;
    if (mayDeclare && !templateArgs) {
      this.assert(
        idExpr.parts.at(-1)?.kind === IdPartKind.Identifier,
        "Name of class declaration or definition should be a simple identifier",
      );
    }

    let members: ClassMemberEntry[] | null = null;
    if (mayDeclare && this.tok.isP("{")) {
      const componentName = idExpr.parts.at(-1)?.value;
      this.assert(
        componentName,
        `Class should have a name to declare its members`,
      );
      members = this.parseMemberSpecification(componentName);
      useKind = "definition";
    }
    if (mayDeclare && this.tok.isP(";")) {
      useKind = "declaration";
    }

    const endLoc = this.tok.loc;
    const raw = this.lexer.range(startLoc, endLoc);
    return {
      tagKind,
      id: idExpr,
      templateArgs,
      useKind,
      baseSpecifiers,
      raw,
      members,
    };
  }

  /**
   * Parse
   */
  private parseMemberSpecification(
    scopeClassName: string,
  ): ClassMemberEntry[] | null {
    this.consumeP("{");
    if (this.tryReadUnspecifiedMemberOrEnumerator()) {
      this.consumeP("}");
      return null;
    }
    const members: ClassMemberEntry[] = [];
    while (!this.isP("}")) {
      if (
        this.tok.type === TokenType.Identifier &&
        ["public", "protected", "private"].includes(this.tok.value) &&
        this.nextTok().isP(":")
      ) {
        this.adv(); // access-specifier
        this.consumeP(":");
        continue;
      }
      const startLoc = this.tok.loc;
      this.tryParseAttribute();
      const symbols = this.parseDeclaration({
        startLoc,
        contextType: DeclarationContextType.Class,
        scopeClassName,
      });
      for (const sym of symbols) {
        switch (sym.kind) {
          case "macro":
          case "functionLikeMacro":
          case "usingDirective":
          case "namespaceAlias":
          case "concept":
            this.die(`Symbol of kind ${sym.kind} cannot be a class member`);
          default:
            members.push(sym);
        }
      }
    }
    this.consumeP("}");
    return members;
  }

  // ---- Function ----

  private parseParameterDeclaration(): ParameterInfo {
    const startLoc = this.tok.loc;
    const declSpec = this.parseDeclarationSpecifiers({
      declStartLoc: startLoc,
      templateInfo: null,
      scopeClassName: null,
      contextType: DeclarationContextType.Parameter,
    });
    const declarator = this.parseDeclarator({
      declSpecifier: declSpec,
      abstract: true,
    });
    let defaultArg: ExpressionInfo | null = null;
    if (this.isP("=")) {
      // default parameter, skip initializer
      this.consumeP("=");
      const startLoc = this.tok.loc;
      // LOOSE PARSE: expression
      this.skipBalancedTokensUntilPunct(
        [
          "...", // variadic function mark
          ",", // start of next parameter
          ")", // end-of parameter list
          ">", // end of template-parameter list
        ],
        true,
      );
      const endLoc = this.tok.loc;
      defaultArg = { raw: this.lexer.range(startLoc, endLoc) };
    }
    const endLoc = this.tok.loc;
    let name: string | null = null;
    if (declarator.idExpr) {
      this.assert(
        declarator.idExpr.parts.length === 1,
        "Parameter declarator should not nested",
      );
      name = declarator.idExpr.parts[0].name ?? null;
    }
    return {
      raw: this.lexer.range(startLoc, endLoc),
      declSpecifier: declSpec,
      name,
      pack: declarator.pack,
      defaultArg,
      typeInfo: declarator.typeInfo,
    };
  }

  private parseParameterAndQualifiers(): FunctionInfo {
    this.consumeP("(");
    const parameterListInfo: ParameterListInfo = {
      parameters: [],
      variadic: false,
    };
    while (!this.isP(")")) {
      // C-style variadic, int f(...); / int f(int x, ...);
      if (this.isP("...")) {
        this.consumeP("...");
        parameterListInfo.variadic = true;
        break;
      }
      const parameter = this.parseParameterDeclaration();
      parameterListInfo.parameters.push(parameter);
      // C++-style variadic, int f(int x...);
      if (this.isP("...")) {
        this.consumeP("...");
        parameterListInfo.variadic = true;
        break;
      }
      if (this.isP(")")) {
        break;
      }
      this.consumeP(",");
    }
    this.consumeP(")");
    const qualifiers: FunctionQualifierInfo = {
      const: false,
      volatile: false,
      ref: null,
      noexcept: false,
    };
    while (true) {
      if (this.isId("const")) {
        qualifiers.const = true;
        this.consumeId("const");
      } else if (this.isId("volatile")) {
        qualifiers.volatile = true;
        this.consumeId("volatile");
      } else {
        break;
      }
    }
    if (this.isP("&") || this.isP("&&")) {
      qualifiers.ref = this.tok.value as "&" | "&&";
      this.adv();
    }
    if (this.isId("noexcept")) {
      this.consumeId("noexcept");
      qualifiers.noexcept = true;
      if (this.isP("(")) {
        this.consumeP("(");
        const startLoc = this.tok.loc;
        this.skipBalancedTokensUntilPunct([")"], false);
        const endLoc = this.tok.loc;
        qualifiers.noexcept = {
          raw: this.lexer.range(startLoc, endLoc),
        };
        this.consumeP(")");
      }
    }
    this.tryParseAttribute();
    let trailingReturnType = null;
    if (this.isP("->")) {
      this.consumeP("->");
      const startLoc = this.tok.loc;
      // LOOSE PARSE: skip trailing return type
      this.skipBalancedTokensUntilPunct([",", "{", ";"], true);
      const endLoc = this.tok.loc;
      trailingReturnType = this.lexer.range(startLoc, endLoc);
    }
    const vertSpecifiers: VertSpecifierKw[] = [];
    while (this.isId("final") || this.isId("override")) {
      vertSpecifiers.push(this.tok.value as VertSpecifierKw);
      this.adv();
    }
    let constraint: ExpressionInfo | null = null;
    if (vertSpecifiers.length === 0 && this.isId("requires")) {
      this.consumeId("requires");
      constraint = this.parseConstraintExpression();
    }
    const contracts: { raw: string }[] = [];
    while (this.isId("pre") || this.isId("post")) {
      contracts.push({ raw: this.parseContractSpecifier() });
    }
    return {
      kind: "function",
      ...parameterListInfo,
      qualifiers,
      trailingReturnType,
      vertSpecifiers,
      constraint,
      contracts,
    };
  }

  private parseContractSpecifier(): string {
    const startLoc = this.tok.loc;
    if (this.isId("pre")) {
      this.consumeId("pre");
      this.tryParseAttribute();
      this.skipBalancedBrackets("(", ")");
    } else {
      this.consumeId("post");
      this.tryParseAttribute();
      this.skipBalancedBrackets("(", ")");
    }
    const endLoc = this.tok.loc;
    return this.lexer.range(startLoc, endLoc);
  }

  // ---- Enum ----

  private parseEnumBase(): string {
    this.consumeP(":");
    const startLoc = this.tok.loc;
    // LOOSE PARSE: skip base type
    this.skipBalancedTokensUntilPunct(["{", ";"], true);
    const endLoc = this.tok.loc;
    return this.lexer.range(startLoc, endLoc);
  }

  /**
   * ```
   * enum E e;     // elaborated-type-specifier
   * enum E { } e; // enum-specifier
   * ```
   */
  private parseEnumSpecifier(): EnumSpecifierInfo {
    this.consumeId("enum");
    let scoped: boolean | "class" | "struct" = false;
    let baseType: string | null = null;
    if (this.isId("class") || this.isId("struct")) {
      scoped = this.tok.value as "class" | "struct";
      this.adv(); // class|struct
    }
    this.tryParseAttribute();
    let enumerators: EnumeratorEntry[] | null = null;
    // anonymous enum: `enum { ... };`
    // optionally with base type: `enum : int { ... };`
    if (!scoped) {
      if (this.isP(":")) {
        baseType = this.parseEnumBase();
        enumerators = this.parseEnumeratorList();
      }
    }
    const id = this.readIdExpression();
    if (this.isP(":")) {
      baseType = this.parseEnumBase();
    }
    if (this.isP("{")) {
      enumerators = this.parseEnumeratorList();
    }
    return {
      id,
      scoped,
      baseType,
      enumerators,
    };
  }

  private parseEnumeratorList(): EnumeratorEntry[] | null {
    this.consumeP("{");
    if (this.tryReadUnspecifiedMemberOrEnumerator()) {
      this.consumeP("}");
      return null;
    }
    const enumerators: EnumeratorEntry[] = [];
    while (!this.isP("}")) {
      if (this.isP(",")) {
        this.consumeP(",");
        continue;
      }
      const startLoc = this.tok.loc;
      const name = this.readIdent();
      let value: string | null = null;
      if (this.isP("=")) {
        this.consumeP("=");
        const valueStart = this.tok.loc;
        this.skipBalancedTokensUntilPunct([",", "}"], true);
        value = this.lexer.range(valueStart, this.tok.loc);
      }
      const raw = this.lexer.range(startLoc, this.tok.loc);
      enumerators.push({ name, raw, value });
      if (this.isP(",")) {
        this.consumeP(",");
      }
    }
    this.consumeP("}");
    return enumerators;
  }

  // ---- Concept ----

  private parseConcept({
    startLoc,
    templateInfo,
    contextType,
  }: {
    startLoc: Location;
    templateInfo: TemplateInfo;
    contextType: DeclarationContextType;
  }): SymbolEntry[] {
    this.consumeId("concept");
    const name = this.readIdent();
    this.tryParseAttribute();

    this.consumeP("=");
    // LOOSE PARSE: we might not implement the parsing of logic-or-expression
    this.skipBalancedTokensUntilPunct([";"], true);
    this.consumeP(";");
    return [
      this.buildSymbol("concept", {
        name,
        raw: this.lexer.range(startLoc, this.tok.loc),
        templateParams: this.buildTemplateParams(templateInfo),
      }),
    ];
  }

  private parseConstraintExpression(): ExpressionInfo {
    const startLoc = this.tok.loc;
    while (true) {
      if (this.isId("requires")) {
        // LOOSE PARSE: skip requires-expression
        this.consumeId("requires");
        if (this.isP("(")) {
          this.skipBalancedBrackets("(", ")");
        }
        this.skipBalancedBrackets("{", "}");
      } else if (this.isP("(")) {
        // LOOSE PARSE: skip parenthesized atomic constraint-expression
        this.skipBalancedBrackets("(", ")");
      } else {
        this.readIdExpression();
      }
      if (this.isP("&&") || this.isP("||")) {
        this.adv();
      } else {
        break;
      }
    }
    const endLoc = this.tok.loc;
    return {
      raw: this.lexer.range(startLoc, endLoc),
    };
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
    return this.readIdExpressionParts("name");
  }

  /** Reads `nested-name-specifier *` */
  private tryReadPointerToMemberDeclaratorPrefix(): { raw: string } | null {
    try {
      using transaction = this.createRevertTransaction();
      const { name } = this.readIdExpressionParts("star");
      transaction.commit();
      return { raw: name };
    } catch {
      return null;
    }
  }

  /** Reads an `nested-name-specifier name` or `nested-name-specifier *` */
  private readIdExpressionParts(endsWith: "name" | "star"): IdExpressionInfo {
    const parts: IdExpressionPartInfo[] = [];
    const fromGlobal = this.isP("::");
    let name = "";
    do {
      let hasTemplateDisambiguation = false;
      if (this.isP("::")) {
        this.consumeP("::");
        name += "::";
        if (endsWith === "star" && this.isP("*")) {
          // A::*
          name += "*";
          this.consumeP("*");
          parts.push({
            kind: IdPartKind.PointerToMember,
            name: "*",
            value: null,
            templateArgs: null,
            conceptName: false,
          });
          return { name, fromGlobal, parts };
        }
        if (this.isId("template")) {
          // A::template B<...>
          hasTemplateDisambiguation = true;
          this.consumeId("template");
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
    if (endsWith === "star") {
      this.die("Expected `*` at the end of pointer-to-member declarator");
    }
    return { name, fromGlobal, parts };
  }

  private readIdExpressionPart(
    hasTemplateDisambiguation: boolean,
  ): IdExpressionPartInfo {
    let name = hasTemplateDisambiguation ? "template " : "";
    let value: string | null = null;
    let kind: IdPartKind;
    let templateArgs: TemplateArgumentInfo[] | null = null;
    let conceptName = false;
    if (this.isId("decltype")) {
      this.consumeId("decltype");
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
      this.consumeP("~");
      this.assert(
        this.isIdentifierOrLaTeX(),
        "Expected identifier after ~ in destructor name",
      );
      value = this.resolved(this.tok);
      name += value;
      this.adv();
      kind = IdPartKind.Destructor;
    } else if (this.isId("operator")) {
      name += "operator";
      this.consumeId("operator");
      if (this.tok.type === TokenType.Punct) {
        kind = IdPartKind.Operator;
        value = this.tok.value;
        if (this.tok.value === ">") {
          const nextTok = this.nextTok();
          if (nextTok.isP(">") || nextTok.isP(">=")) {
            // operator>>, operator>>=
            value += nextTok.value;
            this.adv();
          }
        } else if (this.tok.value === "(") {
          this.consumeP("(");
          this.assertP(")");
          value += ")";
        } else if (this.tok.value === "[") {
          this.consumeP("[");
          this.assertP("]");
          value += "]";
        }
        name += value;
        this.adv();
      } else if (this.isId("new") || this.isId("delete")) {
        kind = IdPartKind.Operator;
        value = this.tok.value;
        name += " " + value;
        this.adv();
      } else if (this.tok.type === TokenType.StringLiteral) {
        kind = IdPartKind.UDL;
        this.assert(
          this.tok.value === `""`,
          `UDL string literal should be empty`,
        );
        name += `""`;
        this.adv();
        this.assert(
          (this as this).tok.type === TokenType.Identifier,
          `Expected identifier after UDL string literal`,
        );
        value = this.tok.value;
        name += value;
        this.adv();
      } else {
        kind = IdPartKind.Conversion;
        value = this.readIdExpression().name;
        name += " " + value;
      }
    } else if (this.isIdentifierOrLaTeX()) {
      conceptName = this.tok.value.includes("\\libconcept");
      value = this.resolved(this.tok);
      name += value;
      this.adv();
      kind = IdPartKind.Identifier;
    } else {
      this.die(`Unexpected token: ${this.tok.value}`);
    }
    // pack-index-expression
    if (this.isP("...") && this.nextTok().isP("[")) {
      const startLoc = this.tok.loc;
      this.consumeP("...");
      this.skipBalancedBrackets("[", "]");
      const endLoc = this.tok.loc;
      name += this.lexer.range(startLoc, endLoc);
      value = null;
      kind = IdPartKind.Computed;
    }
    // simple-template-id
    if (this.isP("<")) {
      const startLoc = this.tok.loc;
      templateArgs = this.parseTemplateArgs();
      const endLoc = this.tok.loc;
      name += this.lexer.range(startLoc, endLoc);
    }
    return { kind, name, value, templateArgs, conceptName };
  }

  /**
   * Reads @\unspec@, @\seebelow@ placeholder
   * from a member-specification or enumerator-list
   * True if read successfully, false if not an unspecified member
   */
  private tryReadUnspecifiedMemberOrEnumerator(): boolean {
    if (this.tok.type !== TokenType.LatexEscape) {
      return false;
    }
    using transaction = this.createRevertTransaction();
    if (!["@\\unspec@", "@\\seebelow@"].includes(this.tok.value)) {
      return false;
    }
    this.adv();
    if (this.isP(";")) {
      this.consumeP(";");
    }
    if (this.isP("}")) {
      transaction.commit();
      return true;
    }
    return false;
  }

  /**
   * TODO The argument of nested-name-specifier might point to the main template or partial specialization; we need to:
   * - resolve the template parameter name and corresponding argument
   * - if argument literally equals to the parameter, then it should refer to the primary template; otherwise, this refers to a partial specialization
   *
   * @ref [expr.prim.id.qual]
   * (4.5) If a nested-name-specifier N is declarative and has a simple-template-id with a template argument list A that involves a template parameter, let T be the template nominated by N without A. T shall be a class template.
   * (4.5.1) If A is the template argument list ([temp.arg]) of the corresponding template-head H ([temp.mem]), N designates the primary template of T; H shall be equivalent to the template-head of T ([temp.over.link]).
   * (4.5.2) Otherwise, N designates the partial specialization ([temp.spec.partial]) of T whose template argument list is equivalent to A ([temp.over.link]); the program is ill-formed if no such partial specialization exists.
   *
   */

  /** Used for specialization declarations */
  private nameWithoutTemplateArg(idExpr: IdExpressionInfo): string {
    const copy = [...idExpr.parts];
    const lastPart = copy.pop();
    this.assert(
      lastPart?.value,
      `Cannot call nameWithoutTemplateArg on a computed type-id`,
    );
    return `${idExpr.fromGlobal ? "::" : ""}${copy.map((p) => p.name + "::").join("")}${lastPart.value}`;
  }

  /**
   * Constructor, deduction guide and conversion function do not have a type-specifier
   * when treated as simple-declaration. We must check that current type-specifier might
   * be part of declarator and not a decl-specifier.
   */
  private isTypeSpecifierDisallowed({
    declSpecifiers,
    scopeClassName,
    contextType,
  }: {
    declSpecifiers: readonly DeclSpecifierKeyword[];
    scopeClassName: string | null;
    contextType: DeclarationContextType;
  }): boolean {
    using _transaction = this.createRevertTransaction();
    const idExpr = this.readIdExpression();
    const lastPart = idExpr.parts.at(-1);
    this.assert(lastPart, "id-expression should have at least one part");
    if (lastPart.kind === IdPartKind.Conversion) {
      // conversion function cannot have decl-specifier
      return true;
    }
    if (lastPart.kind !== IdPartKind.Identifier) {
      // dtor or operator/udl
      return false;
    }
    if (lastPart.templateArgs) {
      // ctor name and deduction guide cannot be template-id
      return false;
    }

    // a inline no-type declaration must be the constructor
    const mayInLineCtor =
      contextType === DeclarationContextType.Class &&
      lastPart.name === scopeClassName;

    // a out-of-line no-type declaration might be a
    // out-of-line ctor or a deduction guide
    // for ctor scenario, comparing
    // `idExpr.parts.at(-2)?.componentName === lastPart.name`
    // is not a good idea since `using B = A;` can make ctor
    // declarations like `B::A()` valid
    const mayOutLineCtor =
      contextType === DeclarationContextType.TopLevel &&
      idExpr.parts.length > 1;
    // for deduction guide scenario, check current `idExpr` is a simple template-name
    // and decl-specifier should be empty or a single `explicit`
    const mayDeductionGuide =
      idExpr.parts.length === 1 &&
      (declSpecifiers.length === 0 ||
        (declSpecifiers.length === 1 && declSpecifiers[0] === "explicit"));

    if (!(mayInLineCtor || mayOutLineCtor || mayDeductionGuide)) {
      return false;
    }

    this.tryParseAttribute();
    if (!this.isP("(")) {
      return false;
    }
    this.consumeP("(");
    if (this.isP(")")) {
      return true;
    } else if (this.isP("...")) {
      this.consumeP("...");
      // parameter-pack won't appear in TopLevel/Member decl-specifier)
      // so the ellipsis can only be end of variadic function
      this.assertP(")");
      return true;
    } else if (this.isP("[")) {
      this.consumeP("[");
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
    // then it must be a ctor declaration
    this.tryParseAttribute();
    if (
      this.isIdentifierOrLaTeX() ||
      (this.tok.type === TokenType.Punct &&
        ["*", "&", "&&", ",", "..."].includes(this.tok.value))
    ) {
      return true;
    }
    this.skipBalancedTokensUntilPunct([")"], false);
    this.consumeP(")");
    // work on more...
    if (this.tok.isP("->") || this.tok.isP(":")) {
      // trailing return type or ctor initializer list, must be a ctor declaration
      return true;
    }
    if (
      this.tok.type === TokenType.Identifier &&
      ["noexcept", "requires", "pre", "post"].includes(this.tok.value)
    ) {
      // exception-specifier, constraint or contract, must be a ctor declaration
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

  private buildTemplateParams(params: TemplateInfo): TemplateParameter[] {
    return params.templateParameters.map((p) => ({
      raw: p.raw,
      kind: p.kind,
      name: p.name,
      defaultArg: p.defaultArg,
      pack: p.pack,
      type: p.typeInfo ?? "",
    }));
  }
  private buildSymbol<Kind extends SymbolKind>(
    kind: Kind,
    info: Omit<
      ExtractKind<SymbolEntry, Kind>,
      Exclude<keyof SymbolEntryBase, "raw" | "name"> | "kind"
    >,
  ): SymbolEntry {
    return {
      kind,
      ...info,
      header: this.filename,
      namespace: [...this.context.nsStack],
      languageLinkage: this.context.linkageStack.at(-1) ?? null,
    } as SymbolEntry;
  }
  private buildNestedSymbol<Kind extends Extract<SymbolKind, `class${string}`>>(
    kind: Kind,
    template: TemplateInfo | null,
    id: IdExpressionInfo,
    info: Omit<
      ExtractKind<SymbolEntry, Kind>,
      Exclude<keyof SymbolEntryBase, "raw"> | "kind" | keyof Template
    >,
  ): SymbolEntry {
    this.assert(
      id.parts.length > 0,
      "id-expression in a class declaration should have at least one part",
    );
    if (id.parts.length === 1) {
      const info2 = info as any;
      switch (kind) {
        case "class": {
          return this.buildSymbol("class", {
            name: id.name,
            ...info2,
          });
        }
        case "classTemplate": {
          return this.buildSymbol("classTemplate", {
            name: id.name,
            templateParams: this.buildTemplateParams(template!),
            templateRequires: template!.requiresClause,
            ...info2,
          });
        }
        case "classFullSpecialization": {
          return this.buildSymbol("classFullSpecialization", {
            name: id.name,
            ...info2,
          });
        }
        case "classPartialSpecialization": {
          return this.buildSymbol("classPartialSpecialization", {
            name: id.name,
            templateParams: this.buildTemplateParams(template!),
            templateRequires: template!.requiresClause,
            ...info2,
          });
        }
      }
    } else {
      this.die(`Unsupported nested name in class declaration: ${id.name}`);
    }
  }
}
