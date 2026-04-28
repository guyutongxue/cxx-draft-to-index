import type {
  SymbolEntry,
  SymbolKind,
  ClassSymbolEntry,
  UnionSymbolEntry,
  EnumSymbolEntry,
  FunctionSymbolEntry,
  VariableSymbolEntry,
  ClassMemberEntry,
  NamespaceInfo,
  Parameter,
} from "../types";
import { SymbolCard } from "./SymbolCard";
import type { FlatSymbol } from "./App";

interface SymbolDetailProps {
  selected: FlatSymbol | null;
}

function namespacePath(ns: NamespaceInfo[]): string {
  return ns.map((n) => n.name ?? "{anonymous}").join("::");
}

function isTemplate(kind: SymbolKind): boolean {
  return kind.endsWith("Template") || kind.endsWith("PartialSpecialization");
}

function isSpecialization(kind: SymbolKind): boolean {
  return (
    kind.endsWith("FullSpecialization") ||
    kind.endsWith("PartialSpecialization")
  );
}

function hasMembers(s: SymbolEntry): s is ClassSymbolEntry | UnionSymbolEntry {
  return (
    (s.kind === "class" ||
      s.kind === "union" ||
      s.kind === "classTemplate" ||
      s.kind === "classFullSpecialization" ||
      s.kind === "classPartialSpecialization") &&
    "members" in s
  );
}

function hasEnumerators(s: SymbolEntry): s is EnumSymbolEntry {
  return s.kind === "enum";
}

function isFunction(s: SymbolEntry): s is FunctionSymbolEntry {
  return (
    s.kind === "function" ||
    s.kind === "functionTemplate" ||
    s.kind === "functionFullSpecialization"
  );
}

function isVariable(s: SymbolEntry): s is VariableSymbolEntry {
  return (
    s.kind === "variable" ||
    s.kind === "variableTemplate" ||
    s.kind === "variableFullSpecialization" ||
    s.kind === "variablePartialSpecialization"
  );
}

function getKindLabel(kind: SymbolKind, entry: SymbolEntry): string {
  if (kind === "class" && "classKey" in entry) return entry.classKey;
  if (kind === "classTemplate" && "classKey" in entry)
    return `${entry.classKey} template`;
  if (kind === "classFullSpecialization" && "classKey" in entry)
    return `${entry.classKey} full specialization`;
  if (kind === "classPartialSpecialization" && "classKey" in entry)
    return `${entry.classKey} partial specialization`;

  const labels: Record<string, string> = {
    union: "union",
    enum: "enum",
    typeAlias: "type alias",
    variable: "variable",
    function: "function",
    friendType: "friend type declaration",
    usingDeclaration: "using declaration",
    usingEnum: "using enum declaration",
    usingDirective: "using directive",
    namespaceAlias: "namespace alias",
    deductionGuide: "deduction guide",
    typeAliasTemplate: "type alias template",
    functionTemplate: "function template",
    classTemplate: "class template",
    variableTemplate: "variable template",
    concept: "concept",
    deductionGuideTemplate: "deduction guide template",
    functionFullSpecialization: "function full specialization",
    variableFullSpecialization: "variable full specialization",
    classFullSpecialization: "class full specialization",
    classPartialSpecialization: "class partial specialization",
    variablePartialSpecialization: "variable partial specialization",
    macro: "macro",
    functionLikeMacro: "function-like macro",
  };
  return labels[kind] ?? kind;
}

function ParamTable({ params }: { params: (Parameter | string)[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Default</th>
          <th>Pack</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p, i) =>
          typeof p === "string" ? (
            <tr key={i}>
              <td colSpan={4} className="dim">
                {p}
              </td>
            </tr>
          ) : (
            <tr key={i}>
              <td className="name-col">{p.name ?? ""}</td>
              <td>{p.type || p.raw}</td>
              <td className="dim">{p.defaultArg ?? ""}</td>
              <td className="dim">{p.pack ? "yes" : ""}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function MembersSection({
  members,
  header,
}: {
  members: ClassMemberEntry[];
  header: string;
}) {
  return (
    <div className="symbol-detail-section">
      <div className="symbol-detail-section-title">
        Members ({members.length})
      </div>
      {members.map((m, i) => {
        const key = `${m.name}:${m.kind}:${i}`;
        return (
          <SymbolCard
            key={key}
            fs={{ symbol: m, header }}
            selected={false}
            onClick={() => {}}
            compact
          />
        );
      })}
    </div>
  );
}

export function SymbolDetail({ selected }: SymbolDetailProps) {
  if (!selected) {
    return (
      <div className="symbol-detail-empty">
        Select a symbol from the list to view details.
      </div>
    );
  }

  const { symbol, header: headerName } = selected;
  const ns = namespacePath(symbol.namespace);

  const showTemplate = isTemplate(symbol.kind) && "templateParams" in symbol;
  const showSpecialization =
    isSpecialization(symbol.kind) && "templateArgs" in symbol;
  const showMembers =
    hasMembers(symbol) && symbol.members && symbol.members.length > 0;
  const showEnumerators = hasEnumerators(symbol) && symbol.enumerators;
  const showFunction = isFunction(symbol);
  const showVariable = isVariable(symbol);

  return (
    <div className="symbol-detail-panel">
      <div className="symbol-detail-header">
        <div className="symbol-detail-name">{symbol.name}</div>
        {ns && <div className="symbol-detail-namespace">namespace {ns}</div>}
        <div className="symbol-detail-badges">
          <span className="badge badge-tag">&lt;{headerName}&gt;</span>
          <span className="badge badge-default">
            {getKindLabel(symbol.kind, symbol)}
          </span>
          {symbol.languageLinkage && (
            <span className="badge badge-tag">
              extern "{symbol.languageLinkage}"
            </span>
          )}
          {showFunction && isFunction(symbol) && symbol.constexpr && (
            <span className="badge badge-concept">constexpr</span>
          )}
          {showFunction && isFunction(symbol) && symbol.explicit && (
            <span className="badge badge-enum">explicit</span>
          )}
          {showFunction && isFunction(symbol) && symbol.friend && (
            <span className="badge badge-friend">friend</span>
          )}
          {showFunction && isFunction(symbol) && symbol.operator && (
            <span className="badge badge-deduction">
              operator{symbol.operator === '""ms' ? '""...' : symbol.operator}
            </span>
          )}
          {showVariable && isVariable(symbol) && symbol.constexpr && (
            <span className="badge badge-concept">constexpr</span>
          )}
          {showVariable && isVariable(symbol) && symbol.inline && (
            <span className="badge badge-concept">inline</span>
          )}
          {showVariable && isVariable(symbol) && symbol.extern && (
            <span className="badge badge-tag">extern</span>
          )}
          {showFunction && isFunction(symbol) && symbol.variadic && (
            <span className="badge badge-tag">variadic</span>
          )}
          {"syntax" in symbol && symbol.syntax === "typedef" && (
            <span className="badge badge-enum">typedef</span>
          )}
          {hasEnumerators(symbol) && symbol.scoped && (
            <span className="badge badge-class">scoped</span>
          )}
        </div>
      </div>

      {showTemplate && "templateParams" in symbol && (
        <div className="symbol-detail-section">
          <div className="symbol-detail-section-title">
            Template Parameters ({symbol.templateParams.length})
          </div>
          <ParamTable params={symbol.templateParams} />
          {"templateRequires" in symbol && symbol.templateRequires && (
            <div style={{ marginTop: 8 }}>
              <span className="meta-label">requires </span>
              <code>{symbol.templateRequires}</code>
            </div>
          )}
        </div>
      )}

      {showSpecialization && "templateArgs" in symbol && (
        <div className="symbol-detail-section">
          <div className="symbol-detail-section-title">
            Template Arguments ({symbol.templateArgs.length})
          </div>
          <div className="meta-grid">
            {symbol.templateArgs.map((arg, i) => (
              <div key={i} className="meta-value">
                {arg}
              </div>
            ))}
          </div>
        </div>
      )}

      {showFunction && isFunction(symbol) && (
        <div className="symbol-detail-section">
          <div className="symbol-detail-section-title">Signature</div>
          <div className="meta-grid">
            <span className="meta-label">Return type</span>
            <span className="meta-value">
              {symbol.returnType || "(ctor/dtor)"}
            </span>
            {symbol.isTrailingReturnType && (
              <>
                <span className="meta-label">Style</span>
                <span className="meta-value">trailing return type</span>
              </>
            )}
            <span className="meta-label">Parameters</span>
            <span className="meta-value">{symbol.parameters.length}</span>
          </div>
          {symbol.parameters.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <ParamTable params={symbol.parameters} />
            </div>
          )}
          {symbol.signatureRequires && (
            <div style={{ marginTop: 8 }}>
              <span className="meta-label">requires </span>
              <code>{symbol.signatureRequires}</code>
            </div>
          )}
        </div>
      )}

      {showVariable && isVariable(symbol) && (
        <div className="symbol-detail-section">
          <div className="symbol-detail-section-title">Type</div>
          <code className="meta-value">{symbol.type}</code>
        </div>
      )}

      {"base" in symbol &&
        Array.isArray(symbol.base) &&
        symbol.base.length > 0 && (
          <div className="symbol-detail-section">
            <div className="symbol-detail-section-title">Base Classes</div>
            <div className="meta-grid">
              {symbol.base.map((b, i) => (
                <div key={i} className="meta-value">
                  {b}
                </div>
              ))}
            </div>
          </div>
        )}

      {"target" in symbol && typeof symbol.target === "string" && (
        <div className="symbol-detail-section">
          <div className="symbol-detail-section-title">Target</div>
          <code className="meta-value">{symbol.target}</code>
        </div>
      )}

      {"targetNamespace" in symbol &&
        typeof symbol.targetNamespace === "string" && (
          <div className="symbol-detail-section">
            <div className="symbol-detail-section-title">Target Namespace</div>
            <code className="meta-value">{symbol.targetNamespace}</code>
          </div>
        )}

      {"targetType" in symbol && typeof symbol.targetType === "string" && (
        <div className="symbol-detail-section">
          <div className="symbol-detail-section-title">Target Type</div>
          <code className="meta-value">{symbol.targetType}</code>
        </div>
      )}

      {showEnumerators && hasEnumerators(symbol) && (
        <div className="symbol-detail-section">
          <div className="symbol-detail-section-title">
            Enumerators ({symbol.enumerators!.length})
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {symbol.enumerators!.map((e, i) => (
                <tr key={i}>
                  <td className="name-col">{e.name}</td>
                  <td className="dim">{e.value ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {"parameters" in symbol &&
        !showTemplate &&
        !isFunction(symbol) &&
        Array.isArray(symbol.parameters) &&
        symbol.parameters.length > 0 && (
          <div className="symbol-detail-section">
            <div className="symbol-detail-section-title">
              Parameters ({symbol.parameters.length})
            </div>
            <ParamTable params={symbol.parameters} />
          </div>
        )}

      <div className="symbol-detail-section">
        <div className="symbol-detail-section-title">Raw Code</div>
        <pre className="code-block">{symbol.raw}</pre>
      </div>

      {showMembers && hasMembers(symbol) && symbol.members && (
        <MembersSection members={symbol.members} header={headerName} />
      )}
    </div>
  );
}
