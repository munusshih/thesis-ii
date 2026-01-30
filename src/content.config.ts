import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const weeks = defineCollection({
  // Load Markdown and MDX files in the `src/content/weeks/` directory.
  loader: glob({ base: "./src/content/weeks", pattern: "**/*.{md,mdx}" }),
  // Type-check frontmatter using a schema
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(), // Optional description that can include markdown
      week: z.number(), // Week number for ordering
      date: z.string().optional(), // Date of the class
      heroImage: image().optional(),
    }),
});

export const collections = { weeks };
