// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedRemote {
  /** GitHub owner (user or organization) */
  owner: string;
  /** Repository name */
  repo: string;
  /** The full `owner/repo` path */
  path: string;
}

/** Result of checking whether a GitHub repository exists */
export interface RepoValidationResult {
  exists: boolean;
  owner: string;
  repo: string;
  /** HTTP status returned by the GitHub API (200 = ok, 404 = not found) */
  status: number;
  /** Human-readable message */
  message: string;
}

// ---------------------------------------------------------------------------
// URL Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a GitHub remote URL into owner and repo components.
 *
 * Supports the following formats:
 *   - https://github.com/owner/repo.git
 *   - https://token@github.com/owner/repo.git
 *   - https://user:token@github.com/owner/repo.git
 *   - git@github.com:owner/repo.git
 *   - git://github.com/owner/repo.git
 *
 * Returns `null` if the URL is not a valid GitHub repository URL.
 */
export function parseGithubRemoteUrl(url: string): ParsedRemote | null {
  if (!url || typeof url !== 'string') return null;

  let cleanUrl = url.trim();

  // Remove trailing .git if present
  cleanUrl = cleanUrl.replace(/\.git$/, '');

  // Handle SSH format: git@github.com:owner/repo
  const sshMatch = cleanUrl.match(/^git@github\.com:(.+?)\/(.+?)$/);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    return { owner, repo, path: `${owner}/${repo}` };
  }

  // Handle HTTPS format (with or without credentials): https://...owner/repo
  // Strip protocol and optional credentials
  const httpsMatch = cleanUrl.match(
    /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+?)\/([^/]+?)$/,
  );
  if (httpsMatch) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    return { owner, repo, path: `${owner}/${repo}` };
  }

  // Handle git protocol: git://github.com/owner/repo
  const gitMatch = cleanUrl.match(/^git:\/\/github\.com\/([^/]+?)\/([^/]+?)$/);
  if (gitMatch) {
    const owner = gitMatch[1];
    const repo = gitMatch[2];
    return { owner, repo, path: `${owner}/${repo}` };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Repository Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a GitHub repository exists via the GitHub API.
 *
 * Makes a lightweight GET request to `https://api.github.com/repos/{owner}/{repo}`.
 * Returns `{ exists: true }` on 200, `{ exists: false }` on 404, and throws
 * on unexpected HTTP statuses or network errors.
 *
 * @param owner - GitHub owner (user or organization)
 * @param repo  - Repository name
 * @param token - Optional GitHub personal access token (increases rate limit)
 */
export async function validateGithubRepo(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepoValidationResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ValidadeApp-RemoteConfig/1.0',
  };

  if (token) {
    headers.Authorization = `token ${token}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers },
  );

  const status = response.status;

  if (status === 200) {
    return {
      exists: true,
      owner,
      repo,
      status,
      message: `Repositório "${owner}/${repo}" encontrado no GitHub.`,
    };
  }

  if (status === 404) {
    return {
      exists: false,
      owner,
      repo,
      status,
      message: `Repositório "${owner}/${repo}" não encontrado (404).`,
    };
  }

  if (status === 403) {
    return {
      exists: false,
      owner,
      repo,
      status,
      message: 'Limite de taxa da API do GitHub excedido. Tente novamente mais tarde.',
    };
  }

  throw new Error(
    `GitHub API retornou status inesperado ${status} para "${owner}/${repo}".`,
  );
}

// ---------------------------------------------------------------------------
// Remote URL helpers (Node.js only)
// ---------------------------------------------------------------------------

/**
 * Get the current repository remote URL by reading the git config.
 *
 * @param remoteName - Name of the remote (default: "origin")
 * @returns The remote URL, or `null` if not found / not in a git repo.
 */
export async function getCurrentRemoteUrl(
  remoteName = 'origin',
): Promise<string | null> {
  try {
    // This works in Node.js (including Jest tests) via child_process
    const { execSync } = await import('child_process');
    const result = execSync(`git remote get-url ${remoteName}`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Convenience: parse and validate the current project's remote URL in one step.
 *
 * Returns the validation result, or an error result if the URL cannot be parsed.
 */
export async function validateCurrentRemote(
  remoteName = 'origin',
  token?: string,
): Promise<RepoValidationResult & { rawUrl?: string; parsed?: ParsedRemote | null }> {
  const rawUrl = await getCurrentRemoteUrl(remoteName);

  if (!rawUrl) {
    return {
      exists: false,
      owner: '',
      repo: '',
      status: 0,
      rawUrl: undefined,
      parsed: null,
      message: `Remote "${remoteName}" não encontrado. Verifique se o repositório git está configurado.`,
    };
  }

  const parsed = parseGithubRemoteUrl(rawUrl);

  if (!parsed) {
    return {
      exists: false,
      owner: '',
      repo: '',
      status: 0,
      rawUrl,
      parsed: null,
      message: `Não foi possível interpretar a URL do remote "${remoteName}": ${rawUrl}`,
    };
  }

  const validation = await validateGithubRepo(parsed.owner, parsed.repo, token);
  return { ...validation, rawUrl, parsed };
}
