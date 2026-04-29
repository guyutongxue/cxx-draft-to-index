import type { SymbolEntry, SymbolKind, NamespaceInfo } from "../share/types";
import {
  getParamString,
  hasOverloads,
  namespacePath,
  type FlatSymbol,
} from "./DataContext";
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
  let descriptiveName = "";
  if ("classKey" in entry) {
    descriptiveName = entry.classKey;
  }
  if ("constexpr" in entry && "type" in entry) {
    descriptiveName = entry.constexpr ? "constant" : "variable";
  }
  if ("ctor" in entry && entry.ctor) {
    descriptiveName = "constructor";
  } else if ("dtor" in entry && entry.dtor) {
    descriptiveName = "destructor";
  } else if ("operator" in entry && entry.operator) {
    descriptiveName = entry.name.includes(`""`)
      ? "udl"
      : /\w/.test(entry.operator) &&
          entry.operator !== "new" &&
          entry.operator !== "delete"
        ? "conversion"
        : "operator";
  }

  const map: Record<SymbolKind, BadgeInfo> = {
    union: { className: "badge-union", text: "union" },
    enum: { className: "badge-enum", text: "enum" },
    typeAlias: { className: "badge-typeAlias", text: "type alias" },
    variable: { className: "badge-variable", text: descriptiveName },
    function: {
      className: "badge-function",
      text: descriptiveName || "function",
    },
    class: { className: "badge-class", text: descriptiveName },
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
      text: `${descriptiveName || "function"} template`,
      shortText: `${descriptiveName || "function"} tmpl.`,
    },
    concept: { className: "badge-concept", text: "concept" },
    deductionGuideTemplate: {
      className: "badge-deduction",
      text: "deduction guide template",
      shortText: "deduction guide tmpl.",
    },
    functionFullSpecialization: {
      className: "badge-function",
      text: `${descriptiveName || "function"} full specialization`,
      shortText: `${descriptiveName || "function"} spec.`,
    },
    variableTemplate: {
      className: "badge-variable",
      text: `${descriptiveName} template`,
      shortText: `${descriptiveName} tmpl.`,
    },
    variablePartialSpecialization: {
      className: "badge-variable",
      text: `${descriptiveName} partial specialization`,
      shortText: `${descriptiveName} partial spec.`,
    },
    variableFullSpecialization: {
      className: "badge-variable",
      text: `${descriptiveName} full specialization`,
      shortText: `${descriptiveName} full spec.`,
    },
    classTemplate: {
      className: "badge-class",
      text: `${descriptiveName} template`,
      shortText: `${descriptiveName} tmpl.`,
    },
    classPartialSpecialization: {
      className: "badge-class",
      text: `${descriptiveName} partial specialization`,
      shortText: `${descriptiveName} partial spec.`,
    },
    classFullSpecialization: {
      className: "badge-class",
      text: `${descriptiveName} full specialization`,
      shortText: `${descriptiveName} full spec.`,
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
    paramInfo = getParamString(fs.symbol);
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
        {(fs.symbol.access === "private" ||
          fs.symbol.access === "protected") && (
          <span className={`badge badge-access`}>{fs.symbol.access}</span>
        )}
        {isFunction(fs.symbol) && fs.symbol.virtual && (
          <span className="badge badge-virtual">virtual</span>
        )}
        {isFunction(fs.symbol) && fs.symbol.friend && (
          <span className="badge badge-friend">friend</span>
        )}
        {fs.symbol.access && "static" in fs.symbol && fs.symbol.static && (
          <span className="badge badge-static">static</span>
        )}
        <span className={`badge ${badge.className}`}>
          {badge.shortText || badge.text}
        </span>
        {ns && fs.headers[0] && (
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
