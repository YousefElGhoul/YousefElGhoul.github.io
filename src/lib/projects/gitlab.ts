import { ReadmeNotFoundError, type DiscoveredRepository } from "./types";

const apiUrl = "https://gitlab.com/api/v4";

interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string | null;
  readme_url: string | null;
  visibility: string;
  forked_from_project?: unknown;
  namespace: {
    full_path?: string;
    path: string;
  };
}

function gitlabHeaders(): Record<string, string> {
  return import.meta.env.GITLAB_TOKEN
    ? { "PRIVATE-TOKEN": import.meta.env.GITLAB_TOKEN }
    : {};
}

async function fetchProjects(path: string): Promise<GitLabProject[]> {
  const projects: GitLabProject[] = [];

  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${apiUrl}${path}${separator}per_page=100&page=${page}`, {
      headers: gitlabHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`GitLab returned ${response.status} for ${path}`);
    }

    const pageProjects = await response.json() as GitLabProject[];
    projects.push(...pageProjects);
    const nextPage = response.headers.get("x-next-page");
    if (nextPage) page = Number(nextPage) - 1;
    else if (pageProjects.length < 100) break;
  }

  return projects;
}

function getReadmePath(project: GitLabProject) {
  if (!project.readme_url) return undefined;

  try {
    const path = decodeURIComponent(new URL(project.readme_url).pathname);
    const prefix = `${decodeURIComponent(new URL(project.web_url).pathname)}/-/blob/${project.default_branch}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeProject(project: GitLabProject): DiscoveredRepository | null {
  if (!project.default_branch) return null;

  return {
    provider: "GitLab",
    apiId: String(project.id),
    owner: project.namespace.full_path ?? project.namespace.path,
    name: project.path,
    link: project.web_url,
    defaultBranch: project.default_branch,
    readmePath: getReadmePath(project),
  };
}

function normalizeProjects(projects: GitLabProject[]) {
  return projects
    .filter((project) => project.visibility === "public" && !project.forked_from_project)
    .map(normalizeProject)
    .filter((project): project is DiscoveredRepository => project !== null);
}

export async function getGitLabUserRepositories(username: string) {
  const projects = await fetchProjects(
    `/users/${encodeURIComponent(username)}/projects?visibility=public&simple=true`,
  );
  return normalizeProjects(projects);
}

export async function getGitLabGroupRepositories(group: string) {
  const projects = await fetchProjects(
    `/groups/${encodeURIComponent(group)}/projects?visibility=public&simple=true&include_subgroups=true&with_shared=false`,
  );
  return normalizeProjects(projects);
}

export async function getGitLabReadme(repository: DiscoveredRepository) {
  if (!repository.readmePath) {
    throw new ReadmeNotFoundError("GitLab project has no README");
  }

  const response = await fetch(
    `${apiUrl}/projects/${encodeURIComponent(repository.apiId)}/repository/files/${encodeURIComponent(repository.readmePath)}/raw?ref=${encodeURIComponent(repository.defaultBranch)}`,
    { headers: gitlabHeaders(), signal: AbortSignal.timeout(15_000) },
  );

  if (response.status === 404) {
    throw new ReadmeNotFoundError("GitLab README returned 404");
  }
  if (!response.ok) {
    throw new Error(`GitLab README returned ${response.status}`);
  }

  return response.text();
}
