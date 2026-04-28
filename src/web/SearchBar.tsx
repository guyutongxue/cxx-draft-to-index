import { useSearchParams } from "react-router-dom";

export function SearchBar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";

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
        placeholder='Search symbols by name (e.g. "vector", "begin", "is_same")'
        autoFocus
      />
    </div>
  );
}
