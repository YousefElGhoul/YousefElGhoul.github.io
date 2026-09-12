import { projectSources } from "../../config/projectSources";
import {
  getGitHubOrganizationRepositories,
  getGitHubReadme,
  getGitHubUserRepositories,
} from "./github";
import {
  getGitLabGroupRepositories,
  getGitLabReadme,
  getGitLabUserRepositories,
} from "./gitlab";
import { projectFromReadme } from "./readme";
import { ReadmeNotFoundError, type DiscoveredRepository, type Project } from "./types";

export type { Project, ProjectRepository, ProjectStatus } from "./types";

let projectsPromise: Promise<Project[]> | undefined;

function repositoryLabel(repository: DiscoveredRepository) {
  return `${repository.provider}/${repository.owner}/${repository.name}`;
}

async function discoverRepositories() {
  const sources = [
    ...projectSources.github.users.map((username) => ({
      label: `GitHub user ${username}`,
      load: () => getGitHubUserRepositories(username),
    })),
    ...projectSources.github.organizations.map((organization) => ({
      label: `GitHub organization ${organization}`,
      load: () => getGitHubOrganizationRepositories(organization),
    })),
    ...projectSources.gitlab.users.map((username) => ({
      label: `GitLab user ${username}`,
      load: () => getGitLabUserRepositories(username),
    })),
    ...projectSources.gitlab.groups.map((group) => ({
      label: `GitLab group ${group}`,
      load: () => getGitLabGroupRepositories(group),
    })),
  ];

  if (sources.length === 0) return [];

  const results = await Promise.allSettled(sources.map((source) => source.load()));
  const repositories: DiscoveredRepository[] = [];
  let successfulSources = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successfulSources += 1;
      repositories.push(...result.value);
      return;
    }

    console.warn(`[projects] Could not discover ${sources[index].label}: ${result.reason}`);
  });

  if (successfulSources === 0) {
    throw new Error("[projects] Project discovery failed for every configured source.");
  }

  return [...new Map(repositories.map((repository) => [
    `${repository.provider}:${repository.apiId}`,
    repository,
  ])).values()];
}

async function loadProjects() {
  const repositories = await discoverRepositories();
  const results = await Promise.allSettled(repositories.map(async (repository) => {
    const readme = repository.provider === "GitHub"
      ? await getGitHubReadme(repository)
      : await getGitLabReadme(repository);
    return projectFromReadme(repository, readme);
  }));

  const projects: Project[] = [];
  const operationalFailures = results.filter((result) => result.status === "rejected" && !(result.reason instanceof ReadmeNotFoundError));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`[projects] Skipping ${repositoryLabel(repositories[index])}: ${result.reason}`);
    } else if (result.value) {
      projects.push(result.value);
    }
  });

  if (operationalFailures.length && !results.some((result) => result.status === "fulfilled")) {
    throw new Error("[projects] No README could be loaded; provider requests failed. Check API availability and tokens.");
  }

  const projectsBySlug = new Map<string, Project>();
  for (const project of projects) {
    const existing = projectsBySlug.get(project.slug);
    if (existing) {
      console.warn(
        `[projects] Duplicate slug "${project.slug}" in ${existing.repository.provider}/${existing.repository.owner}/${existing.repository.name} and ${project.repository.provider}/${project.repository.owner}/${project.repository.name}; keeping the first project.`,
      );
      continue;
    }
    projectsBySlug.set(project.slug, project);
  }

  return [...projectsBySlug.values()].sort((a, b) =>
    b.year.localeCompare(a.year, undefined, { numeric: true }) || a.title.localeCompare(b.title)
  );
}

export function getProjects() {
  projectsPromise ??= loadProjects();
  return projectsPromise;
}
