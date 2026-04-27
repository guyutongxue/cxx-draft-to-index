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

  const synopses = extractHeaderSynopses(texFiles);

  expect(synopses).toHaveLength(1);
  expect(synopses[0]).toMatchObject({
    header: "span",
    filename: "span.tex",
  });
  expect(synopses[0].code).toContain("#include <ranges>");
  expect(synopses[0].code).toContain("void foo();");
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
  expect(synopses[0].code).toContain("first");
  expect(synopses[0].code).not.toContain("implementation");
});