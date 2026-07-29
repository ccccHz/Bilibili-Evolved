#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const usage = `Usage: node analyze-send-latency.mjs <samples.json> [--margin=300]

Each sample needs category (normal | known-blocked), status (observed |
not-observed), and latencyMs for observed samples. The script prints a JSON
report and never sends a danmaku.`

const percentile = (values, proportion) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil((sorted.length - 1) * proportion)]
}

const toInteger = value => (Number.isFinite(value) ? Math.round(value) : null)
const roundUp100 = value => Math.ceil(value / 100) * 100

const [, , fileName, ...options] = process.argv
if (!fileName) {
  console.error(usage)
  process.exit(1)
}
const marginOption = options.find(option => option.startsWith('--margin='))
const marginMs = Number(marginOption?.slice('--margin='.length) ?? 300)
if (!Number.isFinite(marginMs) || marginMs < 0) {
  throw new Error('--margin must be a non-negative number')
}

const samples = JSON.parse(await readFile(fileName, 'utf8'))
if (!Array.isArray(samples)) {
  throw new Error('samples.json must contain an array')
}

const normal = samples.filter(sample => sample.category === 'normal')
const knownBlocked = samples.filter(sample => sample.category === 'known-blocked')
const normalObservedLatencies = normal
  .filter(sample => sample.status === 'observed' && Number.isFinite(sample.latencyMs))
  .map(sample => sample.latencyMs)
const normalTimedOut = normal.filter(sample => sample.status === 'not-observed')
const blockedObserved = knownBlocked.filter(sample => sample.status === 'observed')
const blockedNotObserved = knownBlocked.filter(sample => sample.status === 'not-observed')

const p95 = percentile(normalObservedLatencies, 0.95)
const maximum = normalObservedLatencies.length === 0 ? null : Math.max(...normalObservedLatencies)
const recommendedWindowMs = p95 === null ? null : roundUp100(p95 + marginMs)

console.log(
  JSON.stringify(
    {
      normal: {
        total: normal.length,
        observed: normalObservedLatencies.length,
        notObserved: normalTimedOut.length,
        notObservedRate: normal.length === 0 ? null : normalTimedOut.length / normal.length,
        latencyMs: {
          p50: toInteger(percentile(normalObservedLatencies, 0.5)),
          p95: toInteger(p95),
          max: toInteger(maximum),
        },
      },
      knownBlocked: {
        total: knownBlocked.length,
        notObserved: blockedNotObserved.length,
        observed: blockedObserved.length,
        observedRate: knownBlocked.length === 0 ? null : blockedObserved.length / knownBlocked.length,
      },
      recommendation: {
        marginMs,
        windowMs: recommendedWindowMs,
        rule: 'normal-message P95 + margin, rounded up to 100ms',
        warning:
          'Use only normal observed messages for the window. Known-blocked samples validate detection quality, not latency.',
      },
    },
    null,
    2,
  ),
)
