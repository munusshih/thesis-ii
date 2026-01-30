#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const studentWorkDir = path.join(projectRoot, "public", "student-work");

async function organizeStudentWork() {
  try {
    // Read all files in the student-work directory
    const files = await fs.readdir(studentWorkDir);

    let movedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      // Skip directories and hidden files
      if (file.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(studentWorkDir, file);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        console.log(`Skipping directory: ${file}`);
        skippedCount++;
        continue;
      }

      // Extract student name from filename (pattern: "anything - StudentName.ext")
      const match = file.match(/^(.+?)\s*-\s*(.+?)(\.[^.]+)$/);

      if (!match) {
        console.log(`⚠️  Could not parse student name from: ${file}`);
        skippedCount++;
        continue;
      }

      const [, , studentName, ext] = match;

      // Remove timestamps and extra text, keep only the student name
      // Pattern: remove dates, times, numbers at the start
      let sanitizedStudentName = studentName
        .replace(/^\d{2}-\d{2}(\s+at)?\s+\d{2}\.\d{2}\.\d{2}\s*-?\s*/, "") // Remove "12-14 at 21.58.39 -"
        .replace(/^\d{2}-\d{2}\s+\d{2}\.\d{2}\.\d{2}\s*-?\s*/, "") // Remove "12-14 19.10.34 -"
        .replace(/^\d{2}-\d{2}\s+\d{2}\.\d{2}\.\d{2}\s*/, "") // Remove "12-15 11.18.50"
        .replace(
          /^Screenshot\s+\d{4}-\d{2}-\d{2}\s+at\s+\d{2}\.\d{2}\.\d{2}\s*-?\s*/,
          "",
        ) // Remove "Screenshot 2025-12-14 at 21.58.39 -"
        .replace(/^mushroom-visual-note\s*-?\s*/, "") // Remove "mushroom-visual-note -"
        .replace(/\(\d+\)$/, "") // Remove "(1)" at the end
        .trim();

      // Create student directory if it doesn't exist
      const studentDir = path.join(studentWorkDir, sanitizedStudentName);
      await fs.mkdir(studentDir, { recursive: true });

      // Move file to student directory
      const newPath = path.join(studentDir, file);
      await fs.rename(fullPath, newPath);

      console.log(`✓ Moved: ${file} → ${sanitizedStudentName}/`);
      movedCount++;
    }

    console.log(`\n✅ Organization complete!`);
    console.log(`   Moved: ${movedCount} files`);
    console.log(`   Skipped: ${skippedCount} files`);
  } catch (error) {
    console.error(`❌ Error organizing student work:`, error);
    process.exit(1);
  }
}

organizeStudentWork();
