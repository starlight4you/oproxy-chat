import { Marked } from "marked";

// Form fields are literal content, not emphasis. Preserve runs before the
// Markdown emphasis tokenizer consumes paired underscores across a paragraph.
export const markdown = new Marked({ extensions: [
  {
    name: "formBlank", level: "inline",
    start: source => source.search(/_{2,}/),
    tokenizer(source) {
      const match = /^_{2,}/.exec(source);
      if (match) return { type: "formBlank", raw: match[0], text: match[0] };
    },
    renderer: token => token.text,
  },
  {
    name: "strong", level: "inline",
    start: source => source.indexOf("**"),
    tokenizer(source) {
      const match = /^\*\*([^\n]+?)\*\*/.exec(source);
      if (match) return { type: "strong", raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1]) };
    },
  },
] });
