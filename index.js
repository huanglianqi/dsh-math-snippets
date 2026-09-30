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
 * `body` uses `$0`, `$1`, `$2` … for holes, numbered as LaTeX Suite numbers its
 * tabstops: the caret lands in `$0` and Tab walks the rest in numeric order.
 * `${1:\infty}` parses too, with the default text dropped.
 * A tag is either a bare word (`ff`) or a literal run (`//`, `@a`, `_`).
 * `open: true` allows the trigger outside math; every other snippet only fires
 * when the caret sits inside `$…$`, `$$…$$`, `\(…\)` or `\[…\]`.
 * `auto: true` expands on the keystroke that completes the trigger, with no Tab.
 * `word: true` additionally requires a delimiter after the trigger, so `dm` in
 * `dmx` stays a word.
 */
export const DEFAULT_SNIPPETS = {
  mk: { body: '$$0$', auto: true, open: true, desc: 'inline math' },
  dm: { body: '$$\n$0\n$$', auto: true, open: true, word: true, desc: 'display math' },
  ff: { body: '\\frac{$0}{$1}$2', auto: true, desc: 'fraction' },
  '//': { body: '\\frac{$0}{$1}$2', auto: true, desc: 'fraction' },
  sq: { body: '\\sqrt{ $0 }$1', auto: true, desc: 'square root' },
  int: { body: '\\int_{$0}^{$1} $2 \\, d$3', auto: true, desc: 'definite integral' },
  iint: { body: '\\iint', auto: true, desc: 'double integral' },
  sum: { body: '\\sum_{i=1}^{n} $1', auto: true, desc: 'sum' },
  prod: { body: '\\prod_{i=1}^{n} $1', auto: true, desc: 'product' },
  lim: { body: '\\lim_{ $0 \\to $1 } $2', auto: true, desc: 'limit' },
  par: { body: '\\frac{ \\partial $0 }{ \\partial $1 } $2', desc: 'partial derivative (Tab: LaTeX Suite leaves this one on Tab)' },
  sub: { body: '_{$0}$1', auto: true, desc: 'subscript' },
  sup: { body: '^{$0}$1', auto: true, desc: 'superscript' },
  vec: { body: '\\vec{$0}$1', auto: true, desc: 'vector' },
  bar: { body: '\\bar{$0}$1', auto: true, desc: 'sample mean' },
  hat: { body: '\\hat{$0}$1', auto: true, desc: 'estimator' },
  til: { body: '\\tilde{$0}$1', auto: true, desc: 'tilde' },
  bb: { body: '\\mathbb{$1}', auto: true, desc: 'blackboard bold' },
  cal: { body: '\\mathcal{$1}', auto: true, desc: 'calligraphic' },
  op: { body: '\\operatorname{$1}', auto: true, desc: 'operator name' },
  alp: { body: '\\alpha', auto: true },
  bet: { body: '\\beta', auto: true },
  gam: { body: '\\gamma', auto: true },
  del: { body: '\\delta', auto: true, desc: 'delta (nabl is the gradient)' },
  eps: { body: '\\varepsilon', auto: true },
  the: { body: '\\theta', auto: true },
  lam: { body: '\\lambda', auto: true },
  mu: { body: '\\mu', auto: true },
  sig: { body: '\\sigma', auto: true },
  rho: { body: '\\rho', auto: true },
  phi: { body: '\\varphi', auto: true },
  omg: { body: '\\omega', auto: true },
  Om: { body: '\\Omega', auto: true },
  Sig: { body: '\\Sigma', auto: true },
  to: { body: '\\to', auto: true },
  inf: { body: '\\infty', auto: true },
  cd: { body: '\\cdot', auto: true },
  leq: { body: '\\leq', auto: true },
  geq: { body: '\\geq', auto: true },
  neq: { body: '\\neq', auto: true },
  pm: { body: '\\pm', auto: true },
  tms: { body: '\\times', auto: true },
  inn: { body: '\\in', auto: true },
  RR: { body: '\\mathbb{R}', auto: true },
  EE: { body: '\\mathbb{E}', auto: true },
  VV: { body: '\\operatorname{Var}', auto: true },
  CC: { body: '\\operatorname{Cov}', auto: true },
  NN: { body: '\\mathcal{N}', auto: true },
  '@a': { body: '\\alpha', auto: true },
  '@b': { body: '\\beta', auto: true },
  '@g': { body: '\\gamma', auto: true },
  '@G': { body: '\\Gamma', auto: true },
  '@d': { body: '\\delta', auto: true },
  '@D': { body: '\\Delta', auto: true },
  '@e': { body: '\\epsilon', auto: true },
  ':e': { body: '\\varepsilon', auto: true },
  '@z': { body: '\\zeta', auto: true },
  '@t': { body: '\\theta', auto: true },
  '@T': { body: '\\Theta', auto: true },
  ':t': { body: '\\vartheta', auto: true },
  '@i': { body: '\\iota', auto: true },
  '@k': { body: '\\kappa', auto: true },
  '@l': { body: '\\lambda', auto: true },
  '@L': { body: '\\Lambda', auto: true },
  '@s': { body: '\\sigma', auto: true },
  '@S': { body: '\\Sigma', auto: true },
  '@u': { body: '\\upsilon', auto: true },
  '@U': { body: '\\Upsilon', auto: true },
  '@o': { body: '\\omega', auto: true },
  '@O': { body: '\\Omega', auto: true },
  ome: { body: '\\omega', auto: true },
  Ome: { body: '\\Omega', auto: true },
  text: { body: '\\text{$0}$1', auto: true },
  sr: { body: '^{2}', auto: true },
  cb: { body: '^{3}', auto: true },
  rd: { body: '^{$0}$1', auto: true },
  _: { body: '_{$0}$1', auto: true },
  sts: { body: '_\\text{$0}', auto: true },
  invs: { body: '^{-1}', auto: true },
  conj: { body: '^{*}', auto: true },
  Re: { body: '\\mathrm{Re}', auto: true },
  Im: { body: '\\mathrm{Im}', auto: true },
  bf: { body: '\\mathbf{$0}', auto: true },
  rm: { body: '\\mathrm{$0}$1', auto: true },
  trace: { body: '\\mathrm{Tr}', auto: true },
  dot: { body: '\\dot{$0}$1', auto: true },
  ddot: { body: '\\ddot{$0}$1', auto: true },
  cdot: { body: '\\cdot', auto: true },
  tilde: { body: '\\tilde{$0}$1', auto: true },
  und: { body: '\\underline{$0}$1', auto: true },
  pmod: { body: '\\pmod{$0}$1', auto: true },
  ooo: { body: '\\infty', auto: true },
  '\\sum': { body: '\\sum_{$0=$1}^{$2} $3' },
  '\\prod': { body: '\\prod_{$0=$1}^{$2} $3' },
  '+-': { body: '\\pm', auto: true },
  '-+': { body: '\\mp', auto: true },
  '...': { body: '\\dots', auto: true },
  xx: { body: '\\times', auto: true },
  '**': { body: '\\cdot', auto: true },
  para: { body: '\\parallel', auto: true },
  deg: { body: '\\degree', auto: true },
  '===': { body: '\\equiv', auto: true },
  '!=': { body: '\\neq', auto: true },
  '>=': { body: '\\geq', auto: true },
  '<=': { body: '\\leq', auto: true },
  '>>': { body: '\\gg', auto: true },
  '<<': { body: '\\ll', auto: true },
  simm: { body: '\\sim', auto: true },
  'sim=': { body: '\\simeq', auto: true },
  prop: { body: '\\propto', auto: true },
  '<->': { body: '\\leftrightarrow ', auto: true },
  '->': { body: '\\to', auto: true },
  '!>': { body: '\\mapsto', auto: true },
  '=>': { body: '\\implies', auto: true },
  '=<': { body: '\\impliedby', auto: true },
  and: { body: '\\cap', auto: true, word: true },
  orr: { body: '\\cup', auto: true },
  notin: { body: '\\not\\in', auto: true },
  'sub=': { body: '\\subseteq', auto: true },
  'sup=': { body: '\\supseteq', auto: true },
  eset: { body: '\\emptyset', auto: true },
  set: { body: '\\{ $0 \\}$1', auto: true, word: true },
  LL: { body: '\\mathcal{L}', auto: true },
  HH: { body: '\\mathcal{H}', auto: true },
  ZZ: { body: '\\mathbb{Z}', auto: true },
  QQ: { body: '\\mathbb{Q}', auto: true },
  ddt: { body: '\\frac{d}{dt} ', auto: true },
  '\\int': { body: '\\int $0 \\, d$1 $2' },
  dint: { body: '\\int_{$0}^{$1} $2 \\, d$3 $4', auto: true },
  oint: { body: '\\oint', auto: true },
  iiint: { body: '\\iiint', auto: true },
  oinf: { body: '\\int_{0}^{\\infty} $0 \\, d$1 $2', auto: true },
  infi: { body: '\\int_{-\\infty}^{\\infty} $0 \\, d$1 $2', auto: true },
  'o+': { body: '\\oplus ', auto: true },
  ox: { body: '\\otimes ', auto: true, word: true },
  avg: { body: '\\langle $0 \\rangle $1', auto: true },
  norm: { body: '\\lvert $0 \\rvert $1', auto: true },
  Norm: { body: '\\lVert $0 \\rVert $1', auto: true },
  ceil: { body: '\\lceil $0 \\rceil $1', auto: true },
  floor: { body: '\\lfloor $0 \\rfloor $1', auto: true },
  nabl: { body: '\\nabla', auto: true, desc: 'gradient' },
  inti: { body: '\\int $0 \\, d$1', auto: true, desc: 'indefinite integral' }
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
      ...value !== null && typeof value === 'object' && typeof value.open === 'boolean' ? { open: value.open } : {},
      ...value !== null && typeof value === 'object' && typeof value.auto === 'boolean' ? { auto: value.auto } : {},
      ...value !== null && typeof value === 'object' && typeof value.word === 'boolean' ? { word: value.word } : {},
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
