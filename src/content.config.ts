import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

const linkList = z
  .array(z.object({ label: z.string(), url: z.string().url() }))
  .default([]);

const publications = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/publications' }),
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    venue: z.string(),
    status: z.string().optional(), // e.g. "Preprint · Under review"
    year: z.number().int(),
    arxiv: z.string().optional(), // arXiv id, e.g. 2405.16266
    abstract: z.string(),
    pdf: z.string().optional(),
    links: linkList,
    citations: z.number().int().optional(), // omitted until verified — never fabricated
    image: z.string().optional(),
    video: z.string().optional(),
    poster: z.string().optional(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    repo: z.string().optional(), // owner/name or bare slug under hamidthri
    description: z.string(),
    result: z.string().optional(), // headline metric
    tags: z.array(z.string()).default([]),
    category: z.enum(['robotics', 'vision3d', 'cv', 'systems', 'ml']),
    badge: z.string().optional(),
    icon: z.string().default('box'),
    featured: z.boolean().default(false),
    archived: z.boolean().default(false),
    image: z.string().optional(), // /media/... or remote url
    video: z.string().optional(),
    poster: z.string().optional(),
    links: linkList,
    order: z.number().default(0),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    description: z.string(),
  }),
});

const news = defineCollection({
  loader: file('./src/content/news/news.json'),
  schema: z.object({
    date: z.coerce.date(),
    text: z.string(),
    link: z.string().url().optional(),
  }),
});

export const collections = { publications, projects, posts, news };
