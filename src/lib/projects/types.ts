export const projectStatuses = [
  "Active",
  "Completed",
  "Maintained",
  "Archived",
  "Planned",
] as const;

export type ProjectProvider = "GitHub" | "GitLab";
export type ProjectStatus = (typeof projectStatuses)[number];

export interface ProjectRepository {
  provider: ProjectProvider;
  owner: string;
  name: string;
  link: string;
  defaultBranch: string;
  readmePath?: string;
}

export interface Project {
  category: string[];
  title: string;
  subtitle: string;
  year: string;
  status: ProjectStatus;
  description: string;
  technologies: string[];
  repository: ProjectRepository;
  live: string | null;
  slug: string;
  readme: string;
}

export interface DiscoveredRepository extends ProjectRepository {
  apiId: string;
}

export class ReadmeNotFoundError extends Error {}
