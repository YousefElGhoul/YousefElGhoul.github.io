import { createSatteriMarkdownProcessor, type SatteriMarkdownProcessorOptions } from "@astrojs/markdown-satteri";
import { parseFrontmatter } from "astro/markdown";
import { z } from "astro/zod";
import type { DiscoveredRepository, Project } from "./types";
import { projectStatuses } from "./types";

const portfolioCommentPattern = /<!--\s*\r?\n(---\s*\r?\n[\s\S]*?\r?\n---)\s*\r?\n-->/g;

const portfolioMetadataSchema = z.object({
  title: z.string().trim().min(1),
  subtitle: z.string().trim().min(1),
  type: z.array(z.string().trim().min(1)).min(1),
  status: z.enum(projectStatuses),
  time: z.string().trim().min(1),
  description: z.string().trim().min(1),
  skills: z.array(z.string().trim().min(1)),
  live: z.string().url().refine((url) => /^https?:\/\//i.test(url), "must use HTTP or HTTPS").nullable().optional().default(null),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must use lowercase URL-safe words separated by hyphens"),
});

function repositoryLabel(repository: DiscoveredRepository) {
  return `${repository.provider}/${repository.owner}/${repository.name}`;
}

function warnInvalidMetadata(repository: DiscoveredRepository, details: string) {
  console.warn(`[projects] Invalid portfolio metadata:\n${repositoryLabel(repository)}\n${details}`);
}

export async function projectFromReadme(repository: DiscoveredRepository, readme: string): Promise<Project | null> {
  const comments: { block: string; yaml: string; offset: number }[] = [];
  // Markdown parsing distinguishes real HTML comments from documented examples
  // inside code fences, including this portfolio's own README example.
  const parser = await createSatteriMarkdownProcessor({
    syntaxHighlight: false,
    mdastPlugins: [{
      name: "portfolio-comments",
      options: { position: true },
      image(node, context) { context.removeNode(node); },
      html(node) {
        for (const match of node.value.matchAll(portfolioCommentPattern)) {
          if (node.position?.start.offset !== undefined) {
            comments.push({ block: match[0], yaml: match[1], offset: node.position.start.offset + match.index });
          }
        }
      },
    }],
  });
  await parser.render(readme);

  for (const comment of comments) {
    let frontmatter: Record<string, unknown>;

    try {
      frontmatter = parseFrontmatter(comment.yaml).frontmatter;
    } catch (error) {
      if (comment.yaml.includes("portfolio:")) {
        warnInvalidMetadata(repository, error instanceof Error ? error.message : "Invalid YAML");
        return null;
      }
      continue;
    }

    if (!("portfolio" in frontmatter)) continue;

    const result = portfolioMetadataSchema.safeParse(frontmatter.portfolio);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join(".") || "portfolio"}: ${issue.message}`)
        .join("\n");
      warnInvalidMetadata(repository, details);
      return null;
    }

    return {
      category: result.data.type,
      title: result.data.title,
      subtitle: result.data.subtitle,
      year: result.data.time,
      status: result.data.status,
      description: result.data.description,
      technologies: result.data.skills,
      repository: {
        provider: repository.provider,
        owner: repository.owner,
        name: repository.name,
        link: repository.link,
        defaultBranch: repository.defaultBranch,
        readmePath: repository.readmePath,
      },
      live: result.data.live,
      slug: result.data.slug,
      readme: readme.slice(0, comment.offset) + readme.slice(comment.offset + comment.block.length),
    };
  }

  return null;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function resolveReadmeUrl(url: string, repository: Project["repository"], raw: boolean) {
  url = url.trim();
  if (!url || url.startsWith("#")) {
    return url;
  }
  const external = new URL(url, repository.link);
  if (!["http:", "https:", ...(raw ? [] : ["mailto:"])].includes(external.protocol)) return "";
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("/")) return external.href;

  const parsed = new URL(url, `https://readme.local/${encodePath(repository.readmePath ?? "README.md")}`);
  const path = parsed.pathname.replace(/^\//, "");
  const branch = encodePath(repository.defaultBranch);
  let base: string;

  if (repository.provider === "GitHub") {
    base = raw
      ? `https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/refs/heads/${branch}`
      : `${repository.link}/blob/${branch}`;
  } else {
    base = `${repository.link}/-/${raw ? "raw" : "blob"}/${branch}`;
  }

  return `${base}/${path}${parsed.search}${parsed.hash}`;
}

export async function renderProjectReadme(project: Project) {
  const options: SatteriMarkdownProcessorOptions = {
    // Remote HTML is not trusted. Removing HTML nodes before rendering also
    // prevents scripts, event handlers, and embedded frames from reaching HTML.
    mdastPlugins: [{
      name: "remove-readme-html",
      html(node, context) { context.removeNode(node); },
      image(node, context) {
        try {
          decodeURI(node.url);
        } catch {
          context.removeNode(node);
        }
      },
    }],
    hastPlugins: [{
      name: "repository-readme-links",
      element: {
        filter: ["a", "img"],
        visit(node, context) {
          const property = node.tagName === "img" ? "src" : "href";
          const value = node.properties?.[property];
          if (typeof value !== "string") return;

          try {
            context.setProperty(node, property, resolveReadmeUrl(value, project.repository, node.tagName === "img"));
          } catch {
            context.setProperty(node, property, null);
          }
        },
      },
    }],
  };

  const processor = await createSatteriMarkdownProcessor(options);
  const rendered = await processor.render(project.readme);
  return rendered.code;
}
