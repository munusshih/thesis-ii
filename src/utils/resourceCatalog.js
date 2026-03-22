import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { slugify } from "@/utils/slug.js";
import {
  getResourceHost,
  getWeekNumberFromContentPath,
  isResourceUrl,
  normalizeCandidate,
  normalizeResourceUrl,
} from "@/utils/resourceLinks.js";

export const SHEET_DOCUMENT_URL =
  "https://docs.google.com/spreadsheets/d/1wMo1agYzYCB2m44idmlzwfn0UdoI69XJhPf4ETtTk90/edit?usp=sharing";

const SHEET_ID = "1wMo1agYzYCB2m44idmlzwfn0UdoI69XJhPf4ETtTk90";
const TAB_NAME = "Thesis II";
const OPEN_SHEET_URL =
  `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(TAB_NAME)}`;
const CONTENT_ROOT = join(globalThis.process.cwd(), "src", "content");
const RESOURCE_PREVIEW_FOLDER = "resource-previews";
const RESOURCE_PREVIEW_DIR = join(
  globalThis.process.cwd(),
  "public",
  RESOURCE_PREVIEW_FOLDER,
);
const RESOURCE_PREVIEW_PREFIX = `/${RESOURCE_PREVIEW_FOLDER}`;
const RESOURCE_DESCRIPTION_OVERRIDES_PATH = join(
  globalThis.process.cwd(),
  "src",
  "data",
  "resourceDescriptionOverrides.json",
);

const DOCUMENT_REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

const IMAGE_REQUEST_HEADERS = {
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

const CATEGORY_ORDER = [
  "Readings & Essays",
  "Tools & References",
  "Projects & Archives",
  "Video & Talks",
  "General Links",
];

const CATEGORY_RANK = new Map(
  CATEGORY_ORDER.map((label, index) => [label, index]),
);

const metadataCache = new Map();
const localImageCache = new Map();
const placeholderCache = new Map();
let resourcePreviewDirReady = false;
let descriptionOverridesCache = null;

function escapeRegExp(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtmlEntities(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function normalizeText(value = "") {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function toNumber(value) {
  const number = Number.parseInt(`${value || ""}`.trim(), 10);
  return Number.isFinite(number) ? number : null;
}

function truncateText(text = "", max = 220) {
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max - 1).trim()}…`;
}

function splitSentences(text = "") {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function cleanDescriptionText(value = "") {
  let text = normalizeText(value);
  if (!text) {
    return "";
  }

  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  const cleanupPatterns = [
    /\b(click here|read more|learn more|shop now|watch now|sign up now)\b/gi,
    /\b(home page|homepage|official website)\b/gi,
    /\b(cookie policy|privacy policy|terms of service)\b/gi,
    /\b(javascript is disabled|please enable javascript)\b/gi,
  ];

  for (const pattern of cleanupPatterns) {
    text = text.replace(pattern, "");
  }

  text = text.replace(/\s*[\-|•|:]\s*$/, "");
  text = text.replace(/\s{2,}/g, " ").trim();

  const sentences = splitSentences(text);
  const uniqueSentences = [];
  const seen = new Set();
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueSentences.push(sentence);
  }

  const deduped = uniqueSentences.join(" ").trim();
  return deduped.replace(/\s+/g, " ").trim();
}

function isLowQualityDescription(text = "") {
  const candidate = normalizeText(text);
  if (!candidate || candidate.length < 36) {
    return true;
  }

  if (/^referenced in\b/i.test(candidate)) {
    return true;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 7) {
    return true;
  }

  if (!/[a-z]{3,}/i.test(candidate)) {
    return true;
  }

  return false;
}

function synthesizeDescription({
  title = "",
  host = "",
  category = "",
  weekLabel = "",
} = {}) {
  const safeTitle = normalizeText(title) || "This resource";
  const safeHost = normalizeText(host) || "the web";
  const categoryPart = category && category !== "General Links"
    ? ` in ${category}`
    : "";
  // Remove weekPart from description
  return `${safeTitle} is a curated reference from ${safeHost}${categoryPart}.`.trim();
}

async function loadDescriptionOverrides() {
  if (descriptionOverridesCache) {
    return descriptionOverridesCache;
  }

  try {
    const raw = await readFile(RESOURCE_DESCRIPTION_OVERRIDES_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      descriptionOverridesCache = {};
      return descriptionOverridesCache;
    }

    descriptionOverridesCache = parsed;
    return descriptionOverridesCache;
  } catch {
    descriptionOverridesCache = {};
    return descriptionOverridesCache;
  }
}

function getDescriptionOverride(overrides = {}, url = "") {
  if (!overrides || typeof overrides !== "object" || !url) {
    return "";
  }

  const direct = overrides[url];
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const normalized = normalizeResourceUrl(url);
  const normalizedMatch = overrides[normalized];
  if (typeof normalizedMatch === "string" && normalizedMatch.trim()) {
    return normalizedMatch;
  }

  return "";
}

function humanize(value = "") {
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCategoryLabel(value = "") {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseCategoryValues(value = "") {
  return value
    .split(/[|,;/]+/g)
    .map((entry) => normalizeCategoryLabel(entry))
    .filter(Boolean);
}

function extractUrl(row = {}) {
  const candidates = [row.Item, row.URL, row.Url, row.url, row.Link, row.link];
  const match = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  return match ? normalizeResourceUrl(match) : "";
}

function extractTitle(row = {}) {
  const candidates = [row.Title, row.title, row.Name, row.name];
  const match = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  return match ? normalizeText(match) : "";
}

function extractCategories(row = {}) {
  const candidates = [
    row.Category,
    row.category,
    row.Type,
    row.type,
    row.Topic,
    row.topic,
    row.Tags,
    row.tags,
    row.Section,
    row.section,
  ];

  const categories = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }

    for (const parsed of parseCategoryValues(candidate)) {
      if (!categories.includes(parsed)) {
        categories.push(parsed);
      }
    }
  }

  return categories;
}

function getFallbackTitle(url) {
  try {
    const parsed = new globalThis.URL(url);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    const leaf = normalizedPath.split("/").filter(Boolean).at(-1);

    if (leaf) {
      const decoded = decodeURIComponent(leaf);
      const display = humanize(decoded);
      if (display) {
        return display;
      }
    }

    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function createResourcePlaceholderSvg(title) {
  const label = escapeXml((title || "Resource").slice(0, 48));
  return `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='750' viewBox='0 0 1200 750'><rect width='1200' height='750' fill='black'/><rect x='24' y='24' width='1152' height='702' fill='none' stroke='white' stroke-width='3'/><text x='60' y='390' fill='white' font-size='56' font-family='Helvetica, Arial, sans-serif'>${label}</text></svg>`;
}

async function ensureResourcePreviewDir() {
  if (resourcePreviewDirReady) {
    return;
  }

  await mkdir(RESOURCE_PREVIEW_DIR, { recursive: true });
  resourcePreviewDirReady = true;
}

function hashValue(value = "") {
  return createHash("sha1").update(value).digest("hex");
}

function getExtensionFromContentType(contentType = "") {
  const value = contentType.toLowerCase();
  if (value.includes("image/jpeg") || value.includes("image/jpg")) {
    return "jpg";
  }

  if (value.includes("image/png")) {
    return "png";
  }

  if (value.includes("image/webp")) {
    return "webp";
  }

  if (value.includes("image/gif")) {
    return "gif";
  }

  if (value.includes("image/avif")) {
    return "avif";
  }

  if (value.includes("image/svg+xml")) {
    return "svg";
  }

  return "";
}

function getExtensionFromUrl(url = "") {
  try {
    const parsed = new globalThis.URL(url);
    const ext = extname(parsed.pathname || "")
      .replace(/^\./, "")
      .toLowerCase();

    if (["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {
    return "";
  }

  return "";
}

async function writePreviewFileIfMissing(filename, contents) {
  await ensureResourcePreviewDir();
  const outputPath = join(RESOURCE_PREVIEW_DIR, filename);

  try {
    await access(outputPath);
  } catch {
    await writeFile(outputPath, contents);
  }

  return `${RESOURCE_PREVIEW_PREFIX}/${filename}`;
}

async function cacheRemoteImageLocally(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  if (url.startsWith("/")) {
    return url;
  }

  if (!/^https?:\/\//i.test(url)) {
    return "";
  }

  if (localImageCache.has(url)) {
    return localImageCache.get(url);
  }

  const cachePromise = (async () => {
    const controller = new globalThis.AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await globalThis.fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: IMAGE_REQUEST_HEADERS,
      });

      if (!response.ok) {
        return "";
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (
        contentType &&
        !contentType.includes("image/") &&
        !contentType.includes("octet-stream") &&
        !contentType.includes("binary")
      ) {
        return "";
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        return "";
      }

      const extension =
        getExtensionFromContentType(contentType) || getExtensionFromUrl(url) || "jpg";
      const filename = `${hashValue(url)}.${extension}`;
      return writePreviewFileIfMissing(filename, bytes);
    } catch {
      return "";
    } finally {
      globalThis.clearTimeout(timeout);
    }
  })();

  localImageCache.set(url, cachePromise);
  return cachePromise;
}

async function getLocalPlaceholderUrl(title, resourceUrl = "") {
  const cacheKey = `${resourceUrl}::${title || ""}`;
  if (placeholderCache.has(cacheKey)) {
    return placeholderCache.get(cacheKey);
  }

  const cachePromise = (async () => {
    const svg = createResourcePlaceholderSvg(title);
    const filename = `${hashValue(`placeholder:${cacheKey}`)}.svg`;
    return writePreviewFileIfMissing(filename, svg);
  })();

  placeholderCache.set(cacheKey, cachePromise);
  return cachePromise;
}

function getScreenshotCandidates(url) {
  return [
    {
      url: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200`,
      source: "screenshot-mshots",
      width: 1200,
      height: 675,
    },
    {
      url: `https://image.thum.io/get/width/1200/crop/675/noanimate/${encodeURI(url)}`,
      source: "screenshot-thumio",
      width: 1200,
      height: 675,
    },
  ];
}

function getFaviconCandidates(url) {
  const host = getResourceHost(url);
  const candidates = [
    {
      url: `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(url)}`,
      source: "favicon-google",
      width: 256,
      height: 256,
    },
  ];

  if (host) {
    candidates.push({
      url: `https://icon.horse/icon/${encodeURIComponent(host)}`,
      source: "favicon-iconhorse",
      width: 256,
      height: 256,
    });
  }

  return candidates;
}

function parseAttributes(tagSource = "") {
  const attributes = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const match of tagSource.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key) {
      attributes[key] = value;
    }
  }

  return attributes;
}

function collectTagAttributes(html = "", tagName = "meta") {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
  const entries = [];

  for (const match of html.matchAll(pattern)) {
    entries.push(parseAttributes(match[0]));
  }

  return entries;
}

function getMetaContents(metaTags = [], attrName = "property", attrValue = "") {
  const key = attrName.toLowerCase();
  const expectedValue = attrValue.toLowerCase();

  const values = [];
  for (const metaTag of metaTags) {
    const actualValue = (metaTag[key] || "").toLowerCase();
    const content = normalizeText(metaTag.content || "");

    if (actualValue === expectedValue && content) {
      values.push(content);
    }
  }

  return values;
}

function getFirstMetaContent(metaTags = [], attrName = "property", attrValue = "") {
  return getMetaContents(metaTags, attrName, attrValue)[0] || "";
}

function getLinkHrefs(linkTags = [], relValue = "") {
  const expected = relValue.toLowerCase();
  const values = [];

  for (const linkTag of linkTags) {
    const href = normalizeText(linkTag.href || "");
    const rel = `${linkTag.rel || ""}`
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (href && rel.includes(expected)) {
      values.push(href);
    }
  }

  return values;
}

function resolveImageUrl(baseUrl, candidate) {
  const decoded = decodeHtmlEntities(candidate).trim();
  if (!decoded) {
    return "";
  }

  try {
    const resolved = new globalThis.URL(decoded, baseUrl).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : "";
  } catch {
    return "";
  }
}

function getDocumentTitle(html = "") {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch?.[1] ? normalizeText(titleMatch[1]) : "";
}

function dedupeCandidates(candidates = []) {
  const deduped = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.url !== "string") {
      continue;
    }

    const trimmedUrl = candidate.url.trim();
    if (!trimmedUrl || seen.has(trimmedUrl)) {
      continue;
    }

    seen.add(trimmedUrl);
    deduped.push({ ...candidate, url: trimmedUrl });
  }

  return deduped;
}

function isLikelyLogoUrl(url = "") {
  const value = url.toLowerCase();

  if (/(^|[/?._-])(logo|icon|favicon|avatar|sprite|badge)([/?._-]|$)/i.test(value)) {
    return true;
  }

  if (/\.ico(\?|$)/i.test(value)) {
    return true;
  }

  return false;
}

function scoreImageCandidate(candidate) {
  const sourceScores = {
    og: 100,
    twitter: 92,
    "link-image": 88,
    "screenshot-mshots": 78,
    "screenshot-thumio": 74,
    "favicon-google": 28,
    "favicon-iconhorse": 24,
    placeholder: 1,
  };

  let score = sourceScores[candidate.source] || 20;

  if (isLikelyLogoUrl(candidate.url)) {
    score -= 30;
  }

  if (Number.isFinite(candidate.width) && candidate.width < 400) {
    score -= 18;
  }

  if (Number.isFinite(candidate.height) && candidate.height < 220) {
    score -= 18;
  }

  if (Number.isFinite(candidate.width) && Number.isFinite(candidate.height)) {
    const ratio = candidate.width / candidate.height;
    if (ratio > 3 || ratio < 0.45) {
      score -= 14;
    }
  }

  return score;
}

async function fetchOpenGraphData(url) {
  if (metadataCache.has(url)) {
    return metadataCache.get(url);
  }

  const fetchPromise = (async () => {
    const controller = new globalThis.AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 4500);

    try {
      const response = await globalThis.fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: DOCUMENT_REQUEST_HEADERS,
      });

      if (!response.ok) {
        return { imageCandidates: [], title: "", description: "", siteName: "" };
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/html")) {
        return { imageCandidates: [], title: "", description: "", siteName: "" };
      }

      const html = await response.text();
      const pageUrl = response.url || url;

      const metaTags = collectTagAttributes(html, "meta");
      const linkTags = collectTagAttributes(html, "link");

      const ogWidth = toNumber(
        getFirstMetaContent(metaTags, "property", "og:image:width"),
      );
      const ogHeight = toNumber(
        getFirstMetaContent(metaTags, "property", "og:image:height"),
      );

      const ogImageValues = [
        ...getMetaContents(metaTags, "property", "og:image"),
        ...getMetaContents(metaTags, "property", "og:image:secure_url"),
        ...getMetaContents(metaTags, "property", "og:image:url"),
      ];

      const twitterImageValues = [
        ...getMetaContents(metaTags, "name", "twitter:image"),
        ...getMetaContents(metaTags, "name", "twitter:image:src"),
      ];

      const linkImageValues = getLinkHrefs(linkTags, "image_src");

      const imageCandidates = dedupeCandidates([
        ...ogImageValues.map((candidate) => ({
          url: resolveImageUrl(pageUrl, candidate),
          source: "og",
          width: ogWidth,
          height: ogHeight,
        })),
        ...twitterImageValues.map((candidate) => ({
          url: resolveImageUrl(pageUrl, candidate),
          source: "twitter",
          width: ogWidth,
          height: ogHeight,
        })),
        ...linkImageValues.map((candidate) => ({
          url: resolveImageUrl(pageUrl, candidate),
          source: "link-image",
          width: ogWidth,
          height: ogHeight,
        })),
      ]).filter((candidate) => Boolean(candidate.url));

      const title =
        normalizeText(getFirstMetaContent(metaTags, "property", "og:title")) ||
        normalizeText(getFirstMetaContent(metaTags, "name", "twitter:title")) ||
        getDocumentTitle(html);

      const description =
        normalizeText(getFirstMetaContent(metaTags, "property", "og:description")) ||
        normalizeText(getFirstMetaContent(metaTags, "name", "twitter:description")) ||
        normalizeText(getFirstMetaContent(metaTags, "name", "description"));

      const siteName = normalizeText(
        getFirstMetaContent(metaTags, "property", "og:site_name"),
      );

      return {
        imageCandidates,
        title,
        description,
        siteName,
      };
    } catch {
      return { imageCandidates: [], title: "", description: "", siteName: "" };
    } finally {
      globalThis.clearTimeout(timeout);
    }
  })();

  metadataCache.set(url, fetchPromise);
  return fetchPromise;
}

async function pickResourceImages(url, openGraphData, title) {
  const candidates = dedupeCandidates([
    ...(openGraphData?.imageCandidates || []),
    ...getScreenshotCandidates(url),
    ...getFaviconCandidates(url),
  ]).sort((a, b) => scoreImageCandidate(b) - scoreImageCandidate(a));

  const localImages = [];
  for (const candidate of candidates) {
    const localUrl = await cacheRemoteImageLocally(candidate.url);
    if (!localUrl || localImages.includes(localUrl)) {
      continue;
    }

    localImages.push(localUrl);
    if (localImages.length >= 3) {
      break;
    }
  }

  if (localImages.length === 0) {
    const placeholder = await getLocalPlaceholderUrl(title, url);
    return {
      previewImage: placeholder,
      fallbackImages: [],
    };
  }

  return {
    previewImage: localImages[0],
    fallbackImages: localImages.slice(1),
  };
}

async function walkMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractLinksFromMarkdown(markdown, weekNumber) {
  const links = [];
  const seen = new Set();

  const addLink = (url, title = "") => {
    const normalizedUrl = normalizeResourceUrl(normalizeCandidate(url));
    if (!normalizedUrl || !isResourceUrl(normalizedUrl)) {
      return;
    }

    if (seen.has(normalizedUrl)) {
      return;
    }

    seen.add(normalizedUrl);
    links.push({
      url: normalizedUrl,
      title: normalizeText(title),
      source: "Course Markdown",
      weekNumbers: Number.isFinite(weekNumber) ? [weekNumber] : [],
      categories: [],
    });
  };

  const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
  for (const match of markdown.matchAll(markdownPattern)) {
    addLink(match[2], match[1]);
  }

  const htmlPattern = /href=["'](https?:\/\/[^"']+)["']/gi;
  for (const match of markdown.matchAll(htmlPattern)) {
    addLink(match[1], "");
  }

  const rawPattern = /https?:\/\/[^\s<>"']+/gi;
  for (const match of markdown.matchAll(rawPattern)) {
    addLink(match[0], "");
  }

  return links;
}

async function getMarkdownResources() {
  const markdownFiles = await walkMarkdownFiles(CONTENT_ROOT);
  const resources = [];

  for (const markdownPath of markdownFiles) {
    const markdownContent = await readFile(markdownPath, "utf-8");
    const weekNumber = getWeekNumberFromContentPath(markdownPath);
    resources.push(...extractLinksFromMarkdown(markdownContent, weekNumber));
  }

  return resources;
}

function formatWeekLabel(weekNumbers = []) {
  if (weekNumbers.length === 0) {
    return "General";
  }

  return weekNumbers.map((week) => `Week ${week}`).join(", ");
}

function getPrimaryWeek(weekNumbers = []) {
  const validWeeks = weekNumbers
    .filter((week) => Number.isFinite(week))
    .sort((a, b) => a - b);

  return validWeeks.length > 0 ? validWeeks[0] : null;
}

function compareResourcesWithinCategory(a, b) {
  const aWeek = getPrimaryWeek(a.weekNumbers);
  const bWeek = getPrimaryWeek(b.weekNumbers);

  if (aWeek === null && bWeek !== null) {
    return 1;
  }

  if (aWeek !== null && bWeek === null) {
    return -1;
  }

  if (aWeek !== null && bWeek !== null && aWeek !== bWeek) {
    return aWeek - bWeek;
  }

  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function mergeResources(primary, secondary) {
  const merged = new Map();

  const addResource = (resource) => {
    const key = normalizeResourceUrl(resource.url);
    if (!key || !isResourceUrl(key)) {
      return;
    }

    if (!merged.has(key)) {
      merged.set(key, {
        url: key,
        title: resource.title || "",
        sourceSet: new Set(resource.source ? [resource.source] : []),
        weekSet: new Set(resource.weekNumbers || []),
        categorySet: new Set(resource.categories || []),
      });
      return;
    }

    const existing = merged.get(key);
    if (!existing.title && resource.title) {
      existing.title = resource.title;
    }

    if (resource.source) {
      existing.sourceSet.add(resource.source);
    }

    for (const week of resource.weekNumbers || []) {
      if (Number.isFinite(week)) {
        existing.weekSet.add(week);
      }
    }

    for (const category of resource.categories || []) {
      const normalized = normalizeCategoryLabel(category);
      if (normalized) {
        existing.categorySet.add(normalized);
      }
    }
  };

  primary.forEach(addResource);
  secondary.forEach(addResource);

  return Array.from(merged.values()).map((resource) => {
    const weekNumbers = Array.from(resource.weekSet)
      .filter((week) => Number.isFinite(week))
      .sort((a, b) => a - b);

    const categories = Array.from(resource.categorySet)
      .map((value) => normalizeCategoryLabel(value))
      .filter(Boolean);

    return {
      url: resource.url,
      title: resource.title,
      source: Array.from(resource.sourceSet).join(" + ") || "Resource",
      weekNumbers,
      weekLabel: formatWeekLabel(weekNumbers),
      categories,
    };
  });
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function hostMatchesAny(hostname = "", patterns = []) {
  const host = hostname.toLowerCase();
  if (!host) {
    return false;
  }

  return patterns.some((pattern) => {
    const needle = pattern.toLowerCase();
    if (needle.includes(".")) {
      return host === needle || host.endsWith(`.${needle}`);
    }

    return host.includes(needle);
  });
}

function addScore(scoreMap, label, increment) {
  scoreMap.set(label, (scoreMap.get(label) || 0) + increment);
}

function inferCategory(resource) {
  const explicitCategory = (resource.categories || [])
    .map((value) => normalizeCategoryLabel(value))
    .find(Boolean);

  if (explicitCategory) {
    return explicitCategory;
  }

  const host = (resource.host || "").toLowerCase();
  const text = `${resource.title || ""} ${resource.description || ""} ${resource.url || ""}`
    .toLowerCase()
    .trim();

  const videoHosts = [
    "youtube.com",
    "youtu.be",
    "vimeo.com",
    "twitch.tv",
    "soundcloud.com",
    "spotify.com",
  ];

  const toolHosts = [
    "github.com",
    "gitlab.com",
    "npmjs.com",
    "p5js.org",
    "editor.p5js.org",
    "w3schools.com",
    "developer.mozilla.org",
    "stackoverflow.com",
    "codepen.io",
    "codesandbox.io",
    "bindery.info",
    "hackmd.io",
  ];

  const readingHosts = [
    "substack.com",
    "medium.com",
    "nytimes.com",
    "newyorker.com",
    "theatlantic.com",
  ];

  const archiveHosts = [
    "are.na",
    "archive.org",
    "museum",
    "gallery",
    "behance.net",
    "designfuture.space",
  ];

  const scores = new Map();

  if (hostMatchesAny(host, videoHosts)) {
    addScore(scores, "Video & Talks", 5);
  }

  if (hostMatchesAny(host, toolHosts)) {
    addScore(scores, "Tools & References", 5);
  }

  if (hostMatchesAny(host, readingHosts)) {
    addScore(scores, "Readings & Essays", 4);
  }

  if (hostMatchesAny(host, archiveHosts)) {
    addScore(scores, "Projects & Archives", 4);
  }

  if (/\b(video|watch|talk|lecture|podcast|recording|trailer|vimeo|youtube)\b/i.test(text)) {
    addScore(scores, "Video & Talks", 3);
  }

  if (/\b(tool|editor|generator|reference|docs?|documentation|api|library|tutorial|guide|cheatsheet|code)\b/i.test(text)) {
    addScore(scores, "Tools & References", 3);
  }

  if (/\b(essay|article|review|journal|manifesto|publication|book|reading|interview)\b/i.test(text)) {
    addScore(scores, "Readings & Essays", 3);
  }

  if (/\b(archive|collection|catalog|exhibition|portfolio|project|museum|gallery|studio)\b/i.test(text)) {
    addScore(scores, "Projects & Archives", 3);
  }

  let bestLabel = "General Links";
  let bestScore = 0;

  for (const label of CATEGORY_ORDER) {
    if (label === "General Links") {
      continue;
    }

    const score = scores.get(label) || 0;
    if (score > bestScore) {
      bestLabel = label;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestLabel : "General Links";
}

function compareCategoryGroups(a, b) {
  const rankA = CATEGORY_RANK.has(a.label)
    ? CATEGORY_RANK.get(a.label)
    : CATEGORY_ORDER.length;
  const rankB = CATEGORY_RANK.has(b.label)
    ? CATEGORY_RANK.get(b.label)
    : CATEGORY_ORDER.length;

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

function groupResourcesByCategory(resources = []) {
  const grouped = new Map();

  for (const resource of resources) {
    const label = resource.category || "General Links";
    const key = slugify(label) || "general-links";

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label,
        items: [],
      });
    }

    grouped.get(key).items.push(resource);
  }

  const groups = Array.from(grouped.values());
  groups.forEach((group) => {
    group.items.sort(compareResourcesWithinCategory);
  });

  groups.sort(compareCategoryGroups);
  return groups;
}

export async function getResourceCatalog() {
  let sheetResources = [];
  let loadError = "";

  try {
    const response = await globalThis.fetch(OPEN_SHEET_URL);
    if (!response.ok) {
      throw new Error(`OpenSheet request failed (${response.status})`);
    }

    const rows = await response.json();
    sheetResources = rows
      .map((row) => {
        const url = extractUrl(row);
        if (!url || !isResourceUrl(url)) {
          return null;
        }

        return {
          url,
          title: extractTitle(row),
          source: "Spreadsheet",
          weekNumbers: [],
          categories: extractCategories(row),
        };
      })
      .filter(Boolean);
  } catch (error) {
    globalThis.console.error("Unable to load resources from OpenSheet:", error);
    loadError = "Spreadsheet unavailable. Showing markdown resources only.";
  }

  let markdownResources = [];
  try {
    markdownResources = await getMarkdownResources();
  } catch (error) {
    globalThis.console.error("Unable to collect markdown resources:", error);
    loadError = loadError
      ? `${loadError} Markdown extraction failed.`
      : "Unable to read markdown resources.";
  }

  const combinedResources = mergeResources(sheetResources, markdownResources);
  const descriptionOverrides = await loadDescriptionOverrides();

  const resources = await mapWithConcurrency(
    combinedResources,
    8,
    async (resource, index) => {
      const openGraphData = await fetchOpenGraphData(resource.url);
      const host = getResourceHost(resource.url);

      const title =
        resource.title ||
        openGraphData.title ||
        getFallbackTitle(resource.url);

      const overrideDescription = getDescriptionOverride(
        descriptionOverrides,
        resource.url,
      );
      const cleanedDescription = cleanDescriptionText(
        overrideDescription || openGraphData.description || "",
      );

      const provisionalDescription = isLowQualityDescription(cleanedDescription)
        ? synthesizeDescription({
            title,
            host,
            category: resource.categories?.[0] || "",
            weekLabel: resource.weekLabel,
          })
        : cleanedDescription;

      const category = inferCategory({
        ...resource,
        host,
        title,
        description: provisionalDescription,
      });

      const description = truncateText(
        isLowQualityDescription(cleanedDescription)
          ? synthesizeDescription({
              title,
              host,
              category,
              weekLabel: resource.weekLabel,
            })
          : provisionalDescription,
        240,
      );

      const { previewImage, fallbackImages } = await pickResourceImages(
        resource.url,
        openGraphData,
        title,
      );

      return {
        id: `resource-${index}`,
        url: resource.url,
        title,
        description,
        host,
        source: resource.source,
        weekLabel: resource.weekLabel,
        weekNumbers: resource.weekNumbers,
        categories: resource.categories,
        category,
        previewImage,
        fallbackImages,
      };
    },
  );

  const resourceCategories = groupResourcesByCategory(resources);

  const resourceSketchImages = resources
    .map((resource) => resource.previewImage)
    .filter(
      (url) =>
        typeof url === "string" &&
        (url.startsWith("/") || /^https?:\/\//i.test(url) || url.startsWith("data:image/")),
    );

  return {
    resources,
    resourceCategories,
    resourceSketchImages,
    loadError,
  };
}
