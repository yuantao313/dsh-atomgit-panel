/**
 * AtomGit Workbench — host half.
 *
 * Serves the loopback REST route `/api/dsh-atomgit-panel/**` used by the
 * browser half, and registers the `atomgit_tracker` tool.
 *
 * Stored credentials:
 *   DSH_ATOMGIT_TOKEN    access token
 *   DSH_ATOMGIT_REFRESH  OAuth refresh token
 *
 * OAuth application credentials come from the environment; see the constants
 * they feed further down.
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { mkdir, writeFile, rename, chmod } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'atomgit-panel'

export const inject = ['webServer', 'tools']

const API_BASE = '/api/dsh-atomgit-panel'
const API_HOST = 'https://api.atomgit.com'
const WEB_HOST = 'https://atomgit.com'
const OAUTH_TOKEN_URL = `${WEB_HOST}/oauth/token`
const OAUTH_AUTHORIZE_URL = `${WEB_HOST}/oauth/authorize`
const CALLBACK_PATH = `${API_BASE}/oauth/callback`
const ACCOUNT_URL = `${WEB_HOST}/setting`

/**
 * OAuth application credentials. An environment value replaces the built-in one.
 */
const OAUTH_CLIENT_ID = String(process.env.DSH_ATOMGIT_OAUTH_CLIENT_ID ?? '').trim() || '913cc3eb5a8643aab029131ec38da9d8'
const OAUTH_CLIENT_SECRET =
  String(process.env.DSH_ATOMGIT_OAUTH_CLIENT_SECRET ?? '').trim() || '575abd52cda84db389466b765c0fc9bd'
const OAUTH_ENABLED = OAUTH_CLIENT_ID !== '' && OAUTH_CLIENT_SECRET !== ''

// Credential records are addressed as `<scope>/<id>`, with the scope set to this
// package's name.
const TOKEN_KEY = 'dsh-atomgit-panel/token'
const REFRESH_KEY = 'dsh-atomgit-panel/refresh'

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DATA_DIR = join(HOME, 'dsh-atomgit-panel')
const STATE_FILE = join(DATA_DIR, 'state.json')

const MAX_ITEMS = 60
const MAX_ACTIVITY = 300
const REQUEST_TIMEOUT_MS = 20000
const MAX_BODY_BYTES = 256 * 1024
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const DEFAULT_INTERVAL = 120

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null
}

function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function str(value, limit = 400) {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}

function errorText(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}

function repoKey(owner, repo) {
  return `${owner}/${repo}`
}

/**
 * Display rules for labels that already exist on an item: a short caption and a
 * signal kind. Purely presentational — the plugin never adds, removes or
 * changes a label on AtomGit.
 */
function normalizeLabelRules(value) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const raw of value.slice(0, 24)) {
    const record = asRecord(raw) ?? {}
    const name = str(record.name, 80).trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    const kind = ['ci', 'review', 'approval', 'check', 'custom'].includes(record.kind) ? record.kind : 'custom'
    out.push({
      name,
      label: str(record.label, 40).trim() || name,
      kind,
      // A CI label that says "running" (rather than passed or failed) pulses.
      pending: record.pending === true,
    })
  }
  return out
}

/** A quick action is a caption plus the exact comment it posts. */
function normalizeQuickActions(value) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const raw of value.slice(0, 12)) {
    const record = asRecord(raw) ?? {}
    const key = str(record.key, 16).trim()
    const body = str(record.body, 400).trim()
    if (key === '' || body === '' || seen.has(key)) continue
    seen.add(key)
    out.push({ key, body })
  }
  return out
}

const LIGHT_SLOTS = ['pipeline', 'review']
const LIGHT_STATES = ['SUCCESS', 'RUNNING', 'FAILURE']
/** Worst wins: a failure outranks something still running, which outranks success. */
const LIGHT_RANK = { SUCCESS: 1, RUNNING: 2, FAILURE: 3 }

/**
 * Stores a repository's lamp configuration: pipeline rows of three labels each,
 * the labels review requires, and whether code review is tracked.
 */
function normalizeLights(value) {
  const record = asRecord(value) ?? {}

  // `pipeline` is a list of rows; one row is one pipeline and carries the three
  // labels that describe it.
  const pipeline = []
  for (const raw of (Array.isArray(record.pipeline) ? record.pipeline : []).slice(0, 8)) {
    const row = asRecord(raw) ?? {}
    const entry = {}
    let usable = false
    for (const state of LIGHT_STATES) {
      const names = Array.isArray(row[state]) ? row[state] : []
      entry[state] = names
        .map((name) => str(name, 80).trim())
        .filter((name) => name !== '')
        .slice(0, 4)
      if (entry[state].length > 0) usable = true
    }
    if (usable) pipeline.push(entry)
  }

  // `review` is the set of labels an item must carry to count as reviewed.
  const review = (Array.isArray(record.review) ? record.review : [])
    .map((name) => str(name, 80).trim())
    .filter((name) => name !== '')
    .slice(0, 12)

  // Discussion tracking costs one request per pull request, so it is opt-in.
  const discussions = record.discussions === true

  return { pipeline, review, discussions }
}

/** Worst of every pipeline row that matches; a row with no match does not count. */
function pipelineLight(labels, rows) {
  const lowered = new Set(labels.map((name) => name.toLowerCase()))
  const present = []
  let best = null
  // Counted per pipeline, not per label: one of two pipelines reporting is 1/2.
  let reported = 0
  const total = (rows ?? []).length
  for (const row of rows ?? []) {
    let rowBest = null
    for (const state of LIGHT_STATES) {
      for (const name of row[state] ?? []) {
        if (!lowered.has(name.toLowerCase())) continue
        present.push({ name, state })
        if (rowBest === null || LIGHT_RANK[state] > LIGHT_RANK[rowBest]) rowBest = state
      }
    }
    if (rowBest === null) continue
    reported += 1
    if (best === null || LIGHT_RANK[rowBest] > LIGHT_RANK[best]) best = rowBest
  }
  return { state: best, present, matched: reported, total }
}

/** Share of the required review labels the item already carries. */
function reviewLight(labels, required) {
  const lowered = new Set(labels.map((name) => name.toLowerCase()))
  const present = []
  const total = (required ?? []).length
  for (const name of required ?? []) {
    if (lowered.has(name.toLowerCase())) present.push({ name, state: 'SUCCESS' })
  }
  // Review is binary: every required label is there, or it is not.
  const state = total > 0 && present.length === total ? 'SUCCESS' : null
  return { state, present, matched: present.length, total }
}

function parseRepoSpec(input) {
  let text = str(input, 300).trim()
  if (text === '') return null
  text = text.replace(/^https?:\/\/[^/]+\//i, '')
  text = text.replace(/\.git$/i, '')
  text = text.replace(/^\/+|\/+$/g, '')
  const parts = text.split('/').filter((part) => part !== '')
  if (parts.length !== 2) return null
  const owner = parts[0]
  const repo = parts[1]
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(owner) || !/^[A-Za-z0-9._-]{1,120}$/.test(repo)) return null
  return { owner, repo }
}

/** Short, non-reversible display form of a stored token. */
function maskToken(token) {
  if (typeof token !== 'string' || token === '') return ''
  const tail = token.slice(-4)
  return `${'•'.repeat(8)}${tail}`
}

function emptyState() {
  return {
    config: { intervalSec: DEFAULT_INTERVAL },
    auth: { method: null, login: null, profileUrl: null, scope: null, expiresAt: null },
    watched: [],
    active: null,
    seen: {},
    activity: [],
    lastSyncAt: null,
    lastSyncError: null,
  }
}

function normalizeState(parsed) {
  const base = emptyState()
  if (parsed === null) return base
  const config = asRecord(parsed.config) ?? {}
  const auth = asRecord(parsed.auth) ?? {}
  const watched = Array.isArray(parsed.watched)
    ? parsed.watched
        .map((entry) => {
          const record = asRecord(entry) ?? {}
          const owner = str(record.owner, 120)
          const repo = str(record.repo, 120)
          if (owner === '' || repo === '') return null
          return {
            owner,
            repo,
            addedAt: str(record.addedAt, 40) || new Date().toISOString(),
            lights: normalizeLights(record.lights),
            actions: normalizeQuickActions(record.actions),
          }
        })
        .filter((entry) => entry !== null)
    : []
  const seen = {}
  for (const [key, value] of Object.entries(asRecord(parsed.seen) ?? {})) {
    const bucket = asRecord(value)
    if (bucket !== null) seen[key] = bucket
  }
  return {
    config: { intervalSec: clampInt(config.intervalSec, DEFAULT_INTERVAL, 30, 3600) },
    auth: {
      method: auth.method === 'oauth' || auth.method === 'token' ? auth.method : null,
      login: typeof auth.login === 'string' ? auth.login : null,
      // Older builds recorded a per-user page here; the account page is the destination now.
      profileUrl: null,
      scope: typeof auth.scope === 'string' ? auth.scope : null,
      expiresAt: typeof auth.expiresAt === 'string' ? auth.expiresAt : null,
    },
    watched,
    active: typeof parsed.active === 'string' ? parsed.active : null,
    seen,
    activity: Array.isArray(parsed.activity)
      ? parsed.activity.filter((entry) => asRecord(entry) !== null).slice(0, MAX_ACTIVITY)
      : [],
    lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
    lastSyncError: typeof parsed.lastSyncError === 'string' ? parsed.lastSyncError : null,
  }
}

function loadStateSync() {
  try {
    return normalizeState(asRecord(JSON.parse(readFileSync(STATE_FILE, 'utf8'))))
  } catch {
    return emptyState()
  }
}

class AtomGitError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function repoUrl(owner, repo, suffix) {
  return `${API_HOST}/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`
}

function userOf(value) {
  const record = asRecord(value)
  if (record === null) return ''
  return str(record.login ?? record.name ?? record.username, 80)
}

function labelsOf(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 40)
    .map((label) => {
      const record = asRecord(label) ?? {}
      return {
        name: str(record.name ?? record.title, 40),
        color: /^#?[0-9a-fA-F]{3,8}$/.test(String(record.color ?? '')) ? String(record.color) : '',
      }
    })
    .filter((label) => label.name !== '')
}

function issueRecord(raw) {
  const record = asRecord(raw) ?? {}
  const number = Number(record.number ?? record.iid)
  return {
    kind: 'issue',
    number: Number.isFinite(number) ? number : 0,
    title: str(record.title, 300) || `#${String(record.number ?? '')}`,
    state: str(record.state, 30) || 'open',
    author: userOf(record.user),
    assignee: userOf(record.assignee ?? (Array.isArray(record.assignees) ? record.assignees[0] : undefined)),
    assignees: Array.isArray(record.assignees)
      ? record.assignees.map(userOf).filter((name) => name !== '')
      : [userOf(record.assignee)].filter((name) => name !== ''),
    labels: labelsOf(record.labels),
    comments: Number.isFinite(Number(record.comments)) ? Number(record.comments) : 0,
    createdAt: str(record.created_at, 40),
    updatedAt: str(record.updated_at, 40),
    url: str(record.html_url, 400),
    type: str(record.issue_type, 40),
  }
}

function pullRecord(raw) {
  const record = asRecord(raw) ?? {}
  const number = Number(record.number ?? record.iid)
  const merged = typeof record.merged_at === 'string' && record.merged_at !== ''
  const state = merged ? 'merged' : str(record.state, 30) || 'open'
  return {
    kind: 'pr',
    number: Number.isFinite(number) ? number : 0,
    title: str(record.title, 300) || `!${String(record.number ?? '')}`,
    state,
    draft: record.draft === true,
    author: userOf(record.user),
    assignee: userOf(Array.isArray(record.assignees) ? record.assignees[0] : record.assignees),
    assignees: Array.isArray(record.assignees) ? record.assignees.map(userOf).filter((name) => name !== '') : [],
    labels: labelsOf(record.labels),
    comments: Number.isFinite(Number(record.notes ?? record.comments)) ? Number(record.notes ?? record.comments) : 0,
    createdAt: str(record.created_at, 40),
    updatedAt: str(record.updated_at, 40),
    url: str(record.html_url ?? record.web_url, 400),
    sourceBranch: str(record.source_branch ?? asRecord(record.head)?.ref, 120),
    targetBranch: str(record.target_branch ?? asRecord(record.base)?.ref, 120),
    mergedAt: merged ? str(record.merged_at, 40) : '',
  }
}

function commentRecord(raw) {
  const record = asRecord(raw) ?? {}
  return {
    id: String(record.id ?? ''),
    author: userOf(record.user),
    body: str(record.body, 4000),
    createdAt: str(record.created_at ?? record.createdAt, 40),
  }
}

export function apply(ctx) {
  let state = loadStateSync()
  const snapshots = new Map()
  const inflight = new Map()
  const oauthAttempts = new Map()
  const secretCache = new Map()

  const credentials = () => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
    } catch {
      return undefined
    }
  }

  async function readSecret(key) {
    if (secretCache.has(key)) return secretCache.get(key)
    const service = credentials()
    if (service && typeof service.readRecord === 'function') {
      try {
        const record = await service.readRecord(key)
        const value = asRecord(record)?.key
        const resolved = typeof value === 'string' && value !== '' ? value : null
        secretCache.set(key, resolved)
        if (resolved !== null) return resolved
      } catch {
        /* no stored record */
      }
    }
    secretCache.set(key, null)
    return null
  }

  async function writeSecret(key, value) {
    secretCache.set(key, value)
    const service = credentials()
    if (service && typeof service.modifyRecord === 'function') {
      try {
        await service.modifyRecord(key, async () => (value === null ? undefined : { kind: 'api-key', key: value }))
        return true
      } catch {
        return false
      }
    }
    return false
  }

  async function authSnapshot() {
    const token = await readSecret(TOKEN_KEY)
    return {
      signedIn: token !== null,
      tokenConfigured: token !== null,
      tokenPreview: maskToken(token),
      method: state.auth.method,
      login: state.auth.login,
      profileUrl: state.auth.profileUrl ?? (token === null ? null : ACCOUNT_URL),
      scope: state.auth.scope,
      expiresAt: state.auth.expiresAt,
      oauthAvailable: OAUTH_ENABLED,
    }
  }

  async function saveState() {
    try {
      await mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
      const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`
      await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
      await rename(tmp, STATE_FILE)
      await chmod(STATE_FILE, 0o600).catch(() => {})
    } catch {
      /* keep serving from memory when the home directory is read-only */
    }
  }

  function watchedList() {
    return state.watched.map((entry) => ({
      owner: entry.owner,
      repo: entry.repo,
      key: repoKey(entry.owner, entry.repo),
      addedAt: entry.addedAt,
      lights: entry.lights ?? normalizeLights(null),
      actions: entry.actions ?? [],
    }))
  }

  /**
   * Read the review discussions of one pull request.
   *
   * The list endpoint carries no discussion data, so this costs one request per
   * pull request. Only open pull requests are asked about, and the caller caps
   * how many are read in one pass.
   */
  async function codeReviewOf(entry, number, token) {
    // `comment_type=diff_comment` restricts this to code-review threads; the
    // default would also return ordinary pull-request discussion.
    const url = repoUrl(entry.owner, entry.repo, `/pulls/${number}/comments?per_page=100&comment_type=diff_comment`)
    const raw = await requestJson(url, token, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
    const list = Array.isArray(raw) ? raw : []
    const total = list.length
    const resolved = list.filter((comment) => asRecord(comment)?.resolved === true).length
    return { total, resolved, unresolved: total - resolved }
  }

  /**
   * Resolve every unresolved discussion on one pull request.
   *
   * Each comment the API reports as unresolved is set to resolved. Failures are
   * counted rather than retried, and the pull request is re-read afterwards so
   * the caller sees the state that actually resulted.
   */
  async function resolveCodeReview(entry, number) {
    if (!Number.isFinite(number) || number <= 0) {
      return { ok: false, error: { code: 'bad-number', message: 'number must be a positive integer' } }
    }
    const token = await readSecret(TOKEN_KEY)
    if (token === null) {
      return { ok: false, error: { code: 'unauthorized', message: 'Sign in before resolving discussions.' } }
    }
    let comments
    try {
      const raw = await requestJson(
        repoUrl(entry.owner, entry.repo, `/pulls/${number}/comments?per_page=100&comment_type=diff_comment`),
        token,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      )
      comments = Array.isArray(raw) ? raw : []
    } catch (error) {
      return { ok: false, error: { code: 'read-failed', message: errorText(error) } }
    }
    const targets = comments
      .map((comment) => asRecord(comment))
      .filter((comment) => comment !== null && comment.resolved !== true && str(comment.discussion_id, 80) !== '')
    if (targets.length === 0) {
      return { ok: true, resolvedNow: 0, failed: 0, alreadyResolved: comments.length }
    }
    let resolvedNow = 0
    let failed = 0
    for (const comment of targets) {
      const discussionId = str(comment.discussion_id, 80)
      try {
        const response = await fetch(
          repoUrl(entry.owner, entry.repo, `/pulls/${number}/comments/${encodeURIComponent(discussionId)}`),
          {
            method: 'PUT',
            headers: { accept: 'application/json', 'content-type': 'application/json', 'PRIVATE-TOKEN': token },
            body: JSON.stringify({ resolved: true }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        )
        if (response.ok) resolvedNow += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
    // The item's own state changed, so the cached snapshot no longer holds.
    snapshots.delete(repoKey(entry.owner, entry.repo))
    return { ok: failed === 0, resolvedNow, failed, attempts: targets.length }
  }

  /** Store one repository's label vocabulary and quick actions. */
  async function setRepoConfig(spec, patch) {
    const parsed = parseRepoSpec(spec)
    if (parsed === null) {
      return { ok: false, error: { code: 'bad-repo', message: 'Use "owner/repo".' } }
    }
    const key = repoKey(parsed.owner, parsed.repo)
    const index = state.watched.findIndex((entry) => repoKey(entry.owner, entry.repo) === key)
    if (index === -1) {
      return { ok: false, error: { code: 'not-watched', message: `${key} is not in the watched list.` } }
    }
    const entry = state.watched[index]
    const next = { ...entry }
    if (patch.lights !== undefined) next.lights = normalizeLights(patch.lights)
    if (patch.actions !== undefined) next.actions = normalizeQuickActions(patch.actions)
    state.watched = [...state.watched.slice(0, index), next, ...state.watched.slice(index + 1)]
    // The cached snapshot holds the previous lights and actions, so drop it:
    // otherwise the panel keeps rendering the configuration it had before.
    snapshots.delete(key)
    await saveState()
    return { ok: true, key, lights: next.lights ?? normalizeLights(null), actions: next.actions ?? [], state: publicState() }
  }

  function resolveRepo(key) {
    const wanted = str(key, 250)
    if (wanted === '') {
      return state.active === null ? null : state.watched.find((entry) => repoKey(entry.owner, entry.repo) === state.active) ?? null
    }
    return state.watched.find((entry) => repoKey(entry.owner, entry.repo) === wanted) ?? null
  }

  function publicState() {
    return {
      config: { ...state.config },
      watched: watchedList(),
      active: state.active,
      lastSyncAt: state.lastSyncAt,
      lastSyncError: state.lastSyncError,
    }
  }

  function transportError(error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return new AtomGitError('timeout', 'AtomGit did not answer in time')
    }
    return new AtomGitError('network', errorText(error))
  }

  async function requestJson(url, token, signal) {
    const headers = { accept: 'application/json' }
    if (typeof token === 'string' && token !== '') headers['PRIVATE-TOKEN'] = token
    let response
    try {
      response = await fetch(url, { headers, signal })
    } catch (error) {
      throw transportError(error)
    }
    if (response.status === 401) throw new AtomGitError('unauthorized', 'AtomGit rejected the access token (401)')
    if (response.status === 403) throw new AtomGitError('forbidden', 'AtomGit refused the request (403)')
    if (response.status === 404) throw new AtomGitError('not-found', 'repository or item not found (404)')
    if (!response.ok) throw new AtomGitError('http', `AtomGit answered HTTP ${response.status}`)
    try {
      return await response.json()
    } catch (error) {
      throw new AtomGitError('bad-json', `AtomGit returned a non-JSON body: ${errorText(error)}`)
    }
  }

  async function refreshAccessToken() {
    if (!OAUTH_ENABLED) return false
    const refresh = await readSecret(REFRESH_KEY)
    if (refresh === null) return false
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
    })
    let response
    try {
      response = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      return false
    }
    let payload = null
    try {
      payload = await response.json()
    } catch {
      return false
    }
    const accessToken = asRecord(payload)?.access_token
    if (typeof accessToken !== 'string' || accessToken === '') return false
    await writeSecret(TOKEN_KEY, accessToken)
    const nextRefresh = asRecord(payload)?.refresh_token
    if (typeof nextRefresh === 'string' && nextRefresh !== '') await writeSecret(REFRESH_KEY, nextRefresh)
    const expiresIn = Number(asRecord(payload)?.expires_in)
    state.auth = {
      ...state.auth,
      method: 'oauth',
      expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    }
    await saveState()
    return true
  }

  async function authorizedJson(url, signal) {
    const token = await readSecret(TOKEN_KEY)
    try {
      return await requestJson(url, token, signal)
    } catch (error) {
      if (error instanceof AtomGitError && error.code === 'unauthorized' && state.auth.method === 'oauth') {
        const refreshed = await refreshAccessToken()
        if (refreshed) return await requestJson(url, await readSecret(TOKEN_KEY), signal)
      }
      throw error
    }
  }

  async function probeIdentity() {
    try {
      const raw = await requestJson(`${API_HOST}/api/v5/user`, await readSecret(TOKEN_KEY), AbortSignal.timeout(10000))
      const record = asRecord(raw)
      const login = str(record?.login ?? record?.name, 120) || null
      state.auth = { ...state.auth, login, profileUrl: ACCOUNT_URL }
    } catch {
      /* the token may be scoped away from /user; keep whatever was known */
    }
    await saveState()
  }

  function foldChanges(key, items) {
    const at = new Date().toISOString()
    const bucket = { ...(asRecord(state.seen[key]) ?? {}) }
    const changes = []
    for (const item of items) {
      const itemKey = `${item.kind}:${item.number}`
      const previous = asRecord(bucket[itemKey])
      if (previous === null) {
        changes.push({ at, repo: key, kind: item.kind, number: item.number, title: item.title, event: 'new', url: item.url })
      } else if (previous.updatedAt !== item.updatedAt || previous.state !== item.state) {
        changes.push({
          at,
          repo: key,
          kind: item.kind,
          number: item.number,
          title: item.title,
          event: item.state === 'closed' || item.state === 'merged' ? 'closed' : 'updated',
          state: item.state,
          url: item.url,
        })
      }
      bucket[itemKey] = { updatedAt: item.updatedAt, state: item.state }
    }
    state.seen = { ...state.seen, [key]: bucket }
    if (changes.length > 0) state.activity = [...changes, ...state.activity].slice(0, MAX_ACTIVITY)
    return changes
  }

  async function fetchRepo(entry, { force = false } = {}) {
    const key = repoKey(entry.owner, entry.repo)
    const cached = snapshots.get(key)
    const fresh = cached !== undefined && Date.now() - Date.parse(cached.fetchedAt) < Math.max(15, state.config.intervalSec) * 1000
    if (!force && fresh) return { ...cached, changes: [], fromCache: true }
    const pending = inflight.get(key)
    if (pending !== undefined) return pending

    const job = (async () => {
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      try {
        const [rawIssues, rawPulls] = await Promise.all([
          authorizedJson(repoUrl(entry.owner, entry.repo, `/issues?state=all&sort=updated&direction=desc&per_page=${MAX_ITEMS}`), signal),
          authorizedJson(repoUrl(entry.owner, entry.repo, `/pulls?state=all&sort=updated&direction=desc&per_page=${MAX_ITEMS}`), signal),
        ])
        const items = [
          ...(Array.isArray(rawIssues) ? rawIssues.map(issueRecord) : []),
          ...(Array.isArray(rawPulls) ? rawPulls.map(pullRecord) : []),
        ].filter((item) => item.number > 0)
        items.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
        const counts = { issuesOpen: 0, issuesClosed: 0, pullsOpen: 0, pullsMerged: 0, pullsClosed: 0 }
        for (const item of items) {
          if (item.kind === 'issue') {
            if (item.state === 'open') counts.issuesOpen += 1
            else counts.issuesClosed += 1
          } else if (item.state === 'merged') counts.pullsMerged += 1
          else if (item.state === 'open') counts.pullsOpen += 1
          else counts.pullsClosed += 1
        }
        const changes = foldChanges(key, items)
        state.lastSyncAt = new Date().toISOString()
        state.lastSyncError = null
        await saveState()
        const result = {
          ok: true,
          repo: { owner: entry.owner, repo: entry.repo, key },
          fetchedAt: new Date().toISOString(),
          intervalSec: state.config.intervalSec,
          counts,
          items,
          changes,
          error: null,
        }
        snapshots.set(key, result)
        return result
      } catch (error) {
        const code = error instanceof AtomGitError ? error.code : 'unknown'
        const result = {
          ok: false,
          repo: { owner: entry.owner, repo: entry.repo, key },
          fetchedAt: new Date().toISOString(),
          intervalSec: state.config.intervalSec,
          counts: null,
          items: [],
          changes: [],
          error: { code, message: errorText(error) },
        }
        state.lastSyncError = `${key}: ${code}: ${errorText(error)}`
        await saveState()
        return result
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, job)
    return job
  }

  async function fetchDetail(entry, kind, number) {
    if (kind !== 'issue' && kind !== 'pr') {
      return { ok: false, error: { code: 'bad-kind', message: 'kind must be "issue" or "pr"' } }
    }
    if (!Number.isFinite(number) || number <= 0) {
      return { ok: false, error: { code: 'bad-number', message: 'number must be a positive integer' } }
    }
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const path = kind === 'issue' ? 'issues' : 'pulls'
    try {
      const [rawItem, rawComments] = await Promise.all([
        authorizedJson(repoUrl(entry.owner, entry.repo, `/${path}/${number}`), signal),
        authorizedJson(repoUrl(entry.owner, entry.repo, `/${path}/${number}/comments?per_page=50`), signal).catch(() => []),
      ])
      const item = kind === 'issue' ? issueRecord(rawItem) : pullRecord(rawItem)
      return {
        ok: true,
        repo: { owner: entry.owner, repo: entry.repo, key: repoKey(entry.owner, entry.repo) },
        item: { ...item, body: str(asRecord(rawItem)?.body, 12000) },
        comments: Array.isArray(rawComments) ? rawComments.map(commentRecord) : [],
      }
    } catch (error) {
      return { ok: false, error: { code: error instanceof AtomGitError ? error.code : 'unknown', message: errorText(error) } }
    }
  }

  /**
   * One filter implementation shared by the panel and the tool, so the two can
   * never disagree about what "mine" or "recently updated" means.
   */
  function filterItems(items, { kind = 'all', stateFilter = 'all', query = '', mine = false, viewer = null, updatedWithinHours = null } = {}) {
    const needle = query.trim().toLowerCase()
    const cutoff =
      Number.isFinite(updatedWithinHours) && updatedWithinHours > 0 ? Date.now() - updatedWithinHours * 3600 * 1000 : null
    return items.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false
      if (stateFilter !== 'all' && item.state !== stateFilter) return false
      if (mine) {
        if (viewer === null || viewer === '') return false
        const login = viewer.toLowerCase()
        const involved =
          item.author.toLowerCase() === login ||
          item.assignee.toLowerCase() === login ||
          (Array.isArray(item.assignees) && item.assignees.some((name) => name.toLowerCase() === login))
        if (!involved) return false
      }
      if (cutoff !== null) {
        const when = Date.parse(item.updatedAt)
        if (!Number.isFinite(when) || when < cutoff) return false
      }
      if (needle !== '' && !`${item.title} ${item.author} #${item.number}`.toLowerCase().includes(needle)) return false
      return true
    })
  }

  function activityFeed(key, limit) {
    const rows = key === null ? state.activity : state.activity.filter((entry) => asRecord(entry)?.repo === key)
    return rows.slice(0, limit)
  }

  async function overview({ force = false, repo = null } = {}) {
    const entry = resolveRepo(repo)
    if (entry === null) {
      return {
        ok: true,
        watched: watchedList(),
        active: state.active,
        configured: false,
        repo: null,
        viewer: state.auth.login,
        reason: state.watched.length === 0 ? 'no-repositories' : 'no-active-repository',
        items: [],
        changes: [],
        activity: activityFeed(null, 40),
      }
    }
    const current = await fetchRepo(entry, { force })
    const rules = entry.lights ?? normalizeLights(null)
    // Code-review state is one request per open pull request, so it is read for
    // a bounded number of them and only when the repository opted in. A cache
    // hit keeps the ratios it already computed: re-reading them would spend the
    // request budget on data that has not changed.
    const previousByItem = new Map(
      (current.items ?? []).map((item) => [`${item.kind}:${item.number}`, item.discussions ?? null]),
    )
    const reuseReview = current.fromCache === true
    const discussionLimit = 30
    let discussionBudget = reuseReview ? 0 : rules.discussions === true ? discussionLimit : 0
    const token = reuseReview ? null : await readSecret(TOKEN_KEY)

    const items = []
    for (const item of current.items) {
      const names = item.labels.map((label) => label.name)
      let discussions = null
      if (
        discussionBudget > 0 &&
        item.kind === 'pr' &&
        item.state === 'open' &&
        token !== null
      ) {
        discussionBudget -= 1
        try {
          discussions = await codeReviewOf(entry, item.number, token)
        } catch {
          discussions = null
        }
      }
      items.push({
        ...item,
        lights: {
          pipeline: pipelineLight(names, rules.pipeline),
          review: reviewLight(names, rules.review),
        },
        discussions: reuseReview ? previousByItem.get(`${item.kind}:${item.number}`) ?? null : discussions,
      })
    }
    // Cache the ratios alongside the items they describe, so the next cache hit
    // has them without asking AtomGit again.
    if (items.some((item) => item.discussions !== null && item.discussions !== undefined)) {
      snapshots.set(repoKey(entry.owner, entry.repo), { ...current, items })
    }
    return {
      ...current,
      items,
      lights: rules,
      actions: entry.actions ?? [],
      watched: watchedList(),
      active: state.active,
      configured: true,
      viewer: state.auth.login,
      activity: activityFeed(repoKey(entry.owner, entry.repo), 40),
    }
  }

  /**
   * Post one comment on an issue or pull request. This is the plugin's only
   * write path: the text comes verbatim from a configured quick action, and a
   * failure is reported rather than retried.
   */
  async function postComment(entry, kind, number, body) {
    if (kind !== 'issue' && kind !== 'pr') {
      return { ok: false, error: { code: 'bad-kind', message: 'kind must be "issue" or "pr"' } }
    }
    if (!Number.isFinite(number) || number <= 0) {
      return { ok: false, error: { code: 'bad-number', message: 'number must be a positive integer' } }
    }
    const text = str(body, 4000).trim()
    if (text === '') {
      return { ok: false, error: { code: 'empty-body', message: 'The comment is empty.' } }
    }
    const token = await readSecret(TOKEN_KEY)
    if (token === null) {
      return { ok: false, error: { code: 'unauthorized', message: 'Sign in before posting a comment.' } }
    }
    const path = kind === 'issue' ? 'issues' : 'pulls'
    const url = repoUrl(entry.owner, entry.repo, `/${path}/${number}/comments`)
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'PRIVATE-TOKEN': token,
        },
        body: JSON.stringify({ body: text }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      return { ok: false, error: { code: 'network', message: errorText(error) } }
    }
    if (response.status === 401) return { ok: false, error: { code: 'unauthorized', message: 'AtomGit rejected the token (401).' } }
    if (response.status === 403) return { ok: false, error: { code: 'forbidden', message: 'AtomGit refused the comment (403).' } }
    if (response.status === 404) return { ok: false, error: { code: 'not-found', message: 'Item not found (404).' } }
    if (!response.ok) {
      let detail = ''
      try {
        const payload = asRecord(await response.json())
        detail = str(payload?.message ?? payload?.error_message, 200)
      } catch {
        /* no body to explain it */
      }
      return { ok: false, error: { code: 'http', message: detail || `AtomGit answered HTTP ${response.status}` } }
    }
    // The comment landed; the item's own state is now stale.
    snapshots.delete(repoKey(entry.owner, entry.repo))
    return { ok: true, body: text }
  }

  function callbackUrl() {
    try {
      const origin = typeof ctx.webServer.getOrigin === 'function' ? ctx.webServer.getOrigin() : ''
      return origin === '' ? CALLBACK_PATH : `${origin}${CALLBACK_PATH}`
    } catch {
      return CALLBACK_PATH
    }
  }

  function sweepOauthAttempts() {
    const cutoff = Date.now() - OAUTH_STATE_TTL_MS
    for (const [key, value] of oauthAttempts) if (value < cutoff) oauthAttempts.delete(key)
  }

  function beginOauth(scope) {
    if (!OAUTH_ENABLED) {
      return {
        ok: false,
        error: {
          code: 'oauth-not-configured',
          message:
            'No OAuth application is configured. Set DSH_ATOMGIT_OAUTH_CLIENT_ID and DSH_ATOMGIT_OAUTH_CLIENT_SECRET, or sign in with a token.',
        },
      }
    }
    sweepOauthAttempts()
    const attempt = randomBytes(16).toString('hex')
    oauthAttempts.set(attempt, Date.now())
    const url = new URL(OAUTH_AUTHORIZE_URL)
    url.searchParams.set('client_id', OAUTH_CLIENT_ID)
    url.searchParams.set('redirect_uri', callbackUrl())
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', attempt)
    url.searchParams.set('scope', str(scope, 120) || 'all')
    return { ok: true, url: url.toString() }
  }

  async function completeOauth(code) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
    })
    let response
    try {
      response = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      return { ok: false, code: 'network', message: errorText(error) }
    }
    let payload = null
    try {
      payload = await response.json()
    } catch {
      return { ok: false, code: 'bad-json', message: `AtomGit answered HTTP ${response.status}` }
    }
    const record = asRecord(payload) ?? {}
    const accessToken = record.access_token
    if (typeof accessToken !== 'string' || accessToken === '') {
      return {
        ok: false,
        code: str(record.error_code_name ?? record.error, 60) || 'token-exchange-failed',
        message: str(record.error_message ?? record.error_description ?? record.error, 300) || `AtomGit answered HTTP ${response.status}`,
      }
    }
    await writeSecret(TOKEN_KEY, accessToken)
    const refreshToken = record.refresh_token
    await writeSecret(REFRESH_KEY, typeof refreshToken === 'string' && refreshToken !== '' ? refreshToken : null)
    const expiresIn = Number(record.expires_in)
    state.auth = {
      method: 'oauth',
      login: null,
      profileUrl: null,
      scope: str(record.scope, 120) || null,
      expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    }
    await saveState()
    await probeIdentity()
    return { ok: true }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]))
  }

  function callbackPage({ ok, title, detail }) {
    const accent = ok ? '#2ea043' : '#d9534f'
    return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         background:#f6f7f8; color:#1f2328; }
  @media (prefers-color-scheme: dark) { body { background:#17191c; color:#e6e8eb; } }
  .card { max-width: 420px; padding: 28px 30px; border-radius: 14px; background:#fff; box-shadow: 0 6px 28px rgba(0,0,0,.10); }
  @media (prefers-color-scheme: dark) { .card { background:#22252a; box-shadow: 0 6px 28px rgba(0,0,0,.45); } }
  .dot { width:10px; height:10px; border-radius:50%; background:${accent}; display:inline-block; margin-right:8px; }
  h1 { font-size:17px; margin:0 0 10px; }
  p { margin:0; color:#5c6370; word-break:break-word; }
  @media (prefers-color-scheme: dark) { p { color:#a6b2c7; } }
</style></head><body><div class="card"><h1><span class="dot"></span>${escapeHtml(title)}</h1>
<p>${escapeHtml(detail)}</p></div></body></html>`
  }

  function sendJson(res, status, value) {
    const body = JSON.stringify(value)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  function sendHtml(res, status, html) {
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(html),
    })
    res.end(html)
  }

  function loopbackHost(req) {
    const host = req.headers?.host
    if (typeof host !== 'string') return null
    let parsed
    try {
      parsed = new URL(`http://${host}`)
    } catch {
      return null
    }
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '[::1]') return null
    return parsed
  }

  function isLoopbackSocket(req) {
    const address = req.socket?.remoteAddress
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }

  function isTrustedApiCall(req) {
    if (!isLoopbackSocket(req)) return false
    const host = loopbackHost(req)
    if (host === null) return false
    if (req.headers['sec-fetch-site'] === 'cross-site') return false
    const origin = req.headers.origin
    if (origin === undefined) return true
    try {
      return new URL(origin).host === host.host
    } catch {
      return false
    }
  }

  async function readJson(req) {
    let size = 0
    const chunks = []
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) throw new AtomGitError('too-large', 'request body is larger than 256 KiB')
      chunks.push(chunk)
    }
    if (chunks.length === 0) return {}
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return asRecord(parsed) ?? {}
    } catch {
      throw new AtomGitError('bad-body', 'request body is not valid JSON')
    }
  }

  async function addRepo(spec) {
    const parsed = parseRepoSpec(spec)
    if (parsed === null) {
      return { ok: false, error: { code: 'bad-repo', message: 'Use "owner/repo", for example openharmony/docs.' } }
    }
    const key = repoKey(parsed.owner, parsed.repo)
    if (state.watched.some((entry) => repoKey(entry.owner, entry.repo) === key)) {
      state.active = key
      await saveState()
      return { ok: true, alreadyWatched: true, key, state: publicState() }
    }
    try {
      await authorizedJson(repoUrl(parsed.owner, parsed.repo, '/issues?state=all&per_page=1'), AbortSignal.timeout(REQUEST_TIMEOUT_MS))
    } catch (error) {
      const code = error instanceof AtomGitError ? error.code : 'unknown'
      if (code === 'not-found') {
        return { ok: false, error: { code: 'not-found', message: `AtomGit has no repository "${key}".` } }
      }
      if (code !== 'unauthorized' && code !== 'forbidden') {
        return { ok: false, error: { code, message: errorText(error) } }
      }
    }
    state.watched = [...state.watched, { ...parsed, addedAt: new Date().toISOString() }]
    state.active = key
    await saveState()
    return { ok: true, key, added: true, state: publicState() }
  }

  async function removeRepo(spec) {
    const parsed = parseRepoSpec(spec) ?? { owner: '', repo: '' }
    const key = repoKey(parsed.owner, parsed.repo)
    const next = state.watched.filter((entry) => repoKey(entry.owner, entry.repo) !== key)
    if (next.length === state.watched.length) {
      return { ok: false, error: { code: 'not-watched', message: `${key} is not in the watched list.` } }
    }
    state.watched = next
    if (state.active === key) state.active = next.length === 0 ? null : repoKey(next[0].owner, next[0].repo)
    snapshots.delete(key)
    const seen = { ...state.seen }
    delete seen[key]
    state.seen = seen
    await saveState()
    return { ok: true, key, state: publicState() }
  }

  async function setActive(spec) {
    if (spec === null) {
      state.active = null
      await saveState()
      return { ok: true, state: publicState() }
    }
    const parsed = parseRepoSpec(spec)
    const key = repoKey(parsed?.owner ?? '', parsed?.repo ?? '')
    if (!state.watched.some((entry) => repoKey(entry.owner, entry.repo) === key)) {
      return { ok: false, error: { code: 'not-watched', message: `${key} is not in the watched list.` } }
    }
    state.active = key
    await saveState()
    return { ok: true, state: publicState() }
  }

  const route = {
    kind: 'prefix',
    path: API_BASE,
    async handler(req, res) {
      const url = new URL(req.url ?? '', 'http://localhost')
      const path = url.pathname.slice(API_BASE.length)
      const method = req.method ?? 'GET'

      if (path === '/oauth/callback' && method === 'GET') {
        if (!isLoopbackSocket(req) || loopbackHost(req) === null) {
          sendHtml(res, 403, callbackPage({ ok: false, title: '无法接受这次回调', detail: 'Only a loopback browser can complete this sign-in.' }))
          return
        }
        const code = str(url.searchParams.get('code'), 400)
        const stateParam = str(url.searchParams.get('state'), 200)
        const error = str(url.searchParams.get('error'), 200)
        if (error !== '') {
          sendHtml(res, 200, callbackPage({ ok: false, title: '授权被取消', detail: `AtomGit returned “${error}”.` }))
          return
        }
        sweepOauthAttempts()
        if (stateParam === '' || !oauthAttempts.has(stateParam)) {
          sendHtml(res, 200, callbackPage({ ok: false, title: '授权已过期', detail: 'Start the sign-in again from Settings → AtomGit 工作台.' }))
          return
        }
        oauthAttempts.delete(stateParam)
        if (code === '') {
          sendHtml(res, 200, callbackPage({ ok: false, title: '缺少授权码', detail: 'AtomGit did not return an authorization code.' }))
          return
        }
        const done = await completeOauth(code)
        if (done.ok) {
          sendHtml(res, 200, callbackPage({ ok: true, title: '已登录 AtomGit', detail: state.auth.login === null ? 'You can close this tab.' : `Signed in as ${state.auth.login}. You can close this tab.` }))
        } else {
          sendHtml(res, 200, callbackPage({ ok: false, title: '登录失败', detail: `${done.code}: ${done.message}` }))
        }
        return
      }

      if (!isTrustedApiCall(req)) {
        sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'loopback only' } })
        return
      }

      try {
        if (method === 'GET' && path === '/state') {
          sendJson(res, 200, { ok: true, state: publicState(), auth: await authSnapshot() })
          return
        }

        if (method === 'POST' && path === '/config') {
          const body = await readJson(req)
          if (body.intervalSec !== undefined) state.config.intervalSec = clampInt(body.intervalSec, state.config.intervalSec, 30, 3600)
          await saveState()
          sendJson(res, 200, { ok: true, state: publicState() })
          return
        }

        if (method === 'POST' && path === '/auth/verify') {
          const body = await readJson(req)
          const candidate = str(body.token, 500).trim()
          if (candidate === '') {
            sendJson(res, 200, { ok: false, valid: false, error: { code: 'empty-token', message: 'Enter a token first.' } })
            return
          }
          try {
            const raw = await requestJson(`${API_HOST}/api/v5/user`, candidate, AbortSignal.timeout(10000))
            sendJson(res, 200, { ok: true, valid: true, login: str(asRecord(raw)?.login ?? asRecord(raw)?.name, 120) || null })
          } catch (error) {
            const code = error instanceof AtomGitError ? error.code : 'unknown'
            sendJson(res, 200, { ok: true, valid: false, error: { code, message: errorText(error) } })
          }
          return
        }

        if (method === 'POST' && path === '/auth/token') {
          const body = await readJson(req)
          const value = str(body.token, 500).trim()
          if (value === '') {
            sendJson(res, 200, { ok: false, error: { code: 'empty-token', message: 'Enter a token first.' } })
            return
          }
          await writeSecret(TOKEN_KEY, value)
          await writeSecret(REFRESH_KEY, null)
          const login = str(body.login, 120) || null
          state.auth = { method: 'token', login, profileUrl: null, scope: null, expiresAt: null }
          await saveState()
          if (login === null) await probeIdentity()
          sendJson(res, 200, { ok: true, state: publicState(), auth: await authSnapshot() })
          return
        }

        if (method === 'POST' && path === '/auth/signout') {
          await writeSecret(TOKEN_KEY, null)
          await writeSecret(REFRESH_KEY, null)
          state.auth = { method: null, login: null, profileUrl: null, scope: null, expiresAt: null }
          await saveState()
          sendJson(res, 200, { ok: true, state: publicState(), auth: await authSnapshot() })
          return
        }

        if (method === 'POST' && path === '/oauth/start') {
          const body = await readJson(req)
          sendJson(res, 200, beginOauth(body.scope))
          return
        }

        if (method === 'POST' && path === '/repos') {
          const body = await readJson(req)
          sendJson(res, 200, await addRepo(body.repo))
          return
        }

        if (method === 'POST' && path === '/repos/remove') {
          const body = await readJson(req)
          sendJson(res, 200, await removeRepo(body.repo))
          return
        }

        if (method === 'POST' && path === '/repos/active') {
          const body = await readJson(req)
          sendJson(res, 200, await setActive(body.repo === null ? null : body.repo))
          return
        }

        if (method === 'POST' && path === '/repo-config') {
          const body = await readJson(req)
          sendJson(res, 200, await setRepoConfig(body.repo, { lights: body.lights, actions: body.actions }))
          return
        }

        if (method === 'POST' && path === '/resolve') {
          const body = await readJson(req)
          const entry = resolveRepo(str(body.repo, 250) || null)
          if (entry === null) {
            sendJson(res, 200, { ok: false, error: { code: 'no-repository', message: 'No watched repository is selected.' } })
            return
          }
          if ((entry.lights?.discussions ?? false) !== true) {
            sendJson(res, 200, {
              ok: false,
              error: { code: 'not-enabled', message: 'Discussion tracking is off for this repository.' },
            })
            return
          }
          sendJson(res, 200, await resolveCodeReview(entry, Number(body.number)))
          return
        }

        if (method === 'POST' && path === '/comment') {
          const body = await readJson(req)
          const entry = resolveRepo(str(body.repo, 250) || null)
          if (entry === null) {
            sendJson(res, 200, { ok: false, error: { code: 'no-repository', message: 'No watched repository is selected.' } })
            return
          }
          let text = str(body.body, 4000)
          // A named action posts its configured text; a caller may also pass text.
          if (text === '' && typeof body.action === 'string') {
            const configured = (entry.actions ?? []).find((action) => action.key === body.action)
            if (configured === undefined) {
              sendJson(res, 200, { ok: false, error: { code: 'unknown-action', message: `No quick action "${str(body.action, 16)}" is configured for this repository.` } })
              return
            }
            text = configured.body
          }
          sendJson(res, 200, await postComment(entry, str(body.kind, 10), Number(body.number), text))
          return
        }

        if (method === 'GET' && path === '/snapshot') {
          const result = await overview({ force: url.searchParams.get('force') === '1', repo: url.searchParams.get('repo') })
          sendJson(res, 200, { ...result, auth: await authSnapshot() })
          return
        }

        if (method === 'GET' && path === '/item') {
          const entry = resolveRepo(url.searchParams.get('repo'))
          if (entry === null) {
            sendJson(res, 200, { ok: false, error: { code: 'no-repository', message: 'No watched repository is selected.' } })
            return
          }
          sendJson(res, 200, await fetchDetail(entry, url.searchParams.get('kind'), Number(url.searchParams.get('number'))))
          return
        }

        if (method === 'POST' && path === '/refresh') {
          const body = await readJson(req)
          const result = await overview({ force: true, repo: typeof body.repo === 'string' ? body.repo : null })
          sendJson(res, 200, { ...result, auth: await authSnapshot() })
          return
        }

        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown endpoint ${path}` } })
      } catch (error) {
        sendJson(res, 200, { ok: false, error: { code: error instanceof AtomGitError ? error.code : 'internal', message: errorText(error) } })
      }
    },
  }

  ctx.effect(() => ctx.webServer.register(route), 'atomgit-panel: routes')

  const toolDefinition = {
    name: 'atomgit_tracker',
    description:
      'Read AtomGit Issues and Pull Requests for the repositories on the watch list. ' +
      'Actions: status, list, detail, refresh, watch, unwatch, select, configure. Returns JSON.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'list', 'detail', 'refresh', 'watch', 'unwatch', 'select', 'configure'],
          description: 'What to do. Defaults to "status".',
        },
        repo: {
          type: 'string',
          description: 'Repository as "owner/repo". Names the watched repository to read, or the target of watch / unwatch / select.',
        },
        kind: {
          type: 'string',
          enum: ['issue', 'pr', 'all'],
          description: 'For list: which work items to return; for detail: which one to read.',
        },
        number: { type: 'integer', description: 'For detail: the Issue or Pull Request number.' },
        state: {
          type: 'string',
          enum: ['all', 'open', 'closed', 'merged'],
          description: 'For list: filter by state. "merged" applies to pull requests only.',
        },
        query: { type: 'string', description: 'For list: case-insensitive substring match on title, author, or number.' },
        mine: {
          type: 'boolean',
          description: 'For list: only items authored by, or assigned to, the signed-in AtomGit account.',
        },
        updatedWithinHours: {
          type: 'integer',
          description: 'For list: only items whose updatedAt falls inside the last N hours.',
        },
        limit: { type: 'integer', description: 'For list: how many items to return (default 20, max 60).' },
        intervalSec: { type: 'integer', description: 'For configure: refresh interval in seconds (30-3600).' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true, description: 'Tracking state, item lists, details, or watch-list results.' },
      render(args, value) {
        return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
      },
    },
    async execute(args) {
      const input = asRecord(args) ?? {}
      const action = str(input.action, 30) || 'status'

      if (action === 'configure') {
        if (input.intervalSec === undefined) {
          return { ok: false, error: { code: 'nothing-to-change', message: 'Pass intervalSec.' } }
        }
        state.config.intervalSec = clampInt(input.intervalSec, state.config.intervalSec, 30, 3600)
        await saveState()
        return { ok: true, config: { ...state.config } }
      }

      if (action === 'watch') {
        const result = await addRepo(input.repo)
        if (result.ok !== true) return result
        return { ok: true, watched: result.state.watched, active: result.state.active, alreadyWatched: result.alreadyWatched === true }
      }

      if (action === 'unwatch') {
        const result = await removeRepo(input.repo)
        if (result.ok !== true) return result
        return { ok: true, watched: result.state.watched, active: result.state.active }
      }

      if (action === 'select') {
        const result = await setActive(input.repo)
        if (result.ok !== true) return result
        return { ok: true, active: result.state.active }
      }

      if (action === 'list') {
        const current = await overview({ repo: str(input.repo, 250) || null })
        if (current.configured === false) {
          return {
            ok: false,
            error: {
              code: current.watched.length === 0 ? 'no-repositories' : 'no-active-repository',
              message: current.watched.length === 0 ? 'No repository is watched yet.' : 'No active repository is selected.',
            },
            watched: current.watched,
          }
        }
        if (current.ok === false) return { ok: false, error: current.error, repo: current.repo }
        const items = filterItems(current.items, {
          kind: str(input.kind, 10) || 'all',
          stateFilter: str(input.state, 10) || 'all',
          query: str(input.query, 120),
          mine: input.mine === true,
          viewer: current.viewer,
          updatedWithinHours: input.updatedWithinHours === undefined ? null : Number(input.updatedWithinHours),
        }).slice(0, clampInt(input.limit, 20, 1, 60))
        return { ok: true, repo: current.repo, fetchedAt: current.fetchedAt, counts: current.counts, total: current.items.length, items }
      }

      if (action === 'detail') {
        const entry = resolveRepo(str(input.repo, 250) || null)
        if (entry === null) return { ok: false, error: { code: 'no-repository', message: 'No watched repository is selected.' } }
        return fetchDetail(entry, str(input.kind, 10), Number(input.number))
      }

      if (action === 'refresh') {
        const current = await overview({ force: true, repo: str(input.repo, 250) || null })
        if (current.configured === false) {
          return { ok: false, error: { code: 'no-repositories', message: 'No repository is watched yet.' }, watched: current.watched }
        }
        if (current.ok === false) return { ok: false, error: current.error, repo: current.repo }
        return {
          ok: true,
          repo: current.repo,
          fetchedAt: current.fetchedAt,
          counts: current.counts,
          changes: current.changes,
          activity: current.activity.slice(0, 20),
          watched: current.watched,
          active: current.active,
        }
      }

      const auth = await authSnapshot()
      const entry = resolveRepo(str(input.repo, 250) || null)
      const base = {
        configured: entry !== null,
        auth: { method: auth.method, login: auth.login, signedIn: auth.signedIn, expiresAt: auth.expiresAt },
        watched: watchedList(),
        active: state.active,
        intervalSec: state.config.intervalSec,
        lastSyncAt: state.lastSyncAt,
        lastSyncError: state.lastSyncError,
      }
      if (entry === null) {
        return { ...base, activity: activityFeed(null, 20) }
      }
      const current = await fetchRepo(entry, { force: false })
      return {
        ...base,
        repo: current.repo,
        fetchedAt: current.fetchedAt,
        counts: current.counts,
        changes: current.changes,
        activity: activityFeed(repoKey(entry.owner, entry.repo), 20),
        items: current.items.map((item) => ({
          kind: item.kind,
          number: item.number,
          state: item.state,
          title: item.title,
          author: item.author,
          comments: item.comments,
          updatedAt: item.updatedAt,
          url: item.url,
        })),
      }
    },
  }

  ctx.effect(() => ctx.tools.register(toolDefinition), 'atomgit-panel: tool')
}

/* Kept for tooling that inspects exported state helpers. */
export { maskToken, parseRepoSpec, normalizeState }
