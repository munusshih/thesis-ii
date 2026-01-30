#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const studentsDataPath = path.join(projectRoot, "src", "data", "students.json");
const studentManifestPath = path.join(projectRoot, "src", "data", "student-websites.manifest.json");
const studentOutputDir = path.join(projectRoot, "public", "student-websites");

const resourcesDataPath = path.join(projectRoot, "src", "data", "resources.json");
const resourceManifestPath = path.join(projectRoot, "src", "data", "resources.manifest.json");
const resourceOutputDir = path.join(projectRoot, "public", "resources");

const AUTH_PATH_SEGMENTS = ["/login", "/signin", "/sign-in", "/sign_in", "/auth/login"];
const SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_HEIGHT = 720;
const OG_META_KEYS = ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"];

const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_REGION) ||
  Boolean(process.env.LAMBDA_TASK_ROOT) ||
  process.env.NODE_ENV === "production";

if (isServerless && process.env.VERCEL) {
  // Hint @sparticuz/chromium to unpack the Lambda compatibility libraries in Vercel builds.
  process.env.AWS_REGION ??= "us-east-1";
  process.env.AWS_EXECUTION_ENV ??= "AWS_Lambda_nodejs20.x";
}

const truthy = (value) => ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
const falsy = (value) => ["0", "false", "no", "off"].includes((value ?? "").toLowerCase());

// Capture by default so Vercel builds still refresh previews; allow opt-out via env toggles.
let shouldCaptureScreenshots = true;

if (process.env.ENABLE_SCREENSHOTS !== undefined) {
  if (truthy(process.env.ENABLE_SCREENSHOTS)) {
    shouldCaptureScreenshots = true;
  } else if (falsy(process.env.ENABLE_SCREENSHOTS)) {
    shouldCaptureScreenshots = false;
  }
}

if (process.env.DISABLE_SCREENSHOTS !== undefined) {
  if (truthy(process.env.DISABLE_SCREENSHOTS)) {
    shouldCaptureScreenshots = false;
  } else if (falsy(process.env.DISABLE_SCREENSHOTS) && process.env.ENABLE_SCREENSHOTS === undefined) {
    shouldCaptureScreenshots = true;
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

await Promise.all([studentOutputDir, resourceOutputDir].map(ensureDir));

async function readJson(filePath, fallback = []) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    console.error(`Failed to read ${path.relative(projectRoot, filePath)}:`, error);
    throw error;
  }
}

function getLauncher(module) {
  const exported = module.default ?? module;
  if (typeof exported.launch !== "function") {
    throw new Error("Puppeteer module does not expose a launch() function.");
  }
  return exported.launch.bind(exported);
}

async function createBrowser() {
  try {
    if (isServerless) {
      const [{ default: chromium }, puppeteerCore] = await Promise.all([
        import("@sparticuz/chromium"),
        import("puppeteer-core"),
      ]);

      const executablePath = await chromium.executablePath();
      const launch = getLauncher(puppeteerCore);

      return await launch({
        executablePath,
        args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
        defaultViewport: { width: 1440, height: 900 },
        headless: chromium.headless ?? true,
      });
    }

    const puppeteer = await import("puppeteer");
    const launch = getLauncher(puppeteer);

    return await launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-crash-reporter",
        "--enable-crash-reporter=false",
        "--disable-breakpad",
      ],
    });
  } catch (error) {
    console.warn("⚠️ Unable to launch Chromium for screenshots.", error);
    return null;
  }
}

async function detectAuthRequirement(page) {
  const finalUrl = page.url();
  if (AUTH_PATH_SEGMENTS.some((segment) => finalUrl.toLowerCase().includes(segment))) {
    return "Authentication required to view this page.";
  }

  const loginDetected = await page.evaluate(() => {
    const passwordField = document.querySelector("input[type='password']");
    const loginButton = Array.from(document.querySelectorAll("button, input[type='submit'], a")).some(
      (element) => {
        const text = (element.textContent || element.value || "").toLowerCase();
        return /log\s?in|sign\s?in/.test(text);
      }
    );

    const bodyText = (document.body?.innerText || "").toLowerCase();
    const loginTextMatches =
      bodyText.includes("log in") ||
      bodyText.includes("sign in") ||
      bodyText.includes("login required") ||
      bodyText.includes("authentication required");

    return Boolean(passwordField && (loginButton || loginTextMatches));
  });

  if (loginDetected) {
    return "Authentication required to view this page.";
  }

  return null;
}

function decodeHtmlEntities(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(Number(dec));
      } catch {
        return _;
      }
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseMetaTags(html) {
  const tags = [];
  const metaRegex = /<meta\s+[^>]*>/gi;
  const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

  let match;
  while ((match = metaRegex.exec(html))) {
    const tag = match[0];
    const attributes = {};
    let attrMatch;

    while ((attrMatch = attrRegex.exec(tag))) {
      const name = attrMatch[1].toLowerCase();
      const value = decodeHtmlEntities(attrMatch[3] ?? attrMatch[4] ?? "");
      attributes[name] = value.trim();
    }

    tags.push(attributes);
  }

  return tags;
}

function resolveLocalImagePath(imagePath) {
  if (!imagePath || imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return null;
  }

  const normalized = imagePath.replace(/^\/+/, "");
  if (normalized.startsWith("public/")) {
    return path.join(projectRoot, normalized);
  }

  return path.join(projectRoot, "public", normalized);
}

async function fileExists(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function shouldReusePreview(previous) {
  if (!previous?.image) {
    return false;
  }

  if (previous.previewType === "og" || previous.previewType === "screenshot") {
    const localPath = resolveLocalImagePath(previous.image);
    return await fileExists(localPath);
  }

  return false;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function cleanupExistingFiles(dir, baseName) {
  try {
    const entries = await fs.readdir(dir);
    const removals = entries
      .filter((name) => name.startsWith(`${baseName}.`))
      .map((name) => fs.rm(path.join(dir, name), { force: true }));
    await Promise.all(removals);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`⚠️ Failed to cleanup existing previews for ${baseName}: ${error.message}`);
    }
  }
}

function getImageExtension(imageUrl, contentType = "") {
  const type = contentType.toLowerCase();
  const typeMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/heic": ".heic",
    "image/heif": ".heif",
  };

  if (typeMap[type]) {
    return typeMap[type];
  }

  try {
    const parsed = new URL(imageUrl);
    const match = parsed.pathname.match(/\.(png|jpe?g|webp|gif|avif|svg|heic|heif|bmp|ico|tiff)$/i);
    if (match) {
      const ext = match[0].toLowerCase();
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {
    // ignore invalid URL
  }

  return ".jpg";
}

async function downloadOgImage(imageUrl, outputDir, baseName, publicPrefix) {
  try {
    const response = await fetchWithTimeout(
      imageUrl,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      },
      20000
    );

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      return null;
    }

    const extension = getImageExtension(imageUrl, contentType);
    const fileName = `${baseName}${extension}`;
    const filePath = path.join(outputDir, fileName);

    await cleanupExistingFiles(outputDir, baseName);

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    return `${publicPrefix}/${fileName}`;
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn(`⚠️ Failed to download OG image ${imageUrl}: ${error.message}`);
    }
    return null;
  }
}

async function fetchOgImage(pageUrl, { slug, outputDir, publicPrefix, baseName }) {
  try {
    const response = await fetchWithTimeout(pageUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("text/html")) {
      return null;
    }

    const html = await response.text();
    const meta = parseMetaTags(html);
    const baseUrl = response.url || pageUrl;

    for (const key of OG_META_KEYS) {
      const match = meta.find((tag) => tag.property === key || tag.name === key);
      const rawContent = match?.content || match?.["data-src"];
      if (!rawContent) {
        continue;
      }

      try {
        const resolved = new URL(rawContent, baseUrl).toString();
        if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
          const localPath = await downloadOgImage(
            resolved,
            outputDir,
            `${baseName || slug}-og`,
            publicPrefix
          );
          if (localPath) {
            return localPath;
          }
        }
      } catch {
        // ignore resolution errors
      }
    }

    return null;
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn(`⚠️ OG fetch failed for ${pageUrl}: ${error.message}`);
    }
    return null;
  }
}

const { slugify } = await import(pathToFileURL(path.join(projectRoot, "src", "utils", "slug.js")).href);

const students = await readJson(studentsDataPath, []);
const studentPreviousManifest = await readJson(studentManifestPath, []);
const studentPreviousBySlug = new Map(studentPreviousManifest.map((entry) => [entry.slug, entry]));

const resourcesData = await readJson(resourcesDataPath, { tabs: [] });
const resourcePreviousManifest = await readJson(resourceManifestPath, []);
const resourcePreviousBySlug = new Map(resourcePreviousManifest.map((entry) => [entry.slug, entry]));

const resourceItems = Array.isArray(resourcesData?.tabs)
  ? resourcesData.tabs.flatMap((tab) =>
      Array.isArray(tab.items)
        ? tab.items.map((item) => ({
            ...item,
            tabTitle: tab.name,
          }))
        : []
    )
  : [];

const studentTargets = students.map((student) => ({
  ...student,
  slug: slugify(student.name),
}));

const screenshotQueue = [];
const timestamp = () => new Date().toISOString();

const studentManifest = [];
const resourceManifest = [];

if (studentTargets.length === 0) {
  console.warn("No student entries found in students.json – skipping student previews.");
}

for (const student of studentTargets) {
  const { slug } = student;
  const previous = studentPreviousBySlug.get(slug);

  if (!student.url) {
    studentManifest.push({
      name: student.name,
      url: null,
      slug,
      image: null,
      capturedAt: null,
      previewType: null,
      error: "Missing project URL.",
    });
    continue;
  }

  if (await shouldReusePreview(previous)) {
    studentManifest.push(previous);
    console.log(`♻️ Reusing preview for ${student.name}`);
    continue;
  }

  const entry = {
    name: student.name,
    url: student.url,
    slug,
    image: null,
    capturedAt: null,
    previewType: null,
  };

  const ogImage = await fetchOgImage(student.url, {
    slug,
    outputDir: studentOutputDir,
    publicPrefix: "/student-websites",
    baseName: slug,
  });
  if (ogImage) {
    entry.image = ogImage;
    entry.capturedAt = timestamp();
    entry.previewType = "og";
    studentManifest.push(entry);
    console.log(`✨ Using OG image for ${student.name}`);
    continue;
  }

  if (!shouldCaptureScreenshots) {
    entry.error = "Preview capture disabled in this environment.";
    studentManifest.push(entry);
    console.log(`⏭️ Skipping screenshot for ${student.name} (disabled).`);
    continue;
  }

  screenshotQueue.push({
    type: "student",
    url: student.url,
    previous,
    entry,
    fileName: `${slug}.png`,
    outputDir: studentOutputDir,
    publicPath: `/student-websites/${slug}.png`,
    manifest: studentManifest,
    label: student.name,
  });
}

if (resourceItems.length === 0) {
  console.warn("No resource entries found in resources.json – skipping resource previews.");
}

for (const item of resourceItems) {
  const { slug } = item;
  const previous = resourcePreviousBySlug.get(slug);

  if (!item.url) {
    resourceManifest.push({
      title: item.title,
      url: null,
      slug,
      tab: item.tab ?? item.tabTitle ?? null,
      image: null,
      capturedAt: null,
      previewType: null,
      error: "No URL provided in sheet.",
    });
    continue;
  }

  if (await shouldReusePreview(previous)) {
    resourceManifest.push(previous);
    console.log(`♻️ Reusing preview for resource: ${item.title}`);
    continue;
  }

  const entry = {
    title: item.title,
    url: item.url,
    slug,
    tab: item.tab ?? item.tabTitle ?? null,
    image: null,
    capturedAt: null,
    previewType: null,
  };

  const ogImage = await fetchOgImage(item.url, {
    slug,
    outputDir: resourceOutputDir,
    publicPrefix: "/resources",
    baseName: slug,
  });
  if (ogImage) {
    entry.image = ogImage;
    entry.capturedAt = timestamp();
    entry.previewType = "og";
    resourceManifest.push(entry);
    console.log(`✨ Using OG image for resource: ${item.title}`);
    continue;
  }

  if (!shouldCaptureScreenshots) {
    entry.error = "Preview capture disabled in this environment.";
    resourceManifest.push(entry);
    console.log(`⏭️ Skipping screenshot for resource: ${item.title} (disabled).`);
    continue;
  }

  screenshotQueue.push({
    type: "resource",
    url: item.url,
    previous,
    entry,
    fileName: `${slug}.png`,
    outputDir: resourceOutputDir,
    publicPath: `/resources/${slug}.png`,
    manifest: resourceManifest,
    label: item.title,
  });
}

let browser = null;
let screenshotCaptureDisabled = false;

if (screenshotQueue.length > 0) {
  if (shouldCaptureScreenshots) {
    browser = await createBrowser();
  } else {
    screenshotCaptureDisabled = true;
  }

  if (!browser) {
    if (screenshotCaptureDisabled) {
      console.log("ℹ️ Screenshot capture disabled; preserving existing previews where possible.");
    } else {
      console.warn("⚠️ Screenshot fallback unavailable; preserving existing previews where possible.");
    }
    for (const item of screenshotQueue) {
      if (item.previous?.image) {
        item.manifest.push(item.previous);
      } else {
        item.entry.error = screenshotCaptureDisabled
          ? "Preview capture disabled in this environment."
          : "Preview unavailable (screenshot skipped).";
        item.manifest.push(item.entry);
      }
    }
  } else {
    for (const item of screenshotQueue) {
      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: SCREENSHOT_WIDTH,
          height: SCREENSHOT_HEIGHT,
          deviceScaleFactor: 1,
        });
        await page.goto(item.url, {
          waitUntil: "networkidle2",
          timeout: 90_000,
        });

        if (typeof page.waitForTimeout === "function") {
          await page.waitForTimeout(1_500);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
        }

        const authMessage = await detectAuthRequirement(page);
        if (authMessage) {
          const authError = new Error(authMessage);
          authError.code = "AUTH_REQUIRED";
          throw authError;
        }

        await page.screenshot({
          path: path.join(item.outputDir, item.fileName),
          fullPage: false,
          clip: {
            x: 0,
            y: 0,
            width: SCREENSHOT_WIDTH,
            height: SCREENSHOT_HEIGHT,
          },
        });

        item.entry.image = item.publicPath;
        item.entry.capturedAt = timestamp();
        item.entry.previewType = "screenshot";
        item.manifest.push(item.entry);
        const prefix = item.type === "student" ? "" : "resource: ";
        console.log(`✅ Captured ${prefix}${item.label}`);
      } catch (error) {
        if (item.previous?.image) {
          item.manifest.push(item.previous);
          console.warn(
            `⚠️ Failed to capture ${item.type === "student" ? "" : "resource "}"${item.label}". Keeping previous preview (${item.previous.image}).`
          );
        } else {
          item.entry.error =
            error?.code === "AUTH_REQUIRED"
              ? "Requires authentication to access shared content."
              : error.message;
          item.manifest.push(item.entry);
          console.warn(`⚠️ Failed to capture ${item.type === "student" ? "" : "resource "}"${item.label}": ${error.message}`);
        }
      } finally {
        await page.close();
      }
    }
  }
}

if (browser) {
  await browser.close();
}

await fs.writeFile(studentManifestPath, JSON.stringify(studentManifest, null, 2));
console.log(`📝 Updated student manifest: ${path.relative(projectRoot, studentManifestPath)}`);

await fs.writeFile(resourceManifestPath, JSON.stringify(resourceManifest, null, 2));
console.log(`📝 Updated resource manifest: ${path.relative(projectRoot, resourceManifestPath)}`);
