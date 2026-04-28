import { useParams, useNavigate, Link } from "react-router-dom";
import { useData } from "./DataContext";
import { SymbolDetail } from "./SymbolDetail";
import { computeMemberLocalId } from "./symbol_id";
import type { SymbolEntry, ClassSymbolEntry, UnionSymbolEntry } from "../types";

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

  const handleMemberClick = (memberSymbol: SymbolEntry) => {
    const localId = computeMemberLocalId(memberSymbol);
    const base = `/symbols/${symbolId}`;
    const memberSegments = chain
      .slice(1)
      .map((c) => `${c.id}`)
      .join("/");
    const prefix = memberSegments ? `${base}/${memberSegments}` : base;
    navigate(`${prefix}/${localId}`);
  };

  const parentSymbol = chain.length > 1 ? chain[chain.length - 2].symbol : null;
  const parentId = chain.length > 1 ? chain[chain.length - 2].id : null;

  return (
    <div className="detail-page">
      <Breadcrumb chain={chain} />
      {parentSymbol && parentId && (
        <div className="symbol-detail-section">
          <button
            className="back-btn"
            onClick={() => {
              const idChain = chain
                .slice(0, -1)
                .map((c) => c.id)
                .join("/");
              navigate(`/symbols/${idChain}`);
            }}
          >
            ← Back to {parentSymbol.name}
          </button>
        </div>
      )}
      <SymbolDetail
        symbol={tail.symbol}
        header={entry.header}
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
              <span className="breadcrumb-current">{c.symbol.name}</span>
            ) : (
              <Link to={url} className="breadcrumb-link">
                {c.symbol.name}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
