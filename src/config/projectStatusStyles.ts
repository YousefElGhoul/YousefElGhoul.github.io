import type { ProjectStatus } from "../lib/projects/types";

export const projectStatusClass: Record<ProjectStatus, string> = {
	Active: "text-status-active",
	Completed: "text-status-completed",
	Maintained: "text-status-maintained",
	Archived: "text-status-archived",
	Planned: "text-status-planned",
};
