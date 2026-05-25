import { expect, test } from "vitest";
import { Lexer } from "../src/cxx/lexer.ts";

test("lexer handles backslash char literal", () => {
  const lexer = new Lexer("'\\\\'");
  expect(lexer.tok.value).toBe("'\\\\'");
  expect(lexer.tok.isEof()).toBe(false);
  expect(lexer.next().isEof()).toBe(true);
});
