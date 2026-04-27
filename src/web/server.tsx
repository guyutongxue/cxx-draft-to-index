/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment, escapeHtml } from "./jsx";
import { resolve } from "node:path";
import type { Child } from "./jsx";

const INDEX_PATH = resolve(import.meta.dir, "../../dist/std-index.json");
const PORT = parseInt(Bun.env["PORT"] ?? "3000");

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:     #0d1117;
  --bg2:    #161b22;
  --bg3:    #1c2128;
  --bg4:    #21262d;
  --border: #30363d;
  --text:   #e6edf3;
  --text2:  #8b949e;
  --text3:  #6e7681;
  --accent: #58a6ff;
  --red:    #f85149;

  --c-blue:   #58a6ff;
  --c-purple: #bc8cff;
  --c-orange: #ffa657;
  --c-green:  #3fb950;
  --c-teal:   #39d353;
  --c-yellow: #e3b341;
  --c-pink:   #f778ba;
  --c-gray:   #8b949e;
  --c-cyan:   #79c0ff;
}

html, body { height: 100%; overflow: hidden; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 14px;
  background: var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
}

#app { display: flex; flex-direction: column; height: 100vh; }

/* ---- Top bar ---- */
#topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 10;
}

#logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

#logo-icon {
  font-size: 18px;
  line-height: 1;
}

#logo-text {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

#search-wrap { flex: 1; max-width: 400px; }

#search-input {
  width: 100%;
  padding: 6px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
#search-input:focus { border-color: var(--accent); }
#search-input::placeholder { color: var(--text3); }

#meta-text { font-size: 12px; color: var(--text2); white-space: nowrap; }

/* ---- Layout ---- */
#layout { display: flex; flex: 1; overflow: hidden; }

/* ---- Sidebar ---- */
#sidebar {
  width: 230px;
  flex-shrink: 0;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#sidebar-title {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

#header-list {
  overflow-y: auto;
  flex: 1;
  padding: 4px 0;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 14px;
  background: none;
  border: none;
  color: var(--text2);
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s, color 0.1s;
}
.header-btn:hover { background: var(--bg4); color: var(--text); }
.header-btn.active { background: var(--bg3); color: var(--accent); }

.sym-count {
  font-size: 10px;
  color: var(--text3);
  background: var(--bg4);
  border-radius: 8px;
  padding: 1px 5px;
  flex-shrink: 0;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.header-btn.active .sym-count { color: var(--text2); }

.sidebar-loading { padding: 14px; color: var(--text2); font-size: 13px; }

/* ---- Main content ---- */
#content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

.hidden { display: none !important; }

/* Welcome screen */
#welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--text2);
  text-align: center;
  padding: 40px;
}
#welcome h2 { color: var(--text); font-size: 20px; font-weight: 600; }
#welcome p  { font-size: 13px; line-height: 1.6; max-width: 480px; }
#error-msg  { color: var(--red); font-family: monospace; font-size: 13px; }

/* Symbol view */
#symbol-view { display: flex; flex-direction: column; height: 100%; }

#symbol-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 12px 20px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
#header-title {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 16px;
  font-weight: 600;
}
#symbol-count { font-size: 12px; color: var(--text2); }

/* Kind filter strip */
#kind-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  min-height: 40px;
}
.kind-filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text2);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s;
}
.kind-filter:hover { border-color: var(--text2); color: var(--text); }
.kind-filter.active { border-color: var(--accent); color: var(--accent); background: rgba(88,166,255,.08); }

.kind-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Symbol table */
#symbol-table-wrap { flex: 1; overflow: auto; }

#symbol-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: auto;
}
#symbol-table thead {
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 5;
}
#symbol-table th {
  text-align: left;
  padding: 7px 14px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text2);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
#symbol-table td {
  padding: 5px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
#symbol-table tr:hover td { background: var(--bg3); }

.col-name { width: 1%; white-space: nowrap; }
.col-name code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--text);
  font-size: 13px;
}
.col-kind { width: 1%; white-space: nowrap; }
.col-ns { width: 1%; white-space: nowrap; }
.col-ns code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  color: var(--text2);
}
.col-raw { }
.col-raw code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  color: var(--text2);
  white-space: pre-wrap;
  word-break: break-word;
  display: block;
}

.muted { color: var(--text3); font-size: 12px; }
.no-results { text-align: center; padding: 40px; color: var(--text2); font-size: 13px; }

/* Kind badges */
.kind-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.kind-blue   { background: rgba( 88,166,255,.12); color: var(--c-blue);   }
.kind-purple { background: rgba(188,140,255,.12); color: var(--c-purple); }
.kind-orange { background: rgba(255,166, 87,.12); color: var(--c-orange); }
.kind-green  { background: rgba( 63,185, 80,.12); color: var(--c-green);  }
.kind-teal   { background: rgba( 57,211, 83,.12); color: var(--c-teal);   }
.kind-yellow { background: rgba(227,179, 65,.12); color: var(--c-yellow); }
.kind-pink   { background: rgba(247,120,186,.12); color: var(--c-pink);   }
.kind-gray   { background: rgba(139,148,158,.12); color: var(--c-gray);   }
.kind-cyan   { background: rgba(121,192,255,.12); color: var(--c-cyan);   }

.kind-dot.kind-blue   { background: var(--c-blue);   }
.kind-dot.kind-purple { background: var(--c-purple); }
.kind-dot.kind-orange { background: var(--c-orange); }
.kind-dot.kind-green  { background: var(--c-green);  }
.kind-dot.kind-teal   { background: var(--c-teal);   }
.kind-dot.kind-yellow { background: var(--c-yellow); }
.kind-dot.kind-pink   { background: var(--c-pink);   }
.kind-dot.kind-gray   { background: var(--c-gray);   }
.kind-dot.kind-cyan   { background: var(--c-cyan);   }

/* Scrollbars */
::-webkit-scrollbar { width: 7px; height: 7px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--text3); }
`;

// ---------------------------------------------------------------------------
// Client-side script (plain JS, no template literals to avoid escaping issues)
// ---------------------------------------------------------------------------

const CLIENT_SCRIPT = `
(function () {
  "use strict";

  var indexData = null;
  var currentHeader = null;
  var searchQuery = "";
  var activeKinds = new Set();

  // ---- Utilities ----

  function escHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatKind(kind) {
    // "functionTemplate" -> "function template"
    return kind.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  }

  function kindColor(kind) {
    if (kind === "functionLikeMacro" || kind === "macro") return "pink";
    if (kind === "concept") return "yellow";
    if (kind === "friendType") return "gray";
    if (kind.startsWith("deductionGuide")) return "cyan";
    if (kind.startsWith("function")) return "blue";
    if (kind.startsWith("class") || kind.startsWith("union")) return "purple";
    if (kind.startsWith("enum")) return "orange";
    if (kind.startsWith("variable")) return "green";
    if (kind.startsWith("typeAlias")) return "teal";
    return "gray";
  }

  function renderNs(ns) {
    if (!ns || ns.length === 0) return "";
    return ns.map(function (n) { return n.name || "(anon)"; }).join("::");
  }

  // ---- Fetch index ----

  fetch("/api/index.json")
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          var msg = (data && data.error) ? data.error : "Failed to load index (HTTP " + res.status + ").";
          document.getElementById("error-msg").textContent = msg;
        });
      }
      return res.json().then(onIndexLoaded);
    })
    .catch(function (err) {
      document.getElementById("error-msg").textContent = "Network error: " + err.message;
    });

  function onIndexLoaded(data) {
    if (!data || !Array.isArray(data.headers)) return;
    indexData = data;

    var totalSymbols = data.headers.reduce(function (s, h) { return s + h.symbols.length; }, 0);
    document.getElementById("meta-text").textContent =
      data.headers.length + " headers · " + totalSymbols.toLocaleString() + " symbols";

    var sorted = data.headers.slice().sort(function (a, b) {
      return a.header < b.header ? -1 : a.header > b.header ? 1 : 0;
    });

    var html = sorted.map(function (h) {
      return '<button class="header-btn" data-header="' + escHtml(h.header) + '">' +
        "&lt;" + escHtml(h.header) + "&gt;" +
        '<span class="sym-count">' + h.symbols.length + "</span>" +
        "</button>";
    }).join("");

    var list = document.getElementById("header-list");
    list.innerHTML = html;
    list.addEventListener("click", function (e) {
      var btn = e.target.closest(".header-btn");
      if (btn) selectHeader(btn.getAttribute("data-header"));
    });
  }

  // ---- Search ----

  document.getElementById("search-input").addEventListener("input", function (e) {
    searchQuery = e.target.value.trim().toLowerCase();
    renderSymbols();
  });

  // ---- Header selection ----

  function selectHeader(name) {
    currentHeader = name;
    activeKinds.clear();
    document.querySelectorAll(".header-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-header") === name);
    });
    document.getElementById("welcome").classList.add("hidden");
    document.getElementById("symbol-view").classList.remove("hidden");
    document.getElementById("header-title").textContent = "<" + name + ">";
    renderSymbols();
  }

  // ---- Render symbols ----

  var kindFilterListenerAttached = false;

  function renderSymbols() {
    if (!currentHeader || !indexData) return;

    var headerData = indexData.headers.find(function (h) { return h.header === currentHeader; });
    if (!headerData) return;

    var symbols = headerData.symbols;

    // Search filter
    if (searchQuery) {
      symbols = symbols.filter(function (s) {
        return s.name.toLowerCase().indexOf(searchQuery) !== -1 ||
               s.raw.toLowerCase().indexOf(searchQuery) !== -1;
      });
    }

    // Kind filter
    if (activeKinds.size > 0) {
      symbols = symbols.filter(function (s) { return activeKinds.has(s.kind); });
    }

    // Symbol count
    document.getElementById("symbol-count").textContent =
      symbols.length.toLocaleString() + " / " + headerData.symbols.length.toLocaleString() + " symbols";

    // Kind filter buttons (based on all symbols in header, not filtered set)
    var allKinds = Array.from(
      new Set(headerData.symbols.map(function (s) { return s.kind; }))
    ).sort();

    var kindHtml = allKinds.map(function (k) {
      var active = activeKinds.has(k) ? " active" : "";
      var color = kindColor(k);
      return '<button class="kind-filter' + active + '" data-kind="' + escHtml(k) + '">' +
        '<span class="kind-dot kind-' + color + '"></span>' +
        escHtml(formatKind(k)) +
        "</button>";
    }).join("");

    document.getElementById("kind-filters").innerHTML = kindHtml;

    if (!kindFilterListenerAttached) {
      kindFilterListenerAttached = true;
      document.getElementById("kind-filters").addEventListener("click", function (e) {
        var btn = e.target.closest(".kind-filter");
        if (!btn) return;
        var k = btn.getAttribute("data-kind");
        if (activeKinds.has(k)) {
          activeKinds.delete(k);
        } else {
          activeKinds.add(k);
        }
        renderSymbols();
      });
    }

    // Symbol rows
    var rows = symbols.map(function (sym) {
      var ns = renderNs(sym.namespace);
      var color = kindColor(sym.kind);
      return "<tr>" +
        '<td class="col-name"><code>' + escHtml(sym.name) + "</code></td>" +
        '<td class="col-kind"><span class="kind-badge kind-' + color + '">' + escHtml(formatKind(sym.kind)) + "</span></td>" +
        '<td class="col-ns">' +
          (ns
            ? "<code>" + escHtml(ns) + "</code>"
            : '<span class="muted">—</span>') +
        "</td>" +
        '<td class="col-raw"><code>' + escHtml(sym.raw) + "</code></td>" +
        "</tr>";
    }).join("");

    document.getElementById("symbol-tbody").innerHTML =
      rows || '<tr><td colspan="4" class="no-results">No symbols match the current filter.</td></tr>';
  }
})();
`;

// ---------------------------------------------------------------------------
// JSX components
// ---------------------------------------------------------------------------

function Page({
  title,
  children,
}: {
  title: string;
  children?: Child;
}): string {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{CSS}</style>
      </head>
      <body>
        {children}
        <script>{CLIENT_SCRIPT}</script>
      </body>
    </html>
  );
}

function App(): string {
  return (
    <Page title="C++ Standard Library Symbol Index">
      <div id="app">
        <header id="topbar">
          <div id="logo">
            <span id="logo-icon">📄</span>
            <span id="logo-text">C++ Standard Library Index</span>
          </div>
          <div id="search-wrap">
            <input
              type="search"
              id="search-input"
              placeholder="Search symbols by name or declaration…"
              autocomplete="off"
            />
          </div>
          <span id="meta-text"></span>
        </header>

        <div id="layout">
          <aside id="sidebar">
            <div id="sidebar-title">Headers</div>
            <div id="header-list">
              <div class="sidebar-loading">Loading index…</div>
            </div>
          </aside>

          <main id="content">
            <div id="welcome">
              <h2>C++ Standard Library Symbol Index</h2>
              <p>
                Select a header from the left panel to browse its symbols.
                Use the search box to filter by name or declaration text.
              </p>
              <p id="error-msg"></p>
            </div>

            <div id="symbol-view" class="hidden">
              <div id="symbol-header">
                <h2 id="header-title"></h2>
                <span id="symbol-count"></span>
              </div>
              <div id="kind-filters"></div>
              <div id="symbol-table-wrap">
                <table id="symbol-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Kind</th>
                      <th>Namespace</th>
                      <th>Declaration</th>
                    </tr>
                  </thead>
                  <tbody id="symbol-tbody"></tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      const html = "<!DOCTYPE html>" + App();
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/index.json") {
      const file = Bun.file(INDEX_PATH);
      if (!(await file.exists())) {
        return new Response(
          JSON.stringify({
            error:
              "Index not yet generated. Run `bun run build` first, then restart the server.",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(file, {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`C++ Draft to Index — Web UI: http://localhost:${PORT}`);
