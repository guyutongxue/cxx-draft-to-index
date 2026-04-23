import { expect, test } from "bun:test";
import { Lexer } from "../src/cxx/lexer";
import { Parser } from "../src/cxx/parser";

test("ctor disambiguation failed should die", () => {
  const code = `
using T = int;
class C {
  C(T);
};
C::C(T) {};
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  expect(() => parser.parseTopLevel()).toThrowError("Disambiguate failure");
});

test("specialization of scoped", () => {
  const code = `
namespace N {
  template<typename T>
  struct S {};
}

template<>
struct N::S<int> {};
    `;
  const lexer = new Lexer(code);
  const parser = new Parser(lexer, "<input>");
  parser.parseTopLevel();
  expect(parser.symbols[1]).toMatchObject({
    kind: "partialTemplateSpecialization",
    name: "N::S",
    templateParams: [""],
    templateArgs: ["int"],
  });
});
