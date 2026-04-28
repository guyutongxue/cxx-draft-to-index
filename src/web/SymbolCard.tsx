import type { SymbolEntry, SymbolKind, NamespaceInfo } from "../types";
import type { FlatSymbol } from "./DataContext";
import { SymbolName } from "./SymbolName";

export interface SymbolCardProps {
  fs: FlatSymbol;
  selected: boolean;
  onClick?: () => void;
  compact?: boolean;
}

function namespacePath(ns: NamespaceInfo[]): string {
  return ns.map((n) => n.name ?? "{anonymous}").join("::");
}

interface BadgeInfo {
  className: string;
  text: string;
}

function getKindBadge(kind: SymbolKind, entry?: SymbolEntry): BadgeInfo {
  if (kind === "class" && entry && "classKey" in entry) {
    return { className: `badge-${entry.classKey}`, text: entry.classKey };
  }
  if (kind === "classTemplate" && entry && "classKey" in entry) {
    return {
      className: `badge-${entry.classKey}`,
      text: `${entry.classKey} template`,
    };
  }
  if (kind === "classFullSpecialization" && entry && "classKey" in entry) {
    return {
      className: `badge-${entry.classKey}`,
      text: `${entry.classKey} spec.`,
    };
  }
  if (kind === "classPartialSpecialization" && entry && "classKey" in entry) {
    return {
      className: `badge-${entry.classKey}`,
      text: `${entry.classKey} part. spec.`,
    };
  }

  const map: Record<string, BadgeInfo> = {
    union: { className: "badge-union", text: "union" },
    enum: { className: "badge-enum", text: "enum" },
    typeAlias: { className: "badge-typeAlias", text: "type alias" },
    variable: { className: "badge-variable", text: "variable" },
    function: { className: "badge-function", text: "function" },
    friendType: { className: "badge-friend", text: "friend type" },
    usingDeclaration: { className: "badge-using", text: "using" },
    usingEnum: { className: "badge-using", text: "using enum" },
    usingDirective: { className: "badge-using", text: "using ns" },
    namespaceAlias: { className: "badge-namespace", text: "ns alias" },
    deductionGuide: { className: "badge-deduction", text: "deduction guide" },
    concept: { className: "badge-concept", text: "concept" },
    macro: { className: "badge-macro", text: "macro" },
    functionLikeMacro: { className: "badge-macro", text: "func-like macro" },
    typeAliasTemplate: {
      className: "badge-typeAlias",
      text: "type alias tmpl.",
    },
    functionTemplate: {
      className: "badge-function",
      text: "function template",
    },
    variableTemplate: {
      className: "badge-variable",
      text: "variable template",
    },
    deductionGuideTemplate: {
      className: "badge-deduction",
      text: "deduction guide tmpl.",
    },
    functionFullSpecialization: {
      className: "badge-function",
      text: "function spec.",
    },
    variableFullSpecialization: {
      className: "badge-variable",
      text: "variable spec.",
    },
    classFullSpecialization: {
      className: "badge-class",
      text: "class spec.",
    },
    classPartialSpecialization: {
      className: "badge-class",
      text: "class partial spec.",
    },
    variablePartialSpecialization: {
      className: "badge-variable",
      text: "variable partial spec.",
    },
  };

  return map[kind] ?? { className: "badge-default", text: kind };
}

export function SymbolCard(props: SymbolCardProps) {
  return (
    <div
      className={`symbol-card${props.selected ? " selected" : ""}${props.compact ? " compact" : ""}`}
      onClick={props.onClick}
    >
      {" "}
      <SymbolCardContent {...props} onClick={void 0} />
    </div>
  );
}

export function SymbolCardContent({ fs, compact, onClick }: SymbolCardProps) {
  const ns = namespacePath(fs.symbol.namespace);
  const badge = getKindBadge(fs.symbol.kind, fs.symbol);

  return (
    <>
      <div className="symbol-card-aux">
        {ns && <span className="symbol-card-namespace">{ns}</span>}
        <span className={`badge ${badge.className}`}>{badge.text}</span>
        {!compact && (
          <span className="symbol-card-header">&lt;{fs.header}&gt;</span>
        )}
      </div>
      <span className="symbol-card-name" onClick={onClick}>
        <SymbolName name={fs.symbol.name} />
      </span>
    </>
  );
}
