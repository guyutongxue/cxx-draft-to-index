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
  TemplateParameter,
} from "../share/types";
import { getKindBadge, namespacePath, SymbolCardContent } from "./SymbolCard";
import { SymbolName } from "./SymbolName";
import { computeMemberLocalId } from "../share/symbol_id";
import { FlatSymbol } from "./DataContext";

interface SymbolDetailProps extends FlatSymbol {
  onMemberClick?: (symbolId: string) => void;
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

function ParamTable({
  params,
}: {
  params: (Parameter | TemplateParameter | string)[];
}) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Name</th>
          <th>Default</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p, i) =>
          typeof p === "string" ? (
            <tr key={i}>
              <td colSpan={3} className="dim">
                {p}
              </td>
            </tr>
          ) : (
            <tr key={i}>
              <td>
                <SymbolName
                  name={
                    "templateParams" in p && p.templateParams
                      ? `template <${p.templateParams.map((pp) => pp.raw).join(", ")}> ${p.kind === "ttConcept" ? "concept" : p.kind === "ttType" ? "class" : "auto"}`
                      : p.type || "typename"
                  }
                />
                {p.pack && "..."}
              </td>
              <td className="name-col">{p.name ?? ""}</td>
              <td className="dim">{p.defaultArg ?? ""}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function MembersSection({
  members,
  headers,
  selectedMemberId,
  onMemberClick,
}: {
  members: ClassMemberEntry[];
  headers: string[];
  selectedMemberId: string | null;
  onMemberClick?: (symbolId: string) => void;
}) {
  return (
    <div className="symbol-detail-section">
      <div className="symbol-detail-section-title">
        Members ({members.length})
      </div>
      <div className="member-list">
        {members.map((m, i) => {
          const symbolId = computeMemberLocalId(m);
          return (
            <SymbolCardContent
              key={symbolId}
              fs={{ symbol: m, key: symbolId, headers }}
              selected={selectedMemberId === symbolId}
              onClick={() => onMemberClick?.(symbolId)}
              compact
            />
          );
        })}
      </div>
    </div>
  );
}

export function SymbolDetail({
  symbol,
  headers,
  onMemberClick,
}: SymbolDetailProps) {
  const ns = namespacePath(symbol.namespace);
  const badge = getKindBadge(symbol);

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
        <div className="symbol-detail-name">
          <SymbolName name={symbol.name} />
        </div>
        {ns && <div className="symbol-detail-namespace">namespace {ns}</div>}
        <div className="symbol-detail-badges">
          {headers.map((header) => (
            <span className="badge badge-tag" key={header}>
              &lt;{header}&gt;
            </span>
          ))}
          <span className={`badge ${badge.className}`}>{badge.text}</span>
          {symbol.languageLinkage && (
            <span className="badge badge-tag">
              extern "{symbol.languageLinkage}"
            </span>
          )}
          {showFunction && symbol.constexpr && (
            <span className="badge badge-concept">constexpr</span>
          )}
          {showFunction && symbol.explicit && (
            <span className="badge badge-enum">explicit</span>
          )}
          {showFunction && symbol.friend && (
            <span className="badge badge-friend">friend</span>
          )}
          {showFunction && symbol.operator && (
            <span className="badge badge-deduction">
              operator{symbol.operator === '""ms' ? '""...' : symbol.operator}
            </span>
          )}
          {showVariable && symbol.constexpr && (
            <span className="badge badge-concept">constexpr</span>
          )}
          {showVariable && symbol.inline && (
            <span className="badge badge-concept">inline</span>
          )}
          {showVariable && symbol.extern && (
            <span className="badge badge-tag">extern</span>
          )}
          {showFunction && symbol.variadic && (
            <span className="badge badge-tag">variadic</span>
          )}
          {showFunction && symbol.ctor && (
            <span className="badge badge-tag">constructor</span>
          )}
          {showFunction && symbol.dtor && (
            <span className="badge badge-tag">destructor</span>
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
          {symbol.returnType && (
            <div className="meta-grid">
              <span className="meta-label">Return type</span>
              <span className="meta-value">{symbol.returnType}</span>
            </div>
          )}
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
        <MembersSection
          members={symbol.members}
          headers={headers}
          selectedMemberId={null}
          onMemberClick={onMemberClick}
        />
      )}
    </div>
  );
}
