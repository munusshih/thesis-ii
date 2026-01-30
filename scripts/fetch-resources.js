#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHEET_ID = "1wMo1agYzYCB2m44idmlzwfn0UdoI69XJhPf4ETtTk90";

const TABS = [
  {
    id: "2",
    name: "Technical / Skills",
    slug: "technical-skills",
  },
  {
    id: "3",
    name: "Research",
    slug: "research",
  },
  {
    id: "4",
    name: "Professional Dev",
    slug: "professional-dev",
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "src", "data");
const outputPath = path.join(dataDir, "resources.json");

const { slugify } = await import(new URL("../src/utils/slug.js", import.meta.url));

async function fetchTab(tabId) {
  const endpoint = `https://opensheet.elk.sh/${SHEET_ID}/${tabId}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Failed to fetch sheet ${tabId} – ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function extractUrlFromFields(fields) {
  for (const field of fields) {
    if (typeof field !== "string") {
      continue;
    }

    const match = field.match(/https?:\/\/[^\s)]+/i);
    if (match) {
      return match[0].replace(/[),.]+$/, "");
    }
  }

  return null;
}

function normalizeRow(row, tab) {
  const title = (row?.Title ?? "").trim();
  if (!title) {
    return null;
  }

  const tag = (row?.Tags ?? "").trim() || null;

  const otherColumns = Object.entries(row ?? {})
    .filter(([key]) => key !== "Title" && key !== "Tags" && row[key])
    .map(([key, value]) => ({
      label: key.trim(),
      value: typeof value === "string" ? value.trim() : value,
    }))
    .filter(({ value }) => value !== "");

  const url = extractUrlFromFields([title, ...otherColumns.map(({ value }) => value)]);

  return {
    tab: tab.slug,
    tabName: tab.name,
    tag,
    title,
    url,
    notes: otherColumns,
    slug: `${tab.slug}-${slugify(title)}`,
  };
}

const results = [];

for (const tab of TABS) {
  const rows = await fetchTab(tab.id);
  const items = rows
    .map((row) => normalizeRow(row, tab))
    .filter(Boolean)
    .map((item, index) => ({
      ...item,
      order: index,
    }));

  if (items.length === 0) {
    console.warn(`⚠️ No rows found for tab "${tab.name}".`);
    continue;
  }

  results.push({
    name: tab.name,
    slug: tab.slug,
    id: tab.id,
    items,
  });
}

const payload = {
  updatedAt: new Date().toISOString(),
  tabs: results,
};

await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));

console.log(`📝 Updated resources data: ${path.relative(projectRoot, outputPath)}`);
