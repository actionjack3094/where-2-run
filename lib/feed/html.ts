const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "p", "br", "ul", "ol", "li", "div", "span"]);

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function htmlToPlainText(html: string) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function sanitizeRichText(html: string) {
  return html
    .replace(/<\/?([^>\s]+)([^>]*)>/gi, (match, rawTag: string) => {
      const tag = String(rawTag).toLowerCase();
      if (tag === "script" || tag === "style" || tag === "iframe") return "";
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (match.startsWith("</")) return `</${tag}>`;
      if (tag === "br") return "<br />";
      return `<${tag}>`;
    })
    .trim();
}

export function firstClaim(text: string, fallback: string) {
  const sentence =
    text
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .find((part) => part.length >= 12) ?? text.trim();
  const compact = sentence.replace(/\s+/g, " ");
  if (!compact) return fallback;
  return compact.length > 180 ? `${compact.slice(0, 177).trim()}…` : compact;
}
