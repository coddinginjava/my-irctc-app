const TOKEN_KEY = 'irctc_github_token';
const SHA_KEY_ENC = 'irctc_journeys_enc_sha';
const SHA_KEY_LEGACY = 'irctc_journeys_legacy_sha';

// Update these to match your GitHub repo before deploying
export const GITHUB_OWNER = 'coddinginjava';
export const GITHUB_REPO = 'my-irctc-app';
export const DATA_PATH = 'data/journeys.enc.json';
export const LEGACY_DATA_PATH = 'data/journeys.json';

const API_BASE = 'https://api.github.com';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SHA_KEY_ENC);
  localStorage.removeItem(SHA_KEY_LEGACY);
}

function isAuthenticated() {
  return Boolean(getToken());
}

function getCachedSha(shaKey) {
  return localStorage.getItem(shaKey);
}

function setCachedSha(shaKey, sha) {
  if (sha) localStorage.setItem(shaKey, sha);
  else localStorage.removeItem(shaKey);
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

async function fetchFile(path, shaKey) {
  const data = await githubFetch(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`
  );

  if (!data) {
    setCachedSha(shaKey, null);
    return null;
  }

  setCachedSha(shaKey, data.sha);
  return {
    sha: data.sha,
    text: decodeContent(data.content),
  };
}

async function putFile(path, text, shaKey, message, retry = true) {
  const sha = getCachedSha(shaKey);
  const body = {
    message,
    content: encodeContent(text),
    ...(sha ? { sha } : {}),
  };

  try {
    const result = await githubFetch(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    setCachedSha(shaKey, result.content.sha);
    return result;
  } catch (err) {
    if (retry && err.status === 409) {
      await fetchFile(path, shaKey);
      return putFile(path, text, shaKey, message, false);
    }
    throw err;
  }
}

async function deleteFile(path, shaKey, message) {
  let sha = getCachedSha(shaKey);
  if (!sha) {
    const file = await fetchFile(path, shaKey);
    if (!file) return;
    sha = file.sha;
  }

  await githubFetch(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha }),
    }
  );
  setCachedSha(shaKey, null);
}

async function getEncryptedEnvelope() {
  const file = await fetchFile(DATA_PATH, SHA_KEY_ENC);
  if (!file) return null;
  return JSON.parse(file.text);
}

async function saveEncryptedEnvelope(envelope) {
  const content = JSON.stringify(envelope, null, 2) + '\n';
  await putFile(DATA_PATH, content, SHA_KEY_ENC, 'Update encrypted journeys');
}

async function getLegacyPlaintextJourneys() {
  const file = await fetchFile(LEGACY_DATA_PATH, SHA_KEY_LEGACY);
  if (!file) return null;
  return JSON.parse(file.text);
}

async function deleteLegacyPlaintextFile() {
  await deleteFile(LEGACY_DATA_PATH, SHA_KEY_LEGACY, 'Remove plaintext journeys after encryption');
}

async function encryptedFileExists() {
  const envelope = await getEncryptedEnvelope();
  return envelope !== null;
}

async function legacyFileExists() {
  const file = await fetchFile(LEGACY_DATA_PATH, SHA_KEY_LEGACY);
  return file !== null;
}

export {
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
  getEncryptedEnvelope,
  saveEncryptedEnvelope,
  getLegacyPlaintextJourneys,
  deleteLegacyPlaintextFile,
  encryptedFileExists,
  legacyFileExists,
};
