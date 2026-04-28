import type { SymbolEntry, SymbolKind, NamespaceInfo } from "../share/types";
import { hasOverloads, namespacePath, type FlatSymbol } from "./DataContext";
import { isFunction } from "./SymbolDetail";
import { SymbolName } from "./SymbolName";

export interface SymbolCardProps {
  fs: FlatSymbol;
  selected: boolean;
  onClick?: () => void;
  compact?: boolean;
}

interface BadgeInfo {
  className: string;
  text: string;
  shortText?: string;
}

export function getKindBadge(entry: SymbolEntry): BadgeInfo {
  const kind = entry.kind;
  if (kind === "class" && entry && "classKey" in entry) {
    return { className: `badge-${entry.classKey}`, text: entry.classKey };
  }
  if (kind === "classTemplate" && entry && "classKey" in entry) {
    return {
      className: `badge-${entry.classKey}`,
      text: `${entry.classKey} template`,
      shortText: `${entry.classKey} tmpl.`,
    };
  }
  if (kind === "classFullSpecialization" && entry && "classKey" in entry) {
    return {
      className: `badge-${entry.classKey}`,
      text: `${entry.classKey} specialization`,
      shortText: `${entry.classKey} spec.`,
    };
  }
  if (kind === "classPartialSpecialization" && entry && "classKey" in entry) {
    return {
      className: `badge-${entry.classKey}`,
      text: `${entry.classKey} partial specialization`,
      shortText: `${entry.classKey} partial spec.`,
    };
  }
  if ("ctor" in entry && entry.ctor) {
    return { className: "badge-function", text: "constructor" };
  }
  if ("dtor" in entry && entry.dtor) {
    return { className: "badge-function", text: "destructor" };
  }

  const map: Record<string, BadgeInfo> = {
    union: { className: "badge-union", text: "union" },
    enum: { className: "badge-enum", text: "enum" },
    typeAlias: { className: "badge-typeAlias", text: "type alias" },
    variable: { className: "badge-variable", text: "variable" },
    function: { className: "badge-function", text: "function" },
    friendType: {
      className: "badge-friend",
      text: "friend type declaration",
      shortText: "friend type",
    },
    usingDeclaration: {
      className: "badge-using",
      text: "using declaration",
      shortText: "using",
    },
    usingEnum: {
      className: "badge-using",
      text: "using enum declaration",
      shortText: "using enum",
    },
    usingDirective: {
      className: "badge-using",
      text: "using directive",
      shortText: "using ns",
    },
    namespaceAlias: {
      className: "badge-namespace",
      text: "namespace alias",
      shortText: "ns alias",
    },
    deductionGuide: { className: "badge-deduction", text: "deduction guide" },
    typeAliasTemplate: {
      className: "badge-typeAlias",
      text: "type alias template",
      shortText: "type alias tmpl.",
    },
    functionTemplate: {
      className: "badge-function",
      text: "function template",
      shortText: "function tmpl.",
    },
    variableTemplate: {
      className: "badge-variable",
      text: "variable template",
      shortText: "variable tmpl.",
    },
    concept: { className: "badge-concept", text: "concept" },
    deductionGuideTemplate: {
      className: "badge-deduction",
      text: "deduction guide template",
      shortText: "deduction guide tmpl.",
    },
    functionFullSpecialization: {
      className: "badge-function",
      text: "function full specialization",
      shortText: "function spec.",
    },
    variableFullSpecialization: {
      className: "badge-variable",
      text: "variable full specialization",
      shortText: "variable spec.",
    },
    variablePartialSpecialization: {
      className: "badge-variable",
      text: "variable partial specialization",
      shortText: "variable partial spec.",
    },
    macro: { className: "badge-macro", text: "macro" },
    functionLikeMacro: {
      className: "badge-macro",
      text: "function-like macro",
      shortText: "func-like macro",
    },
  };

  return map[kind] ?? { className: "badge-default", text: kind };
}

export function SymbolCard({
  fs,
  selected,
  compact,
  onClick,
}: SymbolCardProps) {
  const ns = namespacePath(fs.symbol.namespace);
  const badge = getKindBadge(fs.symbol);

  let paramInfo: string | null = null;
  if (isFunction(fs.symbol) && (!ns || hasOverloads(fs.symbol))) {
    paramInfo = `(${fs.symbol.parameters.map((p) => `${p.type}${p.pack ? "..." : ""}`).join(", ")}${
      fs.symbol.variadic ? "..." : ""
    }) ${fs.symbol.cvRef}`;
  }
  if ("templateArgs" in fs.symbol && fs.symbol.templateArgs) {
    paramInfo = `<${fs.symbol.templateArgs.join(", ")}>`;
  }

  return (
    <div
      className={`symbol-card${selected ? " selected" : ""}${compact ? " compact" : ""}`}
      onClick={onClick}
    >
      <div className="symbol-card-aux">
        {isFunction(fs.symbol) && fs.symbol.virtual && (
          <span className="badge badge-virtual">virtual</span>
        )}
        {isFunction(fs.symbol) && fs.symbol.friend && (
          <span className="badge badge-friend">friend</span>
        )}
        {(fs.symbol.access === "private" ||
          fs.symbol.access === "protected") && (
          <span className={`badge badge-access`}>{fs.symbol.access}</span>
        )}
        <span className={`badge ${badge.className}`}>
          {badge.shortText || badge.text}
        </span>
        {!compact && fs.headers[0] && (
          <span className="symbol-card-header">&lt;{fs.headers[0]}&gt;</span>
        )}
      </div>
      <span
        className="symbol-card-name-wrapper"
        onClick={onClick}
        title={`${ns ? ns + "::" : ""}${fs.symbol.name}`}
      >
        {ns && <span className="symbol-card-namespace">{ns}::</span>}
        <span className="symbol-card-name">
          <SymbolName name={fs.symbol.name} />
        </span>
        {paramInfo && <span className="symbol-card-params">{paramInfo}</span>}
      </span>
    </div>
  );
}
