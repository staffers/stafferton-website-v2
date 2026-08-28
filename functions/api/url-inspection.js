const MAX_REQUEST_BYTES = 2048;
const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 8;
const MAX_HTML_BYTES = 1024 * 1024;
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60;
const localRateLimit = new Map();

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders }
  });
}

function normaliseUrl(value, baseUrl) {
  if (typeof value !== "string") throw new Error("Enter a URL to inspect.");
  let input = value.trim();
  if (!input) throw new Error("Enter a URL to inspect.");
  if (input.length > MAX_URL_LENGTH) throw new Error("The URL is too long.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;

  let url;
  try {
    url = baseUrl ? new URL(input, baseUrl) : new URL(input);
  } catch {
    throw new Error("Enter a valid web address.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs can be inspected.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing usernames or passwords are not supported.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Only standard HTTP and HTTPS ports are supported.");
  }
  url.hash = "";
  return url;
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6ToBigInt(ip) {
  const clean = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!clean.includes(":")) return null;
  const halves = clean.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) + BigInt(parseInt(group, 16)), 0n);
}

function inIpv6Range(value, prefix, bits) {
  const prefixValue = ipv6ToBigInt(prefix);
  const shift = 128n - BigInt(bits);
  return value !== null && prefixValue !== null && (value >> shift) === (prefixValue >> shift);
}

function isPrivateIpv6(ip) {
  const value = ipv6ToBigInt(ip);
  if (value === null) return true;
  if (inIpv6Range(value, "::ffff:0:0", 96)) {
    const mapped = [
      Number((value >> 24n) & 255n),
      Number((value >> 16n) & 255n),
      Number((value >> 8n) & 255n),
      Number(value & 255n)
    ].join(".");
    return isPrivateIpv4(mapped);
  }
  return (
    value === 0n ||
    value === 1n ||
    inIpv6Range(value, "100::", 64) ||
    inIpv6Range(value, "2001:db8::", 32) ||
    inIpv6Range(value, "2001:10::", 28) ||
    inIpv6Range(value, "fc00::", 7) ||
    inIpv6Range(value, "fe80::", 10) ||
    inIpv6Range(value, "ff00::", 8)
  );
}

function isIpAddress(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  return host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function isPrivateAddress(address) {
  return address.includes(":") ? isPrivateIpv6(address) : isPrivateIpv4(address);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function publicAddressesFor(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home") ||
    host.endsWith(".lan")
  ) {
    throw new Error("Private and local network addresses cannot be inspected.");
  }

  if (isIpAddress(host)) {
    if (isPrivateAddress(host)) throw new Error("Private and local network addresses cannot be inspected.");
    return [host];
  }

  const query = async (type) => {
    const endpoint = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
    const response = await fetchWithTimeout(endpoint, {
      headers: { Accept: "application/dns-json" }
    }, 4000);
    if (!response.ok) throw new Error("DNS lookup failed.");
    const data = await response.json();
    return (data.Answer || [])
      .filter((answer) => answer.type === 1 || answer.type === 28)
      .map((answer) => String(answer.data).replace(/\.$/, ""));
  };

  const settled = await Promise.allSettled([query("A"), query("AAAA")]);
  const addresses = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const unique = [...new Set(addresses)];
  if (!unique.length) throw new Error("The hostname does not resolve to a public web server.");
  if (unique.some(isPrivateAddress)) throw new Error("Private and local network addresses cannot be inspected.");
  return unique;
}

async function validateTarget(url, dnsCache) {
  const key = url.hostname.toLowerCase();
  if (!dnsCache.has(key)) dnsCache.set(key, await publicAddressesFor(url.hostname));
}

async function readBody(response) {
  if (!response.body) return { text: "", bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (bytes + value.byteLength > MAX_HTML_BYTES) {
      chunks.push(value.slice(0, Math.max(0, MAX_HTML_BYTES - bytes)));
      bytes = MAX_HTML_BYTES;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    bytes += value.byteLength;
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const contentType = response.headers.get("content-type") || "";
  const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || "utf-8";
  let decoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return { text: decoder.decode(merged), bytes, truncated };
}

function decodeEntities(value) {
  const entities = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ndash: "-", mdash: "-", hellip: "…"
  };
  return String(value || "")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " "));
}

function attributes(tag) {
  const result = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function firstTag(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, "i"))?.[1] || "";
}

function parseSeo(html, finalUrl, contentType, headers) {
  const isHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
  if (!isHtml) {
    const xRobots = headers["x-robots-tag"] || "";
    const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(xRobots);
    return {
      title: "", description: "", canonical: "", robots: xRobots ? `x-robots-tag: ${xRobots}` : "", h1: "", h1Count: 0,
      lang: "", indexability: noindex ? "blocked" : "warning", indexabilityLabel: noindex ? "Blocked" : "Not assessed",
      indexabilityReasons: [noindex ? "An X-Robots-Tag noindex directive was found." : "The response is not an HTML document."],
      checks: [
        ...(noindex ? [{ type: "error", label: "Robots directives", detail: "An X-Robots-Tag noindex directive blocks indexing." }] : []),
        { type: "warning", label: "HTML signals", detail: "The response is not HTML, so on-page SEO signals could not be checked." }
      ]
    };
  }

  const title = stripTags(firstTag(html, "title"));
  const h1Matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)];
  const h1 = stripTags(h1Matches[0]?.[1] || "");
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || "";
  const lang = attributes(htmlTag).lang || "";
  let description = "";
  let canonical = "";
  const robotsValues = [];
  let refresh = "";

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const name = (attrs.name || "").toLowerCase();
    const equiv = (attrs["http-equiv"] || "").toLowerCase();
    if (name === "description" && !description) description = attrs.content || "";
    if (["robots", "googlebot", "bingbot"].includes(name) && attrs.content) robotsValues.push(`${name}: ${attrs.content}`);
    if (equiv === "refresh" && attrs.content) refresh = attrs.content;
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const rel = (attrs.rel || "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical") && attrs.href && !canonical) {
      try {
        canonical = new URL(attrs.href, finalUrl).href;
      } catch {
        canonical = attrs.href;
      }
    }
  }

  const xRobots = headers["x-robots-tag"] || "";
  const robots = [...robotsValues, ...(xRobots ? [`x-robots-tag: ${xRobots}`] : [])].join(" | ");
  const noindex = /(?:^|[,\s:])noindex(?:$|[,\s])/i.test(robots);
  const checks = [];
  const reasons = [];

  if (title) {
    checks.push({
      type: title.length >= 30 && title.length <= 60 ? "pass" : "warning",
      label: "Title tag",
      detail: `${title.length} characters${title.length < 30 ? " - shorter than the usual range" : title.length > 60 ? " - longer than the usual range" : ""}`
    });
  } else {
    checks.push({ type: "error", label: "Title tag", detail: "No title tag found." });
  }

  if (description) {
    checks.push({
      type: description.length >= 70 && description.length <= 160 ? "pass" : "warning",
      label: "Meta description",
      detail: `${description.length} characters${description.length < 70 ? " - shorter than the usual range" : description.length > 160 ? " - longer than the usual range" : ""}`
    });
  } else {
    checks.push({ type: "warning", label: "Meta description", detail: "No meta description found." });
  }

  checks.push(h1Matches.length === 1
    ? { type: "pass", label: "H1 heading", detail: "One H1 found." }
    : { type: "warning", label: "H1 heading", detail: h1Matches.length ? `${h1Matches.length} H1 headings found.` : "No H1 found." });

  checks.push(canonical
    ? { type: "pass", label: "Canonical", detail: "Canonical link found." }
    : { type: "warning", label: "Canonical", detail: "No canonical link found." });

  if (noindex) {
    reasons.push("A noindex directive was found.");
    checks.push({ type: "error", label: "Robots directives", detail: "A noindex directive blocks indexing." });
  } else {
    checks.push({ type: "pass", label: "Robots directives", detail: robots || "No blocking on-page robots directive found." });
  }

  if (refresh) checks.push({ type: "warning", label: "Meta refresh", detail: `Meta refresh found: ${refresh}` });

  return {
    title, description, canonical, robots, h1, h1Count: h1Matches.length, lang,
    indexability: noindex ? "blocked" : "indexable",
    indexabilityLabel: noindex ? "Blocked" : "Indexable",
    indexabilityReasons: reasons,
    checks
  };
}

function responseHeaders(response) {
  const result = {};
  for (const [key, value] of response.headers.entries()) {
    result[key] = key.toLowerCase() === "set-cookie" ? "[value omitted]" : value;
  }
  return result;
}

async function inspect(startUrl) {
  const dnsCache = new Map();
  const redirects = [];
  let current = normaliseUrl(startUrl);
  const started = Date.now();
  let response;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await validateTarget(current, dnsCache);
    const hopStarted = Date.now();
    try {
      response = await fetchWithTimeout(current.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "StaffertonURLInspector/1.0 (+https://stafferton.digital/tools/url-inspector/)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-GB,en;q=0.8"
        },
        cf: { cacheTtl: 0, cacheEverything: false }
      }, 10000);
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("The website took too long to respond.");
      throw new Error("The website could not be reached.");
    }

    const durationMs = Date.now() - hopStarted;
    const location = response.headers.get("location");
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status) && location;
    if (!isRedirect) break;
    if (hop === MAX_REDIRECTS) throw new Error(`More than ${MAX_REDIRECTS} redirects were found.`);

    const next = normaliseUrl(location, current);
    redirects.push({
      url: current.href,
      status: response.status,
      statusText: response.statusText,
      location: next.href,
      durationMs
    });
    if (response.body) await response.body.cancel().catch(() => {});
    current = next;
  }

  const headers = responseHeaders(response);
  const contentType = response.headers.get("content-type") || "Not provided";
  const body = await readBody(response);
  const seo = parseSeo(body.text, current.href, contentType, headers);
  const statusBlocked = response.status !== 200;
  if (statusBlocked) {
    seo.indexability = "blocked";
    seo.indexabilityLabel = "Blocked";
    seo.indexabilityReasons.unshift(`The final URL returned HTTP ${response.status}.`);
    seo.checks.unshift({ type: "error", label: "HTTP status", detail: `The final URL returned ${response.status} ${response.statusText}.` });
  } else {
    seo.checks.unshift({ type: "pass", label: "HTTP status", detail: "The final URL returned 200 OK." });
  }

  return {
    requestedUrl: normaliseUrl(startUrl).href,
    finalUrl: current.href,
    status: response.status,
    statusText: response.statusText,
    durationMs: Date.now() - started,
    redirects,
    contentType,
    contentLength: response.headers.get("content-length") || "",
    inspectedBytes: body.bytes,
    truncated: body.truncated,
    headers,
    seo,
    note: "Indexability covers the final HTTP response and on-page directives. It does not test robots.txt, rendering or Google indexing."
  };
}

async function checkRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const bucket = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const key = [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const localKey = `${key}:${bucket}`;
  const localCount = (localRateLimit.get(localKey) || 0) + 1;
  localRateLimit.set(localKey, localCount);
  if (localRateLimit.size > 500) {
    for (const item of localRateLimit.keys()) {
      if (!item.endsWith(`:${bucket}`)) localRateLimit.delete(item);
    }
  }

  let count = localCount;
  try {
    const cache = caches.default;
    const cacheKey = new Request(`https://stafferton.digital/__url_inspection_rate/${key}/${bucket}`);
    const cached = await cache.match(cacheKey);
    const cachedCount = cached ? Number(await cached.text()) || 0 : 0;
    count = Math.max(localCount, cachedCount + 1);
    await cache.put(cacheKey, new Response(String(count), {
      headers: { "Cache-Control": `max-age=${RATE_WINDOW_SECONDS}` }
    }));
  } catch {
    // The in-isolate limit remains active when the Cache API is unavailable.
  }

  return {
    allowed: count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - count),
    reset: (bucket + 1) * RATE_WINDOW_SECONDS
  };
}

export async function onRequestPost(context) {
  const { request } = context;
  const origin = request.headers.get("Origin");
  const requestOrigin = new URL(request.url).origin;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if ((origin && origin !== requestOrigin) || fetchSite === "cross-site") {
    return json({ error: "Cross-site requests are not allowed." }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return json({ error: "Request is too large." }, 413);

  const rate = await checkRateLimit(request);
  const rateHeaders = {
    "RateLimit-Limit": String(RATE_LIMIT),
    "RateLimit-Remaining": String(rate.remaining),
    "RateLimit-Reset": String(RATE_WINDOW_SECONDS)
  };
  if (!rate.allowed) return json({ error: "Too many inspections. Please try again in a minute." }, 429, rateHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a valid JSON request." }, 400, rateHeaders);
  }

  try {
    return json(await inspect(body?.url), 200, rateHeaders);
  } catch (error) {
    return json({ error: error?.message || "The URL could not be inspected." }, 400, rateHeaders);
  }
}

export function onRequestGet() {
  return json({ error: "Use POST to inspect a URL." }, 405, { Allow: "POST" });
}
