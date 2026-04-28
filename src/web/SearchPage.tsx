import { useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useData } from "./DataContext";
import { SymbolCard } from "./SymbolCard";
import { computeSymbolId } from "./symbol_id";

export function SearchPage() {
  const { allSymbols } = useData();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const navigate = useNavigate();

  const filteredSymbols = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allSymbols.filter((fs) =>
      fs.symbol.name.toLowerCase().includes(q),
    );
  }, [allSymbols, query]);

  if (allSymbols.length === 0) {
    return (
      <div className="symbol-list-panel">
        <div className="symbol-list-empty">No symbols loaded.</div>
      </div>
    );
  }

  if (!query.trim()) {
    return (
      <div className="symbol-list-panel">
        <div className="symbol-list-empty">
          Enter a search term to find symbols.
        </div>
      </div>
    );
  }

  if (filteredSymbols.length === 0) {
    return (
      <div className="symbol-list-panel">
        <div className="symbol-list-empty">
          No symbols match <strong>&ldquo;{query}&rdquo;</strong>
          <p>Try a different search term.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="symbol-list-panel">
      {filteredSymbols.map((fs, i) => {
        const key = `${fs.header}:${fs.symbol.name}:${i}`;
        const symbolId = computeSymbolId(fs.symbol);
        return (
          <SymbolCard
            key={key}
            fs={fs}
            selected={false}
            onClick={() => navigate(`/${fs.header}/${symbolId}`)}
          />
        );
      })}
    </div>
  );
}
