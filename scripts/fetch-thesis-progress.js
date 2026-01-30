#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHEET_ID = "1wMo1agYzYCB2m44idmlzwfn0UdoI69XJhPf4ETtTk90";
const TAB_NAME = "Thesis Progress";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "src", "data");
const outputPath = path.join(dataDir, "thesis-progress.json");

async function fetchThesisProgress() {
  const endpoint = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(TAB_NAME)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${TAB_NAME} – ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

function normalizeStudent(row) {
  const name = (row?.Name ?? "").trim();

  // Skip empty rows
  if (!name) {
    return null;
  }

  return {
    name,
    worldContext: (
      row?.["What is going on in the world related to your topic?"] ?? ""
    ).trim(),
    researchQuestion: (row?.["Research Question"] ?? "").trim(),
    whyMatters: (row?.["Why does that matter?"] ?? "").trim(),
    community: (row?.["What community is this project serving?"] ?? "").trim(),
    explore: (
      row?.["What you intend to explore through your research and design?"] ??
      ""
    ).trim(),
    form: (row?.["What form are you currently experimenting?"] ?? "").trim(),
    endGoal: (
      row?.["What's an end goal? What's the impact you're looking for?"] ?? ""
    ).trim(),
    questions: (row?.["Questions you have or need help on?"] ?? "").trim(),
    link: (row?.["Link to latest iteration"] ?? "").trim(),
  };
}

const rows = await fetchThesisProgress();
const students = rows.map(normalizeStudent).filter(Boolean);

const payload = {
  updatedAt: new Date().toISOString(),
  students,
};

await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));

console.log(
  `📝 Updated thesis progress data: ${path.relative(projectRoot, outputPath)}`,
);
console.log(`   Found ${students.length} students with progress data`);
