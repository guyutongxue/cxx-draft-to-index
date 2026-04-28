import {
  Outlet,
  useSearchParams,
  useNavigate,
  useMatch,
} from "react-router-dom";
import { useMemo } from "react";
import { FlatSymbol, useData } from "./DataContext";
import { SearchBar } from "./SearchBar";
import { SymbolCard } from "./SymbolCard";
import { SymbolEntry } from "../share/types";

export function Layout() {
  const { data, allSymbols } = useData();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const navigate = useNavigate();
  const detailMatch = useMatch("symbols/:symbolId/*");

  const filteredSymbols = useMemo(() => {
    // if (!query.trim()) return allSymbols;
    const q = query.toLowerCase();
    const results = allSymbols.filter((fs) =>
      fs.symbol.name.toLowerCase().includes(q),
    );
    const rank = (s: SymbolEntry) => {
      let name = s.name.toLowerCase();
      let rank = 0;
      if (!name) {
        rank = Number.POSITIVE_INFINITY;
      }
      if (name.startsWith("__") && !name.endsWith("__")) {
        name = name.slice(2);
        rank += 10;
      }
      rank += name === q ? 0 : name.startsWith(q) ? 1 : 2;
      return rank;
    };
    results.sort((a, b) => {
      const rankA = rank(a.symbol);
      const rankB = rank(b.symbol);
      if (rankA !== rankB) return rankA - rankB;
      const nameA = a.symbol.name.toLowerCase();
      const nameB = b.symbol.name.toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return results;
  }, [allSymbols, query]);

  const currentSymbolId = detailMatch?.params.symbolId ?? null;

  return (
    <div className="app">
      <div className="app-header">
        <span className="app-title">C++ Standard Library Index</span>
        <span className="app-stats">
          {data?.headers.length ?? 0} headers, {allSymbols.length} symbols
        </span>
      </div>
      <div className="main-content">
        <div className="symbol-list-panel">
          <SearchBar />
          <div className="symbol-list">
            <SidebarContent
              symbols={filteredSymbols}
              query={query}
              isEmpty={allSymbols.length === 0}
              currentSymbolId={currentSymbolId}
              onNavigate={(fs) => {
                const target = `/symbols/${encodeURIComponent(fs.key)}`;
                navigate(
                  query ? `${target}?q=${encodeURIComponent(query)}` : target,
                );
              }}
            />
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

function SidebarContent({
  symbols,
  query,
  isEmpty,
  currentSymbolId,
  onNavigate,
}: {
  symbols: FlatSymbol[];
  query: string;
  isEmpty: boolean;
  currentSymbolId: string | null;
  onNavigate: (fs: FlatSymbol) => void;
}) {
  if (isEmpty) {
    return <div className="symbol-list-empty">No symbols loaded.</div>;
  }

  // if (!query.trim()) {
  //   return (
  //     <div className="symbol-list-empty">
  //       Enter a search term to find symbols.
  //     </div>
  //   );
  // }

  if (symbols.length === 0) {
    return (
      <div className="symbol-list-empty">
        No symbols match <strong>&ldquo;{query}&rdquo;</strong>
        <p>Try a different search term.</p>
      </div>
    );
  }

  return symbols.map((fs) => {
    return (
      <SymbolCard
        key={fs.key}
        fs={fs}
        selected={currentSymbolId === fs.key}
        onClick={() => onNavigate(fs)}
      />
    );
  });
}
