import {
  useParams,
  useNavigate,
  Link,
  useSearchParams,
} from "react-router-dom";
import { getParamString, namespacePath, useData } from "./DataContext";
import { isFunction, SymbolDetail } from "./SymbolDetail";
import { computeMemberLocalId } from "../share/symbol_id";
import type {
  SymbolEntry,
  ClassSymbolEntry,
  UnionSymbolEntry,
} from "../share/types";
import { SymbolName } from "./SymbolName";

function hasMembers(s: SymbolEntry): s is ClassSymbolEntry | UnionSymbolEntry {
  if (typeof s !== "object" || !s) return false;
  const k = (s as SymbolEntry).kind;
  return (
    k === "class" ||
    k === "union" ||
    k === "classTemplate" ||
    k === "classFullSpecialization" ||
    k === "classPartialSpecialization"
  );
}

interface ChainEntry {
  symbol: SymbolEntry;
  id: string;
}

export function SymbolDetailPage() {
  const { symbolId, "*": splat } = useParams<{
    symbolId: string;
    "*"?: string;
  }>();
  const { topLevelMap } = useData();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  if (!symbolId) {
    return (
      <div className="symbol-detail-empty">
        Invalid URL — missing header or symbol ID.
      </div>
    );
  }

  const entry = topLevelMap.get(symbolId);
  if (!entry) {
    return (
      <div className="symbol-detail-empty">Symbol not found: {symbolId}</div>
    );
  }

  const chain: ChainEntry[] = [{ symbol: entry.symbol, id: symbolId }];

  let current: SymbolEntry = entry.symbol;

  if (splat) {
    const segments = splat.split("/").filter((s) => s.length > 0);
    for (const segId of segments) {
      const member = findMemberByLocalId(current, segId);
      if (!member) break;
      chain.push({ symbol: member, id: segId });
      current = member;
    }
  }

  const tail = chain[chain.length - 1];

  const handleMemberClick = (memberId: string) => {
    navigate(
      `/symbols/${encodeURIComponent(symbolId)}/${splat ? `${splat}/` : ""}${encodeURIComponent(memberId)}?${search}`,
    );
  };

  const parentSymbol = chain.length > 1 ? chain[chain.length - 2].symbol : null;
  const parentId = chain.length > 1 ? chain[chain.length - 2].id : null;

  let namespace = namespacePath(chain[0].symbol.namespace);
  let prefix = namespace ? namespace + "::" : "";
  let templateHeads: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const s = chain[i].symbol;
    if ("templateParams" in s) {
      templateHeads.push(s.templateParams.map((tp) => tp.raw).join(", "));
    }
    if (i < chain.length - 1) {
      prefix += s.name;
      if ("templateArgs" in s) {
        prefix += `<${s.templateArgs.join(", ")}>`;
      } else if ("templateParams" in s) {
        prefix += `<${s.templateParams.map((tp) => tp.name || "_").join(", ")}>`;
      }
      prefix += "::";
    }
  }
  prefix =
    templateHeads
      .map((th, i) => `${" ".repeat(i * 2)}template <${th}>\n`)
      .join("") + prefix;

  let postfix = "";
  if ("templateArgs" in current && current.templateArgs) {
    postfix = `<${current.templateArgs.join(", ")}>`;
  } else if (isFunction(current)) {
    postfix = getParamString(current);
  }

  return (
    <div className="detail-page">
      <Breadcrumb chain={chain} />
      {parentSymbol && parentId && (
        <div>
          <button
            className="back-btn"
            onClick={() => {
              const idChain = chain
                .slice(0, -1)
                .map((c) => encodeURIComponent(c.id))
                .join("/");
              navigate(`/symbols/${idChain}?${search}`);
            }}
          >
            &larr; Back to {<SymbolName name={parentSymbol.name} />}
          </button>
        </div>
      )}
      <SymbolDetail
        symbol={tail.symbol}
        headers={entry.headers}
        key={tail.id}
        prefix={prefix}
        postfix={postfix}
        onMemberClick={handleMemberClick}
      />
    </div>
  );
}

function findMemberByLocalId(
  parent: SymbolEntry,
  localId: string,
): SymbolEntry | null {
  if (!hasMembers(parent) || !parent.members) return null;
  for (const m of parent.members) {
    if (computeMemberLocalId(m) === localId) return m;
  }
  return null;
}

function Breadcrumb({
  chain,
}: {
  chain: { symbol: SymbolEntry; id: string }[];
}) {
  const [search] = useSearchParams();
  return (
    <div className="breadcrumb">
      {/* <Link to="/" className="breadcrumb-link">
        &lt;{header}&gt;
      </Link> */}
      {chain.map((c, i) => {
        const segments = chain
          .slice(1, i + 1)
          .map((s) => `${s.id}`)
          .join("/");
        const url =
          segments.length > 0
            ? `/symbols/${chain[0].id}/${segments}`
            : `/symbols/${chain[0].id}`;
        return (
          <span key={i}>
            <span className="breadcrumb-sep">{">"}</span>
            {i === chain.length - 1 ? (
              <span className="breadcrumb-current">
                <SymbolName name={c.symbol.name} />
              </span>
            ) : (
              <Link to={`${url}?${search}`} className="breadcrumb-link">
                <SymbolName name={c.symbol.name} />
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
