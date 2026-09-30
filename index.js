/**
 * dsh-math-snippets — host half.
 *
 * Holds no composer logic: its whole job is to answer one question the browser
 * cannot answer for itself — "which snippets are configured?" The browser half
 * runs the snippet table; this half reads it off disk and serves it.
 *
 * Source of truth is `~/.dsh/math-snippets.json`, written once as an editable
 * template if it does not exist. The effective table is the built-in defaults
 * merged with that file, so a user file only has to name what it changes.
 *
 *   GET /plugin/math-snippets/table   → { "snippets": { … } }
 *   GET /plugin/math-snippets/status  → mounted + counts (loopback only)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Cordis plugin name. */
export const name = 'math-snippets'

/** Required service: the route registry and request dispatch. */
export const inject = ['webServer']

/** Package name, which is also the client graph row id. */
export const PLUGIN_ID = 'dsh-math-snippets'

/** Route prefix owned by this plugin. */
export const PREFIX = '/plugin/math-snippets'

/** The snippet table route. */
export const TABLE_ROUTE = `${PREFIX}/table`

/** The liveness route. */
export const STATUS_ROUTE = `${PREFIX}/status`

/** Where the editable table lives. */
export const TABLE_FILE = join(homedir(), '.dsh', 'math-snippets.json')

/**
 * Built-in table. Kept identical to the client bundle's own copy: this half
 * writes it out as the editable template, and the browser half falls back to
 * its copy when the route cannot be reached.
 *
 * `body` uses `$1`, `$2` … for holes; the caret lands in the lowest-numbered
 * one and Tab then walks the rest. A single `$0` means "leave the caret at the
 * end" and is walked to last.
 * A tag is either a bare word (`ff`) or a literal run (`//`).
 * `open: true` allows the trigger outside math; every other snippet only fires
 * when the caret sits inside `$…$`, `$$…$$`, `\(…\)` or `\[…\]`.
 * `auto: true` expands on the keystroke that completes the trigger, with no Tab.
 */
export const DEFAULT_SNIPPETS = {
  mk: { body: '$$1$', open: true, desc: 'inline math' },
  dm: { body: '$$\n$1\n$$', open: true, desc: 'display math' },
  ff: { body: '\\frac{$1}{$2}', desc: 'fraction' },
  '//': { body: '\\frac{$1}{$2}', auto: true, desc: 'fraction (LaTeX Suite style)' },
  sq: { body: '\\sqrt{$1}', desc: 'square root' },
  int: { body: '\\int_{$1}^{$2}', desc: 'definite integral' },
  iint: { body: '\\int $1 \\, d$2', desc: 'indefinite integral' },
  sum: { body: '\\sum_{i=1}^{n} $1', desc: 'sum' },
  prod: { body: '\\prod_{i=1}^{n} $1', desc: 'product' },
  lim: { body: '\\lim_{$1 \\to $2}', desc: 'limit' },
  par: { body: '\\frac{\\partial $1}{\\partial $2}', desc: 'partial derivative' },
  sub: { body: '_{$1}', desc: 'subscript' },
  sup: { body: '^{$1}', desc: 'superscript' },
  vec: { body: '\\vec{$1}', desc: 'vector' },
  bar: { body: '\\bar{$1}', desc: 'sample mean' },
  hat: { body: '\\hat{$1}', desc: 'estimator' },
  til: { body: '\\tilde{$1}', desc: 'tilde' },
  bb: { body: '\\mathbb{$1}', desc: 'blackboard bold' },
  cal: { body: '\\mathcal{$1}', desc: 'calligraphic' },
  op: { body: '\\operatorname{$1}', desc: 'operator name' },
  alp: { body: '\\alpha' },
  bet: { body: '\\beta' },
  gam: { body: '\\gamma' },
  del: { body: '\\delta' },
  eps: { body: '\\varepsilon' },
  the: { body: '\\theta' },
  lam: { body: '\\lambda' },
  mu: { body: '\\mu' },
  sig: { body: '\\sigma' },
  rho: { body: '\\rho' },
  phi: { body: '\\varphi' },
  omg: { body: '\\omega' },
  Om: { body: '\\Omega' },
  Sig: { body: '\\Sigma' },
  to: { body: '\\to' },
  inf: { body: '\\infty' },
  cd: { body: '\\cdot' },
  leq: { body: '\\leq' },
  geq: { body: '\\geq' },
  neq: { body: '\\neq' },
  pm: { body: '\\pm' },
  tms: { body: '\\times' },
  inn: { body: '\\in' },
  RR: { body: '\\mathbb{R}' },
  EE: { body: '\\mathbb{E}' },
  VV: { body: '\\operatorname{Var}' },
  CC: { body: '\\operatorname{Cov}' },
  NN: { body: '\\mathcal{N}' }
}

/** Whether the request arrived on a loopback Host. */
export function loopbackHost(req) {
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  if (host.startsWith('[')) return host.startsWith('[::1]')
  const name = host.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost'
}

/** Write one JSON response. */
function sendJson(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    'cache-control': 'no-store'
  })
  res.end(body)
}

/**
 * Read the user's table, if any.
 * @returns the parsed `snippets` mapping, or an empty object.
 */
export function readUserSnippets() {
  let raw
  try {
    raw = readFileSync(TABLE_FILE, 'utf8')
  } catch {
    return {}
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  const snippets = parsed !== null && typeof parsed === 'object' ? parsed.snippets : undefined
  if (snippets === null || typeof snippets !== 'object') return {}
  const out = {}
  for (const [tag, value] of Object.entries(snippets)) {
    const body = value !== null && typeof value === 'object' ? value.body : value
    if (typeof body !== 'string' || body === '') continue
    out[tag] = {
      body,
      ...value !== null && typeof value === 'object' && value.open === true ? { open: true } : {},
      ...value !== null && typeof value === 'object' && value.auto === true ? { auto: true } : {},
      ...value !== null && typeof value === 'object' && typeof value.desc === 'string' ? { desc: value.desc } : {}
    }
  }
  return out
}

/** Write the editable template once, so the table is discoverable. */
function ensureTemplate() {
  try {
    readFileSync(TABLE_FILE, 'utf8')
    return false
  } catch {
    // absent: write the template below
  }
  try {
    mkdirSync(dirname(TABLE_FILE), { recursive: true })
    writeFileSync(TABLE_FILE, `${JSON.stringify({ snippets: DEFAULT_SNIPPETS }, null, 2)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}

/** The effective table: defaults, overridden per tag by the user file. */
export function effectiveSnippets() {
  return { ...DEFAULT_SNIPPETS, ...readUserSnippets() }
}

/**
 * Register the table route for this plugin's lifetime.
 * @param ctx - the host plugin context carrying `webServer`.
 */
export function apply(ctx) {
  const created = ensureTemplate()
  const logger = ctx !== undefined && ctx !== null ? ctx.logger : undefined
  if (created && logger !== undefined && typeof logger.info === 'function') {
    logger.info(`math-snippets: wrote an editable snippet table at ${TABLE_FILE}`)
  }

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: TABLE_ROUTE,
      handler: (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' })
        if (!loopbackHost(req)) return sendJson(res, 403, { error: 'loopback only' })
        sendJson(res, 200, { snippets: effectiveSnippets() })
      }
    }),
    'math-snippets: table route'
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: STATUS_ROUTE,
      handler: (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' })
        if (!loopbackHost(req)) return sendJson(res, 403, { error: 'loopback only' })
        const clientModules = typeof ctx.get === 'function' ? ctx.get('clientModules') : undefined
        const clientPath = clientModules !== undefined && typeof clientModules.clientPath === 'function'
          ? clientModules.clientPath(PLUGIN_ID)
          : undefined
        sendJson(res, 200, {
          plugin: PLUGIN_ID,
          mounted: true,
          clientRegistered: clientPath !== undefined,
          tableFile: TABLE_FILE,
          snippets: Object.keys(effectiveSnippets()).length,
          builtIn: Object.keys(DEFAULT_SNIPPETS).length
        })
      }
    }),
    'math-snippets: status route'
  )
}
