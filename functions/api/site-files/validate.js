const MAX_REQUEST_BYTES = 2048;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 5;
const MAX_SITEMAP_URLS = 50000;
const MAX_ROBOTS_LINES = 5000;
const MAX_ISSUES = 25;
const MAX_SITEMAPS = 3;
const REQUEST_DEADLINE_MS = 20000;
const RATE_LIMIT = 8;
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

function normaliseSiteUrl(value) {
  if (typeof value !== "string") throw new Error("Enter a website URL.");
  let input = value.trim();
  if (!input) throw new Error("Enter a website URL.");
  if (input.length > MAX_URL_LENGTH) throw new Error("The URL is too long.");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) input = `https://${input}`;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid website URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites can be checked.");
  if (url.username || url.password) throw new Error("URLs containing usernames or passwords are not supported.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard HTTP and HTTPS ports are supported.");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function normaliseTarget(value, baseUrl) {
  if (typeof value !== "string" || !value.trim()) throw new Error("A file URL is missing.");
  if (value.length > MAX_URL_LENGTH) throw new Error("A file URL is too long.");
  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new Error("A file URL is invalid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS files can be checked.");
  if (url.username || url.password) throw new Error("URLs containing usernames or passwords are not supported.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard HTTP and HTTPS ports are supported.");
  url.hash = "";
  return url;
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
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
    (a === 192 && b === 88 && c === 99) ||
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
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
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
  if (inIpv6Range(value, "64:ff9b::", 96) || inIpv6Range(value, "64:ff9b:1::", 48)) {
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
    inIpv6Range(value, "2002::", 16) ||
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
  ) throw new Error("Private and local network addresses cannot be checked.");

  if (isIpAddress(host)) {
    if (isPrivateAddress(host)) throw new Error("Private and local network addresses cannot be checked.");
    return [host];
  }

  const query = async type => {
    const endpoint = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
    const response = await fetchWithTimeout(endpoint, { headers: { Accept: "application/dns-json" } }, 4000);
    if (!response.ok) throw new Error("DNS lookup failed.");
    const data = await response.json();
    return (data.Answer || [])
      .filter(answer => answer.type === 1 || answer.type === 28)
      .map(answer => String(answer.data).replace(/\.$/, ""));
  };

  const settled = await Promise.allSettled([query("A"), query("AAAA")]);
  if (settled.some(result => result.status === "rejected")) throw new Error("DNS lookup failed.");
  const addresses = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const unique = [...new Set(addresses)];
  if (!unique.length) throw new Error("The hostname does not resolve to a public web server.");
  if (unique.some(isPrivateAddress)) throw new Error("Private and local network addresses cannot be checked.");
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
    if (bytes + value.byteLength > MAX_FILE_BYTES) {
      chunks.push(value.slice(0, Math.max(0, MAX_FILE_BYTES - bytes)));
      bytes = MAX_FILE_BYTES;
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
  return { text: new TextDecoder("utf-8").decode(merged), bytes, truncated };
}

async function fetchFile(startUrl, dnsCache, deadline) {
  let current = startUrl;
  const redirects = [];
  let response;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("The validation took too long to complete.");
    await validateTarget(current, dnsCache);
    try {
      response = await fetchWithTimeout(current.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "StaffertonSiteFilesValidator/1.0 (+https://stafferton.digital/tools/site-files-validator/)",
          "Accept": "text/plain,application/xml,text/xml,*/*;q=0.2",
          "Accept-Encoding": "identity"
        },
        cf: { cacheTtl: 0, cacheEverything: false }
      }, Math.min(10000, remaining));
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("The website took too long to respond.");
      throw new Error("The website could not be reached.");
    }
    const location = response.headers.get("location");
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status) && location;
    if (!isRedirect) break;
    if (hop === MAX_REDIRECTS) throw new Error(`More than ${MAX_REDIRECTS} redirects were found.`);
    const next = normaliseTarget(location, current);
    redirects.push({ status: response.status, from: current.href, to: next.href });
    if (response.body) await response.body.cancel().catch(() => {});
    current = next;
  }
  const body = await readBody(response);
  return {
    requestedUrl: startUrl.href,
    finalUrl: current.href,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type") || "Not provided",
    redirects,
    ...body
  };
}

function sanitiseInput(value) {
  return String(value || "").trim();
}

function cappedIssues(issues, overflowMessage) {
  if (issues.length <= MAX_ISSUES) return issues;
  return [...issues.slice(0, MAX_ISSUES), { tone: "warning", detail: overflowMessage }];
}

function parseRobots(file, siteUrl) {
  const issues = [];
  const sitemapUrls = [];
  const groups = [];
  let current = null;
  const allLines = file.text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines = allLines.slice(0, MAX_ROBOTS_LINES);
  let directiveCount = 0;
  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const match = line.match(/^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i);
    if (!match) {
      issues.push({ tone: "warning", detail: `Line ${index + 1} is not a recognised directive: ${rawLine.trim()}` });
      return;
    }
    const name = match[1].toLowerCase();
    const value = match[2].trim();
    directiveCount += 1;
    if (name === "user-agent") {
      if (!value) issues.push({ tone: "warning", detail: `Line ${index + 1} has an empty User-agent value.` });
      current = { agents: [value], allow: [], disallow: [], other: [] };
      groups.push(current);
      return;
    }
    if (name === "sitemap") {
      try {
        const url = normaliseTarget(value, siteUrl);
        if (url.origin !== siteUrl.origin) issues.push({ tone: "warning", detail: `Sitemap points to another host: ${url.hostname}` });
        if (!sitemapUrls.includes(url.href)) sitemapUrls.push(url.href);
      } catch {
        issues.push({ tone: "error", detail: `Line ${index + 1} has an invalid Sitemap URL.` });
      }
      return;
    }
    if (!current) {
      issues.push({ tone: "warning", detail: `Line ${index + 1} appears before a User-agent group.` });
      return;
    }
    if (name === "allow" || name === "disallow") {
      current[name].push(value);
    } else {
      current.other.push({ name, value });
    }
  });
  const wildcard = groups.find(group => group.agents.some(agent => agent === "*"));
  if (!groups.length) issues.push({ tone: "warning", detail: "No User-agent groups were found." });
  if (!wildcard) issues.push({ tone: "warning", detail: "No wildcard User-agent: * group was found." });
  if (!sitemapUrls.length) issues.push({ tone: "warning", detail: "No Sitemap directive was found." });
  if (file.status !== 200) issues.unshift({ tone: "error", detail: `robots.txt returned HTTP ${file.status}.` });
  if (file.truncated) issues.push({ tone: "warning", detail: "robots.txt exceeded 1 MB and was truncated." });
  if (allLines.length > MAX_ROBOTS_LINES) issues.push({ tone: "warning", detail: `Only the first ${MAX_ROBOTS_LINES.toLocaleString()} robots.txt lines were parsed.` });
  const blocksAll = Boolean(wildcard?.disallow.some(value => value.trim() === "/") && !wildcard.allow.some(Boolean));
  if (blocksAll) issues.push({ tone: "error", detail: "The wildcard group appears to disallow the entire website." });
  return {
    groups: groups.length,
    directives: directiveCount,
    sitemapUrls,
    blocksAll,
    issues: cappedIssues(issues, "More robots.txt findings were omitted.")
  };
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

function parseSitemap(file, siteUrl) {
  const issues = [];
  const text = file.text.replace(/^\uFEFF/, "");
  const root = text.match(/<\s*(urlset|sitemapindex)\b/i)?.[1]?.toLowerCase() || "";
  const locationMatches = [];
  const matcher = /<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi;
  let locationMatch;
  while (locationMatches.length <= MAX_SITEMAP_URLS && (locationMatch = matcher.exec(text))) {
    locationMatches.push(locationMatch);
  }
  const urls = new Set();
  const sample = [];
  let duplicateCount = 0;
  let otherHostCount = 0;
  let invalidCount = 0;
  locationMatches.slice(0, MAX_SITEMAP_URLS).forEach(match => {
    const value = decodeXml(match[1]);
    try {
      const url = normaliseTarget(value, file.finalUrl);
      if (urls.has(url.href)) duplicateCount += 1;
      urls.add(url.href);
      if (sample.length < 5) sample.push(url.href);
      if (url.origin !== siteUrl.origin) otherHostCount += 1;
    } catch {
      invalidCount += 1;
    }
  });
  if (file.status !== 200) issues.push({ tone: "error", detail: `Sitemap returned HTTP ${file.status}.` });
  if (!root) issues.push({ tone: "error", detail: "No <urlset> or <sitemapindex> root element was found." });
  if (root && !/xmlns\s*=\s*["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(text)) {
    issues.push({ tone: "warning", detail: "The standard sitemap XML namespace was not found." });
  }
  if (!locationMatches.length) issues.push({ tone: "warning", detail: "No <loc> entries were found." });
  if (locationMatches.length > MAX_SITEMAP_URLS) issues.push({ tone: "error", detail: `The sitemap contains more than ${MAX_SITEMAP_URLS.toLocaleString()} locations.` });
  if (invalidCount) issues.push({ tone: "error", detail: `${invalidCount} invalid <loc> ${invalidCount === 1 ? "value was" : "values were"} found.` });
  if (otherHostCount) issues.push({ tone: "warning", detail: `${otherHostCount} ${otherHostCount === 1 ? "location points" : "locations point"} to another host.` });
  if (file.truncated) issues.push({ tone: "warning", detail: "The sitemap exceeded 1 MB, so only the first 1 MB was checked." });
  if (duplicateCount) issues.push({ tone: "warning", detail: `${duplicateCount} duplicate ${duplicateCount === 1 ? "location was" : "locations were"} found.` });
  return {
    type: root === "sitemapindex" ? "Sitemap index" : root === "urlset" ? "URL sitemap" : "Unknown",
    locations: Math.min(locationMatches.length, MAX_SITEMAP_URLS),
    duplicateCount,
    otherHostCount,
    invalidCount,
    sample,
    issues: cappedIssues(issues, "More sitemap findings were omitted.")
  };
}

function scoreResult(file, issues) {
  if (file.status !== 200 || issues.some(issue => issue.tone === "error")) return "error";
  return issues.some(issue => issue.tone === "warning") ? "warning" : "success";
}

async function validate(input) {
  const siteUrl = normaliseSiteUrl(input.siteUrl);
  const dnsCache = new Map();
  const deadline = Date.now() + REQUEST_DEADLINE_MS;
  await validateTarget(siteUrl, dnsCache);

  const robotsUrl = new URL("/robots.txt", siteUrl);
  const robotsFile = await fetchFile(robotsUrl, dnsCache, deadline);
  const robots = parseRobots(robotsFile, siteUrl);

  const candidates = [];
  const submitted = sanitiseInput(input.sitemapUrl);
  if (submitted) candidates.push(normaliseTarget(submitted, siteUrl));
  robots.sitemapUrls.forEach(value => {
    try {
      const url = normaliseTarget(value, siteUrl);
      if (!candidates.some(item => item.href === url.href)) candidates.push(url);
    } catch {
      // Already reported in robots.txt issues.
    }
  });
  if (!candidates.length) candidates.push(new URL("/sitemap.xml", siteUrl));

  const sitemapResults = [];
  for (const target of candidates.slice(0, MAX_SITEMAPS)) {
    try {
      const file = await fetchFile(target, dnsCache, deadline);
      const parsed = parseSitemap(file, siteUrl);
      sitemapResults.push({
        url: target.href,
        finalUrl: file.finalUrl,
        status: file.status,
        contentType: file.contentType,
        redirects: file.redirects,
        bytes: file.bytes,
        truncated: file.truncated,
        ...parsed,
        tone: scoreResult(file, parsed.issues)
      });
    } catch (error) {
      sitemapResults.push({
        url: target.href,
        finalUrl: target.href,
        status: 0,
        contentType: "",
        redirects: [],
        bytes: 0,
        truncated: false,
        type: "Unknown",
        locations: 0,
        duplicateCount: 0,
        otherHostCount: 0,
        invalidCount: 0,
        sample: [],
        issues: [{ tone: "error", detail: error.message }],
        tone: "error"
      });
    }
  }

  return {
    siteUrl: siteUrl.href,
    checkedAt: new Date().toISOString(),
    robots: {
      url: robotsUrl.href,
      finalUrl: robotsFile.finalUrl,
      status: robotsFile.status,
      contentType: robotsFile.contentType,
      redirects: robotsFile.redirects,
      bytes: robotsFile.bytes,
      truncated: robotsFile.truncated,
      preview: robotsFile.text.slice(0, 4000),
      ...robots,
      tone: scoreResult(robotsFile, robots.issues)
    },
    sitemaps: sitemapResults,
    note: "This validator checks syntax and discoverability. It does not crawl every sitemap URL or confirm Google indexing."
  };
}

async function checkRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const bucket = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const key = [...new Uint8Array(digest)].slice(0, 8).map(byte => byte.toString(16).padStart(2, "0")).join("");
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
    const cacheKey = new Request(`https://stafferton.digital/__site_files_rate/${key}/${bucket}`);
    const cached = await caches.default.match(cacheKey);
    const cachedCount = cached ? Number(await cached.text()) || 0 : 0;
    count = Math.max(localCount, cachedCount + 1);
    await caches.default.put(cacheKey, new Response(String(count), {
      headers: { "Cache-Control": `max-age=${RATE_WINDOW_SECONDS}` }
    }));
  } catch {
    // The in-isolate rate limit remains active.
  }
  return { allowed: count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - count) };
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
  if (!rate.allowed) return json({ error: "Too many checks. Please try again in a minute." }, 429, {
    ...rateHeaders,
    "Retry-After": String(RATE_WINDOW_SECONDS)
  });

  let body;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "Request is too large." }, 413, rateHeaders);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "Send a valid JSON request." }, 400, rateHeaders);
  }
  try {
    return json(await validate(body || {}), 200, rateHeaders);
  } catch (error) {
    return json({ error: error?.message || "The website files could not be checked." }, 400, rateHeaders);
  }
}

export function onRequestGet() {
  return json({ error: "Use POST to validate website files." }, 405, { Allow: "POST" });
}
