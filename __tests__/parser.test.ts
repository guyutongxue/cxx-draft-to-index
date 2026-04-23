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
