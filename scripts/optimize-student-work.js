#!/usr/bin/env node

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(projectRoot, "public", "original-student-work");
const outputDir = path.join(projectRoot, "public", "student-work");
const manifestFile = path.join(projectRoot, "src/data", "student-work.json");

async function optimizeStudentWork() {
  try {
    // Validate source directory exists
    if (!fs.existsSync(sourceDir)) {
      console.error(`❌ Source directory not found: ${sourceDir}`);
      process.exit(1);
    }

    // Clear output directory
    console.log("🗑️  Clearing previous optimizations...");
    if (fs.existsSync(outputDir)) {
      execSync(`find "${outputDir}" -type f -delete`, { stdio: "pipe" });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Map to store student data
    const studentMap = new Map();

    // Get all files from source directory
    const files = fs.readdirSync(sourceDir);
    console.log(`\n📦 Processing ${files.length} files...\n`);

    let processedCount = 0;

    for (const file of files) {
      const filePath = path.join(sourceDir, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      try {
        // Extract student name - look for the pattern " - " (space-dash-space) which separates work from student name
        // This pattern is more specific and avoids matching dashes within work titles
        let match = file.match(/\s-\s([^.]+)\.([^.]+)$/);
        
        if (!match) {
          console.log(`⚠️  Skipping: ${file} (no student name found)`);
          continue;
        }

        let studentName = match[1].trim();
        let ext = match[2].toLowerCase();

        // Normalize student name: remove trailing (1), (2), etc and replace underscores with spaces
        studentName = studentName.replace(/[\s_]*\(\d+\)[\s_]*$/, "").trim();
        studentName = studentName.replace(/_/g, " ").trim();

        // Check actual file type in case extension is wrong
        const fileType = execSync(`file -b "${filePath}"`, {
          encoding: "utf-8",
        }).toLowerCase();
        if (fileType.includes("heif") || fileType.includes("heic")) {
          ext = "heic"; // Treat as HEIC even if extension says otherwise
        }

        // Create student folder
        const studentDir = path.join(outputDir, studentName);
        if (!fs.existsSync(studentDir)) {
          fs.mkdirSync(studentDir, { recursive: true });
        }

        const baseOutputName = file.replace(/\.[^.]+$/, "");

        // Initialize student entry if needed
        if (!studentMap.has(studentName)) {
          studentMap.set(studentName, { images: [], videos: [] });
        }

        const studentData = studentMap.get(studentName);
        const relativeDir = `/student-work/${studentName}`;

        // Process HEIC/HEIF images - convert directly to JPEG using FFmpeg
        if (["heic", "heif"].includes(ext)) {
          const outputPath = path.join(studentDir, `${baseOutputName}.jpg`);
          console.log(`🖼️  JPG (HEIF): ${file}`);

          try {
            // FFmpeg can decode HEIF/HEIC directly if it has HEVC decoder support
            execSync(
              `ffmpeg -i "${filePath}" -c:v mjpeg -q:v 2 "${outputPath}" -y`,
              { stdio: "pipe" },
            );

            studentData.images.push(
              `${relativeDir}/${path.basename(outputPath)}`,
            );
            processedCount++;
          } catch (error) {
            throw new Error(`HEIF conversion failed: ${error.message}`);
          }
        }
        // Process other image formats
        else if (["jpg", "jpeg", "png", "gif"].includes(ext)) {
          const outputPath = path.join(studentDir, `${baseOutputName}.webp`);
          console.log(`🖼️  WebP: ${file}`);

          execSync(
            `ffmpeg -i "${filePath}" -c:v libwebp -quality 90 -vf "scale='min(4096,iw)':'-1'" "${outputPath}" -y`,
            { stdio: "pipe" },
          );

          studentData.images.push(
            `${relativeDir}/${path.basename(outputPath)}`,
          );
          processedCount++;
        }
        // Process video formats
        else if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
          const outputPath = path.join(studentDir, `${baseOutputName}.mp4`);
          console.log(`🎬 MP4: ${file}`);

          execSync(
            `ffmpeg -i "${filePath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -vf "scale='min(1920,iw)':'-2':force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" "${outputPath}" -y`,
            { stdio: "pipe" },
          );

          studentData.videos.push(
            `${relativeDir}/${path.basename(outputPath)}`,
          );
          processedCount++;
        } else {
          console.log(`⏭️  Skipping: ${file} (unsupported format: .${ext})`);
        }
      } catch (error) {
        console.error(`❌ Failed to process ${file}: ${error.message}`);
      }
    }

    // Generate manifest file
    console.log("\n📝 Generating manifest...");

    const manifest = {
      updatedAt: new Date().toISOString(),
      students: Array.from(studentMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, data]) => ({
          name,
          images: data.images.sort(),
          videos: data.videos.sort(),
          totalFiles: data.images.length + data.videos.length,
        })),
    };

    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

    // Summary
    console.log(`\n✅ Optimization complete!`);
    console.log(`📊 Processed: ${processedCount} files`);
    console.log(`👥 Students: ${manifest.students.length}`);
    console.log(`💾 Manifest saved to: ${manifestFile}`);
  } catch (error) {
    console.error(`❌ Error optimizing student work:`, error);
    process.exit(1);
  }
}

optimizeStudentWork();
