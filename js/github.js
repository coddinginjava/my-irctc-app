const TOKEN_KEY = 'irctc_github_token';
const SHA_KEY = 'irctc_journeys_sha';

// Update these to match your GitHub repo before deploying
export const GITHUB_OWNER = 'coddinginjava';
export const GITHUB_REPO = 'my-irctc-app';
export const DATA_PATH = 'data/journeys.json';

const API_BASE = 'https://api.github.com';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SHA_KEY);
}

function isAuthenticated() {
  return Boolean(getToken());
}

function getCachedSha() {
  return localStorage.getItem(SHA_KEY);
}

function setCachedSha(sha) {
  if (sha) localStorage.setItem(SHA_KEY, sha);
  else localStorage.removeItem(SHA_KEY);
}

async function githubFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    clearToken();
    throw new Error('Invalid or expired token. Please sign in again.');
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.message || `GitHub API error (${response.status})`);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return null;
  return response.json();
}

function decodeContent(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function fetchJourneysFile() {
  const data = await githubFetch(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_PATH}`
  );

  if (!data) {
    setCachedSha(null);
    return { journeys: [] };
  }

  setCachedSha(data.sha);
  const content = decodeContent(data.content);
  return JSON.parse(content);
}

async function getJourneys() {
  return fetchJourneysFile();
}

async function saveJourneys(journeyData, retry = true) {
  const content = JSON.stringify(journeyData, null, 2) + '\n';
  const sha = getCachedSha();

  const body = {
    message: 'Update journeys',
    content: encodeContent(content),
    ...(sha ? { sha } : {}),
  };

  try {
    const result = await githubFetch(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_PATH}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    setCachedSha(result.content.sha);
    return result;
  } catch (err) {
    if (retry && err.status === 409) {
      await fetchJourneysFile();
      return saveJourneys(journeyData, false);
    }
    throw err;
  }
}

export {
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
  getJourneys,
  saveJourneys,
};
