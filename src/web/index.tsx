import "./styles.css";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { DataProvider } from "./DataContext";
import { Layout } from "./Layout";
import { SearchPage } from "./SearchPage";
import { SymbolDetailPage } from "./SymbolDetailPage";

const root = createRoot(document.getElementById("app")!);
root.render(
  <HashRouter>
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<SearchPage />} />
          <Route path=":header/:symbolId/*" element={<SymbolDetailPage />} />
        </Route>
      </Routes>
    </DataProvider>
  </HashRouter>,
);
