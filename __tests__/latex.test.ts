import { expect, test } from "bun:test";
import { extractHeaderSynopses } from "../src/latex";

test("extracts the first synopsis and prepends required includes", () => {
  const texFiles = new Map([
    [
      "span.tex",
      String.raw`\indexheader{span}
\begin{codeblock}
namespace std {
  void foo();
}
\end{codeblock}
`,
    ],
  ]);

  const headers = extractHeaderSynopses(texFiles);

  expect(headers).toHaveLength(1);
  expect(headers[0]).toMatchObject({
    headerName: "span",
    filename: "span.tex",
  });
  expect(headers[0].synopsis.code).toContain("#include <ranges>");
  expect(headers[0].synopsis.code).toContain("void foo();");
});

test("skips non-class codeblocks after the first synopsis", () => {
  const texFiles = new Map([
    [
      "foo.tex",
      String.raw`\indexheader{foo}
\begin{codeblock}
namespace std {
  void first();
}
\end{codeblock}

\begin{codeblock}
void first() {
  // implementation
}
\end{codeblock}
`,
    ],
  ]);

  const synopses = extractHeaderSynopses(texFiles);

  expect(synopses).toHaveLength(1);
  expect(synopses[0].classDefinitions).toHaveLength(0);
  expect(synopses[0].synopsis.code).toContain("first");
  expect(synopses[0].synopsis.code).not.toContain("implementation");
});