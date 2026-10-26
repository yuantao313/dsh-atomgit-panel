/**
 * Tests for the host half's pure logic.
 *
 * These cover the three areas that have broken before or would break silently:
 * credential naming, lamp resolution, and state normalisation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  maskToken,
  normalizeLights,
  normalizeQuickActions,
  normalizeState,
  parseRepoSpec,
  pipelineLight,
  reviewLight,
} from '../index.js'

/* ------------------------------------------------------------ credentials */

test('credential keys must follow the "<scope>/<id>" grammar', async () => {
  // The kernel rejects a non-conforming record when it parses the credentials
  // document at boot, and a failure there stops the whole application. The
  // write path does not check, so the shape is asserted here instead.
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8'),
  )
  const keys = [...source.matchAll(/^const (?:TOKEN|REFRESH)_KEY = '([^']+)'/gm)].map((m) => m[1])
  assert.equal(keys.length, 2, 'both credential keys are declared')
  for (const key of keys) {
    const segments = key.split('/')
    assert.equal(segments.length, 2, `${key} must have exactly two segments`)
    for (const segment of segments) {
      assert.match(segment, /^[a-z][a-z0-9-]*$/, `${key} segment "${segment}" must be lowercase`)
    }
  }
  const packageName = JSON.parse(
    await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ),
  ).name
  for (const key of keys) {
    assert.equal(key.split('/')[0], packageName, 'the scope is the package name')
  }
})

test('a token is shown only by its last four characters', () => {
  assert.equal(maskToken('abcdefghijklmnop'), '••••••••mnop')
  assert.equal(maskToken('abc'), '••••••••')
  assert.equal(maskToken(null), '')
})

/* ------------------------------------------------------------------ lamps */

test('the worst pipeline state wins across rows', () => {
  const rows = [
    { SUCCESS: ['ci-ok'], RUNNING: [], FAILURE: [] },
    { SUCCESS: [], RUNNING: [], FAILURE: ['rdv-fail'] },
  ]
  const result = pipelineLight(['ci-ok', 'rdv-fail'], rows)
  assert.equal(result.state, 'FAILURE')
  assert.equal(result.matched, 2)
  assert.equal(result.total, 2)
})

test('a pipeline row without a matching label does not count as reporting', () => {
  const rows = [
    { SUCCESS: ['ci-ok'], RUNNING: [], FAILURE: [] },
    { SUCCESS: ['rdv-ok'], RUNNING: [], FAILURE: [] },
  ]
  const result = pipelineLight(['ci-ok'], rows)
  assert.equal(result.state, 'SUCCESS')
  assert.equal(result.matched, 1, 'one of two pipelines reported')
  assert.equal(result.total, 2, 'the denominator counts pipelines, not labels')
})

test('labels match regardless of case', () => {
  const rows = [{ SUCCESS: ['RDV-SUCC'], RUNNING: [], FAILURE: [] }]
  const result = pipelineLight(['rdv-succ'], rows)
  assert.equal(result.state, 'SUCCESS')
})

test('review is binary: complete or not, never "running"', () => {
  const partial = reviewLight(['lgtm'], ['lgtm', 'approved'])
  assert.equal(partial.state, null)
  assert.equal(partial.matched, 1)
  assert.equal(partial.total, 2)

  const complete = reviewLight(['lgtm', 'approved'], ['lgtm', 'approved'])
  assert.equal(complete.state, 'SUCCESS')

  const missing = reviewLight([], ['lgtm'])
  assert.equal(missing.state, null)
  assert.equal(missing.matched, 0)
})

/* --------------------------------------------------------- configuration */

test('label configuration is stored as pipeline rows plus a review list', () => {
  const lights = normalizeLights({
    pipeline: [
      { SUCCESS: ['ci-passed'], RUNNING: ['ci-running'], FAILURE: ['ci-failed'] },
      { SUCCESS: ['rdv-succ'], RUNNING: [], FAILURE: ['rdv-fail'] },
    ],
    review: ['lgtm', 'approved'],
    discussions: true,
  })
  assert.equal(lights.pipeline.length, 2)
  assert.deepEqual(lights.review, ['lgtm', 'approved'])
  assert.equal(lights.discussions, true)
})

test('an empty pipeline row is dropped', () => {
  const lights = normalizeLights({ pipeline: [{ SUCCESS: [], RUNNING: [], FAILURE: [] }], review: [] })
  assert.equal(lights.pipeline.length, 0)
})

test('quick actions keep a multi-line comment and drop empty rows', () => {
  const actions = normalizeQuickActions([
    { key: 'L+A', body: '/lgtm\n/approve' },
    { key: '', body: '/x' },
    { key: 'X', body: '   ' },
  ])
  assert.equal(actions.length, 1)
  assert.equal(actions[0].body, '/lgtm\n/approve')
})

test('a repository spec accepts a full URL and rejects nonsense', () => {
  assert.deepEqual(parseRepoSpec('cann/catlass'), { owner: 'cann', repo: 'catlass' })
  assert.deepEqual(parseRepoSpec('https://atomgit.com/cann/catlass'), { owner: 'cann', repo: 'catlass' })
  assert.deepEqual(parseRepoSpec('https://atomgit.com/cann/catlass.git'), { owner: 'cann', repo: 'catlass' })
  assert.equal(parseRepoSpec('justoneword'), null)
})

/* ------------------------------------------------------------------ state */

test('state normalisation clamps the interval and drops stale auth fields', () => {
  const state = normalizeState({
    config: { intervalSec: 5 },
    auth: { method: 'oauth', login: 'someone', profileUrl: 'https://example.com/x' },
    watched: [{ owner: 'a', repo: 'b' }],
  })
  assert.equal(state.config.intervalSec, 30, 'below the floor, clamped up')
  assert.equal(state.auth.profileUrl, null, 'a stored profile URL is not carried over')
  assert.equal(state.watched.length, 1)
})

test('state normalisation survives a missing document', () => {
  const state = normalizeState(null)
  assert.equal(state.watched.length, 0)
  assert.equal(state.active, null)
  assert.equal(state.config.intervalSec, 120)
})
