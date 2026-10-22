export function postingText(input: string): string {
  // Greenhouse double-encodes markup in its public feed.
  const decode = (value: string) => value.replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, (token) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " }[token] ?? token));
  return decode(decode(input)).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50_000);
}
