import {
  parseGithubRemoteUrl,
  validateGithubRepo,
  getCurrentRemoteUrl,
  validateCurrentRemote,
} from '@/services/remote-config';

// ===========================================================================
// Mocks
// ===========================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock child_process for getCurrentRemoteUrl tests
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const mockExecSync =
  jest.requireMock('child_process').execSync as jest.Mock;

// ===========================================================================
// parseGithubRemoteUrl
// ===========================================================================

describe('parseGithubRemoteUrl', () => {
  // ── HTTPS format ────────────────────────────────────────────────────────

  it('parses HTTPS URL without credentials', () => {
    const result = parseGithubRemoteUrl('https://github.com/MateusCarneiro0/validade-app.git');
    expect(result).toEqual({
      owner: 'MateusCarneiro0',
      repo: 'validade-app',
      path: 'MateusCarneiro0/validade-app',
    });
  });

  it('parses HTTPS URL with token in credentials', () => {
    const result = parseGithubRemoteUrl(
      'https://MateusCarneiro0:ghp_token123@github.com/MateusCarneiro0/validade-app.git',
    );
    expect(result).toEqual({
      owner: 'MateusCarneiro0',
      repo: 'validade-app',
      path: 'MateusCarneiro0/validade-app',
    });
  });

  it('parses HTTPS URL with only username', () => {
    const result = parseGithubRemoteUrl(
      'https://MateusCarneiro0@github.com/MateusCarneiro0/validade-app.git',
    );
    expect(result).toEqual({
      owner: 'MateusCarneiro0',
      repo: 'validade-app',
      path: 'MateusCarneiro0/validade-app',
    });
  });

  it('parses HTTPS URL without .git suffix', () => {
    const result = parseGithubRemoteUrl('https://github.com/facebook/react');
    expect(result).toEqual({
      owner: 'facebook',
      repo: 'react',
      path: 'facebook/react',
    });
  });

  // ── SSH format ──────────────────────────────────────────────────────────

  it('parses SSH URL (git@github.com:owner/repo.git)', () => {
    const result = parseGithubRemoteUrl('git@github.com:MateusCarneiro0/validade-app.git');
    expect(result).toEqual({
      owner: 'MateusCarneiro0',
      repo: 'validade-app',
      path: 'MateusCarneiro0/validade-app',
    });
  });

  it('parses SSH URL without .git', () => {
    const result = parseGithubRemoteUrl('git@github.com:vercel/next.js');
    expect(result).toEqual({
      owner: 'vercel',
      repo: 'next.js',
      path: 'vercel/next.js',
    });
  });

  // ── Git protocol format ─────────────────────────────────────────────────

  it('parses git:// URL', () => {
    const result = parseGithubRemoteUrl('git://github.com/nodejs/node.git');
    expect(result).toEqual({
      owner: 'nodejs',
      repo: 'node',
      path: 'nodejs/node',
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it('returns null for empty string', () => {
    expect(parseGithubRemoteUrl('')).toBeNull();
  });

  it('returns null for non-GitHub URL', () => {
    expect(parseGithubRemoteUrl('https://gitlab.com/owner/repo.git')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseGithubRemoteUrl('not-a-url-at-all')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(parseGithubRemoteUrl(null as unknown as string)).toBeNull();
    expect(parseGithubRemoteUrl(undefined as unknown as string)).toBeNull();
  });

  it('handles repos with dots in the name', () => {
    const result = parseGithubRemoteUrl('https://github.com/my-org/my.repo.git');
    expect(result).toEqual({
      owner: 'my-org',
      repo: 'my.repo',
      path: 'my-org/my.repo',
    });
  });

  it('handles org names with hyphens', () => {
    const result = parseGithubRemoteUrl('https://github.com/my-org-name/my-repo.git');
    expect(result).toEqual({
      owner: 'my-org-name',
      repo: 'my-repo',
      path: 'my-org-name/my-repo',
    });
  });

  it('trims whitespace from URL', () => {
    const result = parseGithubRemoteUrl('  https://github.com/user/repo.git  ');
    expect(result).toEqual({
      owner: 'user',
      repo: 'repo',
      path: 'user/repo',
    });
  });

  // ── Failsafe: current project remote ────────────────────────────────────

  it('correctly parses the current project remote URL pattern', () => {
    // This is the exact pattern from the project's remote URL
    // (Usando token placeholder para não expor o token real no código)
    const projectUrl =
      'https://MateusCarneiro0:ghp_token_placeholder@github.com/MateusCarneiro0/validade-app.git';
    const result = parseGithubRemoteUrl(projectUrl);

    expect(result).not.toBeNull();
    expect(result!.owner).toBe('MateusCarneiro0');
    expect(result!.repo).toBe('validade-app');
    expect(result!.path).toBe('MateusCarneiro0/validade-app');
  });
});

// ===========================================================================
// validateGithubRepo
// ===========================================================================

describe('validateGithubRepo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns exists=true when API returns 200', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
    });

    const result = await validateGithubRepo('facebook', 'react');

    expect(result.exists).toBe(true);
    expect(result.owner).toBe('facebook');
    expect(result.repo).toBe('react');
    expect(result.status).toBe(200);
    expect(result.message).toContain('encontrado');
  });

  it('returns exists=false when API returns 404', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
    });

    const result = await validateGithubRepo('nonexistent-user', 'nonexistent-repo');

    expect(result.exists).toBe(false);
    expect(result.status).toBe(404);
    expect(result.message).toContain('não encontrado');
  });

  it('returns exists=false with rate-limit message when API returns 403', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 403,
      ok: false,
    });

    const result = await validateGithubRepo('some-user', 'some-repo');

    expect(result.exists).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toContain('Limite de taxa');
  });

  it('includes Authorization header when token is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
    });

    await validateGithubRepo('owner', 'repo', 'ghp_test_token');

    const callUrl = mockFetch.mock.calls[0][0];
    const callHeaders = mockFetch.mock.calls[0][1].headers;

    expect(callUrl).toBe('https://api.github.com/repos/owner/repo');
    expect(callHeaders.Authorization).toBe('token ghp_test_token');
  });

  it('encodes special characters in owner and repo names', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
    });

    await validateGithubRepo('my.owner', 'my.repo');

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('my.owner');
    expect(callUrl).toContain('my.repo');
  });

  it('throws on unexpected HTTP status', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
    });

    await expect(validateGithubRepo('owner', 'repo')).rejects.toThrow(
      'status inesperado 500',
    );
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(validateGithubRepo('owner', 'repo')).rejects.toThrow('Network error');
  });

  it('throws on 301 redirect (unexpected)', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 301,
      ok: false,
    });

    await expect(validateGithubRepo('owner', 'repo')).rejects.toThrow(
      'status inesperado 301',
    );
  });
});

// ===========================================================================
// Integration: parse + validate (mocked)
// ===========================================================================

describe('parse + validate (integração)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses a URL and validates the repo exists (full flow)', async () => {
    const url = 'https://github.com/facebook/react.git';
    const parsed = parseGithubRemoteUrl(url);

    expect(parsed).not.toBeNull();
    expect(parsed!.path).toBe('facebook/react');

    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });

    const result = await validateGithubRepo(parsed!.owner, parsed!.repo);

    expect(result.exists).toBe(true);
    expect(result.owner).toBe('facebook');
    expect(result.repo).toBe('react');
  });

  it('parses a URL and validates the repo does NOT exist', async () => {
    const url = 'https://github.com/fake-owner/fake-repo.git';
    const parsed = parseGithubRemoteUrl(url);

    expect(parsed).not.toBeNull();
    expect(parsed!.path).toBe('fake-owner/fake-repo');

    mockFetch.mockResolvedValueOnce({ status: 404, ok: false });

    const result = await validateGithubRepo(parsed!.owner, parsed!.repo);

    expect(result.exists).toBe(false);
    expect(result.status).toBe(404);
  });
});

// ===========================================================================
// getCurrentRemoteUrl
// ===========================================================================

describe('getCurrentRemoteUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the remote URL when git config has it', async () => {
    mockExecSync.mockReturnValueOnce('https://github.com/owner/repo.git\n');

    const url = await getCurrentRemoteUrl();

    expect(url).toBe('https://github.com/owner/repo.git');
    expect(mockExecSync).toHaveBeenCalledWith(
      'git remote get-url origin',
      expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
    );
  });

  it('returns null when git command fails (not a git repo)', async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('not a git repository');
    });

    const url = await getCurrentRemoteUrl();
    expect(url).toBeNull();
  });

  it('uses custom remote name when provided', async () => {
    mockExecSync.mockReturnValueOnce('https://github.com/upstream/repo.git\n');

    const url = await getCurrentRemoteUrl('upstream');

    expect(url).toBe('https://github.com/upstream/repo.git');
    expect(mockExecSync).toHaveBeenCalledWith(
      'git remote get-url upstream',
      expect.anything(),
    );
  });

  it('returns null when execSync throws non-Error', async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw 'string error';
    });

    const url = await getCurrentRemoteUrl();
    expect(url).toBeNull();
  });

  it('returns null when execSync times out', async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('ETIMEDOUT');
    });

    const url = await getCurrentRemoteUrl();
    expect(url).toBeNull();
  });
});

// ===========================================================================
// validateCurrentRemote
// ===========================================================================

describe('validateCurrentRemote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns error when remote URL cannot be retrieved', async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('not a git repository');
    });

    const result = await validateCurrentRemote();

    expect(result.exists).toBe(false);
    expect(result.rawUrl).toBeUndefined();
    expect(result.message).toContain('não encontrado');
  });

  it('returns error when remote URL cannot be parsed', async () => {
    mockExecSync.mockReturnValueOnce('https://bitbucket.org/user/repo.git\n');

    const result = await validateCurrentRemote();

    expect(result.exists).toBe(false);
    expect(result.rawUrl).toBe('https://bitbucket.org/user/repo.git');
    expect(result.parsed).toBeNull();
    expect(result.message).toContain('Não foi possível interpretar');
  });

  it('validates a valid remote URL successfully (repo exists)', async () => {
    mockExecSync.mockReturnValueOnce('https://github.com/facebook/react.git\n');
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });

    const result = await validateCurrentRemote();

    expect(result.exists).toBe(true);
    expect(result.rawUrl).toBe('https://github.com/facebook/react.git');
    expect(result.parsed).toEqual({
      owner: 'facebook',
      repo: 'react',
      path: 'facebook/react',
    });
    expect(result.message).toContain('encontrado');
  });

  it('validates current repo with the project remote URL pattern', async () => {
    mockExecSync.mockReturnValueOnce(
      'https://MateusCarneiro0:ghp_token@github.com/MateusCarneiro0/validade-app.git\n',
    );
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });

    const result = await validateCurrentRemote();

    expect(result.exists).toBe(true);
    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.owner).toBe('MateusCarneiro0');
    expect(result.parsed!.repo).toBe('validade-app');
    expect(result.parsed!.path).toBe('MateusCarneiro0/validade-app');
  });

  it('passes token to validateGithubRepo when provided', async () => {
    mockExecSync.mockReturnValueOnce('https://github.com/owner/repo.git\n');
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });

    await validateCurrentRemote('origin', 'ghp_test_token');

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBe('token ghp_test_token');
  });

  it('validates when repo does NOT exist on GitHub', async () => {
    mockExecSync.mockReturnValueOnce('https://github.com/fake-user/fake-repo.git\n');
    mockFetch.mockResolvedValueOnce({ status: 404, ok: false });

    const result = await validateCurrentRemote();

    expect(result.exists).toBe(false);
    expect(result.status).toBe(404);
    expect(result.message).toContain('não encontrado');
  });

  it('handles rate limit (403) from GitHub API', async () => {
    mockExecSync.mockReturnValueOnce('https://github.com/some-user/some-repo.git\n');
    mockFetch.mockResolvedValueOnce({ status: 403, ok: false });

    const result = await validateCurrentRemote();

    expect(result.exists).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toContain('Limite de taxa');
  });
});
