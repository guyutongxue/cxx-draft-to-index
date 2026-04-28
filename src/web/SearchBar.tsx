import { useSearchParams, Link, useNavigate } from "react-router-dom";

interface SearchBarProps {
  query: string;
  onChange: (value: string) => void;
}

export function SearchBar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const navigate = useNavigate();

  return (
    <div className="search-bar">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            setSearchParams({ q: v }, { replace: true });
          } else {
            setSearchParams({}, { replace: true });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            navigate(`/?q=${encodeURIComponent(query.trim())}`);
          }
        }}
        placeholder='Search symbols by name (e.g. "vector", "begin", "is_same")'
        autoFocus
      />
    </div>
  );
}
