import { Outlet } from "react-router-dom";
import { useData } from "./DataContext";
import { SearchBar } from "./SearchBar";

export function Layout() {
  const { data, allSymbols } = useData();

  return (
    <div className="app">
      <div className="app-header">
        <span className="app-title">C++ Standard Library Index</span>
        <span className="app-stats">
          {data?.headers.length ?? 0} headers, {allSymbols.length} symbols
        </span>
      </div>
      <SearchBar />
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
