import { ReadmeNotFoundError, type DiscoveredRepository } from "./types";

const apiUrl = "https://api.github.com";

interface GitHubRepository {
  name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  fork: boolean;
  owner: {
    login: string;
  };
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "yousefelghoul-portfolio-build",
  };

  if (import.meta.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${import.meta.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function fetchRepositories(path: string): Promise<GitHubRepository[]> {
  const repositories: GitHubRepository[] = [];

  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${apiUrl}${path}${separator}per_page=100&page=${page}`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    console.log(`${apiUrl}${path}${separator}per_page=100&page=${page}`)

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status} for ${path}`);
    }

    const pageRepositories = (await response.json()) as GitHubRepository[];
    repositories.push(...pageRepositories);

    if (pageRepositories.length < 100) break;
  }

  return repositories;
}

function normalizeRepository(repository: GitHubRepository): DiscoveredRepository {
  return {
    provider: "GitHub",
    apiId: `${repository.owner.login}/${repository.name}`,
    owner: repository.owner.login,
    name: repository.name,
    link: repository.html_url,
    defaultBranch: repository.default_branch,
  };
}

export async function getGitHubUserRepositories(username: string) {
  const repositories = await fetchRepositories(`/users/${encodeURIComponent(username)}/repos?type=owner`);
  return repositories.filter((repository) => !repository.private && !repository.fork).map(normalizeRepository);
}

export async function getGitHubOrganizationRepositories(organization: string) {
  const repositories = await fetchRepositories(`/orgs/${encodeURIComponent(organization)}/repos?type=public`);
  return repositories.filter((repository) => !repository.private && !repository.fork).map(normalizeRepository);
}

export async function getGitHubReadme(repository: DiscoveredRepository) {
  const response = await fetch(
    `${apiUrl}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/readme?ref=${encodeURIComponent(repository.defaultBranch)}`,
    { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) },
  );

  if (response.status === 404) {
    throw new ReadmeNotFoundError("GitHub README returned 404");
  }
  if (!response.ok) {
    throw new Error(`GitHub README returned ${response.status}`);
  }

  const file = await response.json() as { path: string; content: string; encoding: string };
  if (file.encoding !== "base64") throw new Error("Unsupported GitHub README encoding");
  repository.readmePath = file.path;
  return new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), (character) => character.charCodeAt(0)));
}
