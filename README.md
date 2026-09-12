# YousefElGhoul.github.io

Personal portfolio built with Astro and Tailwind CSS. The site is statically generated and deployed to GitHub Pages.

## Styling

The complete light and dark color palettes live in `src/styles/theme.css`. Edit the `--site-*` values in `:root` and `.dark` to change a semantic color everywhere without touching component markup or responsive classes.

Components keep their own layout and interaction styles. Shared project status class names live in `src/config/projectStatusStyles.ts`, while their colors remain in the central theme.

## Project Data

Portfolio projects are discovered from public GitHub and GitLab repositories during `astro build`. The configured owners live in `src/config/projectSources.ts`.

The build performs this flow:

1. Discover public, non-fork repositories for each configured GitHub user and organization.
2. Discover public, non-fork projects for each configured GitLab user and group.
3. Fetch each repository's README concurrently.
4. Include only repositories whose README contains valid portfolio metadata.
5. Generate the projects listing and one static `/projects/<slug>/` page per included project.

Nothing fetches provider APIs in a visitor's browser. Repository metadata and README content are part of the generated HTML.

### README Metadata

Add this HTML comment to a repository README to publish it on the portfolio:

```markdown
<!--
---
portfolio:
  title: "Example"
  subtitle: "Example project"
  type:
    - Backend
    - API
  status: "Active"
  time: "2026"
  description: "A short description used on the project card."
  skills:
    - Java
    - Spring Boot
  live: null
  slug: "example"
---
-->
```

Supported statuses are `Active`, `Completed`, `Maintained`, `Archived`, and `Planned`. Slugs must contain lowercase letters or numbers separated by single hyphens. Quote `time` (for example, `"2026"`). `live` may be an HTTP/HTTPS URL, `null`, or omitted.

Only the metadata comment is removed from the stored README body. The remaining Markdown supplies the long-form project page, and relative links and images are resolved against the README directory on the repository's default branch. Fenced metadata examples do not count as opt-in comments.

Rendering supports headings, lists, code blocks, tables, blockquotes, links, and Markdown images. Raw HTML is omitted for safety (including HTML-only images, frames, and scripts); use Markdown image syntax. Links are limited to HTTP, HTTPS, and mailto, and images to HTTP/HTTPS. Relative file links open the repository, not extra portfolio documentation routes.

A repository without the comment is silently ignored. Invalid portfolio metadata is skipped with a warning that identifies the provider, owner, and repository.

### Source Configuration

Edit `src/config/projectSources.ts` only when adding an owner, organization, or group to scan:

```ts
export const projectSources = {
  github: {
    users: ["YousefElGhoul"],
    organizations: [],
  },
  gitlab: {
    users: ["YousefElGhoul"],
    groups: [],
  },
};
```

After an owner is configured, individual projects are controlled entirely through their repository READMEs.

### Build Tokens

Public discovery works without credentials. These optional build-time environment variables increase API limits or support future authenticated builds:

- `GITHUB_TOKEN`
- `GITLAB_TOKEN`

Do not prefix these variables with `PUBLIC_`. For GitHub Actions, the optional `PROJECTS_GITHUB_TOKEN` secret is mapped to the build's `GITHUB_TOKEN`; `GITLAB_TOKEN` is mapped directly. Supply a read-only token that can read the configured public repositories. Leave secrets unset for anonymous fetching. The workflow passes tokens only to the Astro build step.

### Implementation

- `src/lib/projects/types.ts`: shared project/repository interfaces, moved out of the details component.
- `src/lib/projects/github.ts` and `gitlab.ts`: paginated public discovery and default-branch README retrieval, with 15-second request timeouts.
- `src/lib/projects/readme.ts`: actual Markdown comment detection, YAML parsing, schema validation, safe Markdown rendering, and repository-relative URL resolution.
- `src/lib/projects/index.ts`: deduplication, concurrent README loading, contextual warnings, stable sorting, and a memoized build-local promise.
- `src/pages/projects.astro` and `src/pages/projects/[slug].astro`: listing and static detail generation from the same collection.

The existing presentation fields are retained: README `type` is a string array that maps to `category`, while `time` maps to `year` and `skills` to `technologies`. Repository identity is always API-derived. YAML parsing uses Astro's `parseFrontmatter` (backed by `js-yaml`), validation uses `astro/zod`, and rendering uses the same `@astrojs/markdown-satteri` package already included by Astro 7, now declared as a direct dependency.

### Failures and Refresh

Missing READMEs and invalid metadata are warned about and skipped. Missing portfolio metadata is silently ignored. A failed discovery source is warned about while other sources continue; failure of every configured source fails the build. If operational README failures prevent every README from loading, the build also fails. Duplicate slugs warn and keep the first project in configured discovery order. Projects sort by descending year, then title.

Archived repositories remain eligible; forks are excluded. GitLab groups include subgroups but not projects merely shared with the group. GitLab.com and GitHub.com are supported; self-hosted instances are not configured. There is no persistent cache or retry infrastructure.

Adding or removing metadata takes effect on the **next portfolio build**. Upstream repository pushes do not themselves trigger this workflow; use the existing manual Actions trigger or a normal portfolio push. A scheduled refresh can be added later if wanted. The former temporary cards disappear unless their canonical repositories opt in. To include PureSkin repositories, configure their organization and add metadata there.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run astro -- dev --background
npm run build
```
