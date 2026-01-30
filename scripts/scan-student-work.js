#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const studentWorkDir = path.join(projectRoot, "public", "student-work");
const outputPath = path.join(projectRoot, "src", "data", "student-work.json");

async function scanStudentWork() {
  try {
    const entries = await fs.readdir(studentWorkDir, { withFileTypes: true });
    const students = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const studentName = entry.name;
      const studentDir = path.join(studentWorkDir, studentName);
      const files = await fs.readdir(studentDir);

      const images = files
        .filter((file) => /\.(jpg|jpeg|png|gif|heic|webp)$/i.test(file))
        .map((file) => `/student-work/${studentName}/${file}`);

      const videos = files
        .filter((file) => /\.(mp4|mov|avi|webm)$/i.test(file))
        .map((file) => `/student-work/${studentName}/${file}`);

      if (images.length > 0 || videos.length > 0) {
        students.push({
          name: studentName,
          images,
          videos,
          totalFiles: images.length + videos.length,
        });
      }
    }

    // Sort by student name
    students.sort((a, b) => a.name.localeCompare(b.name));

    const manifest = {
      updatedAt: new Date().toISOString(),
      students,
    };

    await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));

    console.log(`✅ Student work manifest created: src/data/student-work.json`);
    console.log(
      `   Found ${students.length} students with ${students.reduce((sum, s) => sum + s.totalFiles, 0)} total files`,
    );
    students.forEach((s) => {
      console.log(
        `   - ${s.name}: ${s.images.length} images, ${s.videos.length} videos`,
      );
    });
  } catch (error) {
    console.error(`❌ Error scanning student work:`, error);
    process.exit(1);
  }
}

scanStudentWork();
