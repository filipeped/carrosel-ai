import juice from "juice";
import { renderCover } from "../templates/cover";

const html = renderCover({
  imageUrl: "https://example.com/x.jpg",
  title: "teste",
  italicWords: [],
  numeral: "",
});

const juiced = juice(html, {
  removeStyleTags: true,
  preserveMediaQueries: false,
  preserveFontFaces: false,
  preservePseudos: false,
});

const bodyMatch = juiced.match(/<body[^>]*>([\s\S]*)<\/body>/i);
let cleaned = bodyMatch ? bodyMatch[1] : juiced;
cleaned = cleaned.replace(/<!doctype[^>]*>/gi, "").replace(/<\/?html[^>]*>/gi, "").replace(/<\/?body[^>]*>/gi, "").replace(/<head[\s\S]*?<\/head>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<link[^>]*>/gi, "");
cleaned = cleaned.replace(/>\s+</g, "><");
cleaned = cleaned.replace(/<(span|div)([^>]*)><\/(?:span|div)>/g, "<$1$2>&nbsp;</$1>");

console.log("FULL JUICED BODY:\n");
console.log(cleaned);
