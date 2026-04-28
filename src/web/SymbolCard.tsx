import type { SymbolEntry, SymbolKind, NamespaceInfo } from "../types";
import type { FlatSymbol } from "./DataContext";

export interface SymbolCardProps {
  fs: FlatSymbol;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}

function namespacePath(ns: NamespaceInfo[]): string {
  return ns
    .map((n) => n.name ?? "{anonymous}")
    .join("::");
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
    return { className: `badge-${entry.classKey}`, text: `${entry.classKey} spec.` };
  }
  if (kind === "classPartialSpecialization" && entry && "classKey" in entry) {
    return { className: `badge-${entry.classKey}`, text: `${entry.classKey} part. spec.` };
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

export function SymbolCard({ fs, selected, onClick, compact }: SymbolCardProps) {
  const badge = getKindBadge(fs.symbol.kind, fs.symbol);
  const ns = namespacePath(fs.symbol.namespace);

  return (
    <div
      className={`symbol-card${selected ? " selected" : ""}${compact ? " compact" : ""}`}
      onClick={onClick}
    >
      <span className="symbol-card-name">{fs.symbol.name}</span>
      <div className="symbol-card-right">
        {ns && <span className="symbol-card-namespace">{ns}</span>}
        <span className={`badge ${badge.className}`}>{badge.text}</span>
        {!compact && (
          <span className="symbol-card-header">&lt;{fs.header}&gt;</span>
        )}
      </div>
    </div>
  );
}
