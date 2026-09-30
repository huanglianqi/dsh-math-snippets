/**
 * dsh-math-snippets — browser half.
 *
 * LaTeX-Suite-style snippet expansion for the DSH composer: type a short
 * trigger, press Tab, and it becomes a formula template with the caret already
 * inside the first hole.
 *
 * A trigger is either a bare word (`ff`, `sum`, `alp`) or a literal symbol run
 * (`//`), so the LaTeX Suite habit of `//` for a fraction carries over.
 *
 * Everything here rides seams the shell already publishes:
 *
 * - The caret comes from `shell.projection`, the composer's own projection
 *   product (`{ detectText, clipboardText, selection, caret }`). `caret` is an
 *   offset into `detectText`, which is exactly the coordinate space the input
 *   span uses — so no DOM measurement is involved.
 * - The replacement is dispatched as the scoped input event the shell installs
 *   for its own input-trigger sources:
 *       actx.bail(actx, "slash/input-insert-text", { text, span })
 *     where `actx` is `sessions.scope(sessionId)` and `span` is
 *     `{ start, end, draftRev }`.
 * - Caret placement inside a hole needs no DOM trick either: the shell's insert
 *   always leaves the caret *after* what it inserted, so the expansion is
 *   inserted in two steps — tail first, then head. The caret ends up between
 *   them, which is the hole.
 *
 * Tab is only consumed when a replacement actually applied; every other
 * keystroke, and every trigger that does not match, passes straight through.
 */
window.__ModuleLoader__.load({ id: "dsh-math-snippets", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

var React = require("react")
var useEffect = React.useEffect
var useRef = React.useRef

/** Package name, which the host graph row id is. */
var PLUGIN_ID = "dsh-math-snippets"
/** Where the host half serves the effective snippet table. */
var TABLE_ROUTE = "/plugin/math-snippets/table"
/** How often the table is re-read, so editing the JSON file needs no restart. */
var TABLE_REFRESH_MS = 60000
/** Longest trigger accepted, so a pasted word never expands. */
var MAX_TRIGGER = 12

/**
 * Fallback table, used until the host route answers (and if it never does).
 * Kept in step with the host half's copy, which is what gets written out as the
 * editable `~/.dsh/math-snippets.json`.
 */
var DEFAULT_SNIPPETS = {
  mk: { body: "$$0$", auto: true, open: true, desc: "inline math" },
  dm: { body: "$$\n$0\n$$", auto: true, open: true, word: true, desc: "display math" },
  ff: { body: "\\frac{$0}{$1}$2", auto: true, desc: "fraction" },
  "//": { body: "\\frac{$0}{$1}$2", auto: true, desc: "fraction" },
  sq: { body: "\\sqrt{ $0 }$1", auto: true, desc: "square root" },
  int: { body: "\\int_{$0}^{$1} $2 \\, d$3", auto: true, desc: "definite integral" },
  iint: { body: "\\iint", auto: true, desc: "double integral" },
  sum: { body: "\\sum_{i=1}^{n} $1", auto: true, desc: "sum" },
  prod: { body: "\\prod_{i=1}^{n} $1", auto: true, desc: "product" },
  lim: { body: "\\lim_{ $0 \\to $1 } $2", auto: true, desc: "limit" },
  par: { body: "\\frac{ \\partial $0 }{ \\partial $1 } $2", desc: "partial derivative (Tab: LaTeX Suite leaves this one on Tab)" },
  sub: { body: "_{$0}$1", auto: true, desc: "subscript" },
  sup: { body: "^{$0}$1", auto: true, desc: "superscript" },
  vec: { body: "\\vec{$0}$1", auto: true, desc: "vector" },
  bar: { body: "\\bar{$0}$1", auto: true, desc: "sample mean" },
  hat: { body: "\\hat{$0}$1", auto: true, desc: "estimator" },
  til: { body: "\\tilde{$0}$1", auto: true, desc: "tilde" },
  bb: { body: "\\mathbb{$1}", auto: true, desc: "blackboard bold" },
  cal: { body: "\\mathcal{$1}", auto: true, desc: "calligraphic" },
  op: { body: "\\operatorname{$1}", auto: true, desc: "operator name" },
  alp: { body: "\\alpha", auto: true },
  bet: { body: "\\beta", auto: true },
  gam: { body: "\\gamma", auto: true },
  del: { body: "\\delta", auto: true, desc: "delta (nabl is the gradient)" },
  eps: { body: "\\varepsilon", auto: true },
  the: { body: "\\theta", auto: true },
  lam: { body: "\\lambda", auto: true },
  mu: { body: "\\mu", auto: true },
  sig: { body: "\\sigma", auto: true },
  rho: { body: "\\rho", auto: true },
  phi: { body: "\\varphi", auto: true },
  omg: { body: "\\omega", auto: true },
  Om: { body: "\\Omega", auto: true },
  Sig: { body: "\\Sigma", auto: true },
  to: { body: "\\to", auto: true },
  inf: { body: "\\infty", auto: true },
  cd: { body: "\\cdot", auto: true },
  leq: { body: "\\leq", auto: true },
  geq: { body: "\\geq", auto: true },
  neq: { body: "\\neq", auto: true },
  pm: { body: "\\pm", auto: true },
  tms: { body: "\\times", auto: true },
  inn: { body: "\\in", auto: true },
  RR: { body: "\\mathbb{R}", auto: true },
  EE: { body: "\\mathbb{E}", auto: true },
  VV: { body: "\\operatorname{Var}", auto: true },
  CC: { body: "\\operatorname{Cov}", auto: true },
  NN: { body: "\\mathcal{N}", auto: true },
  "@a": { body: "\\alpha", auto: true },
  "@b": { body: "\\beta", auto: true },
  "@g": { body: "\\gamma", auto: true },
  "@G": { body: "\\Gamma", auto: true },
  "@d": { body: "\\delta", auto: true },
  "@D": { body: "\\Delta", auto: true },
  "@e": { body: "\\epsilon", auto: true },
  ":e": { body: "\\varepsilon", auto: true },
  "@z": { body: "\\zeta", auto: true },
  "@t": { body: "\\theta", auto: true },
  "@T": { body: "\\Theta", auto: true },
  ":t": { body: "\\vartheta", auto: true },
  "@i": { body: "\\iota", auto: true },
  "@k": { body: "\\kappa", auto: true },
  "@l": { body: "\\lambda", auto: true },
  "@L": { body: "\\Lambda", auto: true },
  "@s": { body: "\\sigma", auto: true },
  "@S": { body: "\\Sigma", auto: true },
  "@u": { body: "\\upsilon", auto: true },
  "@U": { body: "\\Upsilon", auto: true },
  "@o": { body: "\\omega", auto: true },
  "@O": { body: "\\Omega", auto: true },
  ome: { body: "\\omega", auto: true },
  Ome: { body: "\\Omega", auto: true },
  text: { body: "\\text{$0}$1", auto: true },
  sr: { body: "^{2}", auto: true },
  cb: { body: "^{3}", auto: true },
  rd: { body: "^{$0}$1", auto: true },
  _: { body: "_{$0}$1", auto: true },
  sts: { body: "_\\text{$0}", auto: true },
  invs: { body: "^{-1}", auto: true },
  conj: { body: "^{*}", auto: true },
  Re: { body: "\\mathrm{Re}", auto: true },
  Im: { body: "\\mathrm{Im}", auto: true },
  bf: { body: "\\mathbf{$0}", auto: true },
  rm: { body: "\\mathrm{$0}$1", auto: true },
  trace: { body: "\\mathrm{Tr}", auto: true },
  dot: { body: "\\dot{$0}$1", auto: true },
  ddot: { body: "\\ddot{$0}$1", auto: true },
  cdot: { body: "\\cdot", auto: true },
  tilde: { body: "\\tilde{$0}$1", auto: true },
  und: { body: "\\underline{$0}$1", auto: true },
  pmod: { body: "\\pmod{$0}$1", auto: true },
  ooo: { body: "\\infty", auto: true },
  "\\sum": { body: "\\sum_{$0=$1}^{$2} $3" },
  "\\prod": { body: "\\prod_{$0=$1}^{$2} $3" },
  "+-": { body: "\\pm", auto: true },
  "-+": { body: "\\mp", auto: true },
  "...": { body: "\\dots", auto: true },
  xx: { body: "\\times", auto: true },
  "**": { body: "\\cdot", auto: true },
  para: { body: "\\parallel", auto: true },
  deg: { body: "\\degree", auto: true },
  "===": { body: "\\equiv", auto: true },
  "!=": { body: "\\neq", auto: true },
  ">=": { body: "\\geq", auto: true },
  "<=": { body: "\\leq", auto: true },
  ">>": { body: "\\gg", auto: true },
  "<<": { body: "\\ll", auto: true },
  simm: { body: "\\sim", auto: true },
  "sim=": { body: "\\simeq", auto: true },
  prop: { body: "\\propto", auto: true },
  "<->": { body: "\\leftrightarrow ", auto: true },
  "->": { body: "\\to", auto: true },
  "!>": { body: "\\mapsto", auto: true },
  "=>": { body: "\\implies", auto: true },
  "=<": { body: "\\impliedby", auto: true },
  and: { body: "\\cap", auto: true, word: true },
  orr: { body: "\\cup", auto: true },
  notin: { body: "\\not\\in", auto: true },
  "sub=": { body: "\\subseteq", auto: true },
  "sup=": { body: "\\supseteq", auto: true },
  eset: { body: "\\emptyset", auto: true },
  set: { body: "\\{ $0 \\}$1", auto: true, word: true },
  LL: { body: "\\mathcal{L}", auto: true },
  HH: { body: "\\mathcal{H}", auto: true },
  ZZ: { body: "\\mathbb{Z}", auto: true },
  QQ: { body: "\\mathbb{Q}", auto: true },
  ddt: { body: "\\frac{d}{dt} ", auto: true },
  "\\int": { body: "\\int $0 \\, d$1 $2" },
  dint: { body: "\\int_{$0}^{$1} $2 \\, d$3 $4", auto: true },
  oint: { body: "\\oint", auto: true },
  iiint: { body: "\\iiint", auto: true },
  oinf: { body: "\\int_{0}^{\\infty} $0 \\, d$1 $2", auto: true },
  infi: { body: "\\int_{-\\infty}^{\\infty} $0 \\, d$1 $2", auto: true },
  "o+": { body: "\\oplus ", auto: true },
  ox: { body: "\\otimes ", auto: true, word: true },
  avg: { body: "\\langle $0 \\rangle $1", auto: true },
  norm: { body: "\\lvert $0 \\rvert $1", auto: true },
  Norm: { body: "\\lVert $0 \\rVert $1", auto: true },
  ceil: { body: "\\lceil $0 \\rceil $1", auto: true },
  floor: { body: "\\lfloor $0 \\rfloor $1", auto: true },
  nabl: { body: "\\nabla", auto: true, desc: "gradient" },
  inti: { body: "\\int $0 \\, d$1", auto: true, desc: "indefinite integral" }
}

//#region Pure helpers

/** Count a run of one repeated character starting at an index. */
function countRun(text, start, ch) {
  var i = start
  while (i < text.length && text.charAt(i) === ch) i += 1
  return i - start
}

/** Index just past the line that closes a fence opened at `start`. */
function findFenceEnd(text, start, ch, len) {
  var cursor = text.indexOf("\n", start)
  while (cursor !== -1) {
    var lineStart = cursor + 1
    var atLineStart = lineStart === 0 || text.charAt(lineStart - 1) === "\n"
    if (atLineStart && text.charAt(lineStart) === ch && countRun(text, lineStart, ch) >= len) {
      var after = lineStart + countRun(text, lineStart, ch)
      var next = text.indexOf("\n", after)
      return next === -1 ? text.length : next + 1
    }
    cursor = text.indexOf("\n", cursor + 1)
  }
  return text.length
}

/**
 * Whether the caret at `index` sits inside an open TeX span.
 *
 * A single `$` glued to a digit is treated as a literal dollar, so prose such
 * as "costs $5 and $10" never counts as math. Code fences and code spans are
 * skipped whole.
 *
 * @param text - the projected composer text.
 * @param index - caret offset.
 * @returns true when the caret is inside `$…$`, `$$…$$`, `\(…\)` or `\[…\]`.
 */
function insideMath(text, index) {
  var display = false
  var inline = false
  var i = 0
  while (i < index) {
    var ch = text.charAt(i)
    if ((ch === "`" || ch === "~") && (i === 0 || text.charAt(i - 1) === "\n") && countRun(text, i, ch) >= 3) {
      var fenceLen = countRun(text, i, ch)
      var fenceEnd = findFenceEnd(text, i, ch, fenceLen)
      if (fenceEnd > index) return false
      i = fenceEnd
      continue
    }
    if (ch === "`") {
      var ticks = countRun(text, i, "`")
      var close = text.indexOf("`".repeat(ticks), i + ticks)
      var stop = close === -1 ? text.length : close + ticks
      if (stop > index) return false
      i = stop
      continue
    }
    if (ch === "\\" && i + 1 < text.length) {
      var next = text.charAt(i + 1)
      if (next === "(" || next === ")") inline = !inline
      else if (next === "[" || next === "]") display = !display
      i += 2
      continue
    }
    if (ch === "$") {
      var run = countRun(text, i, "$")
      if (run >= 2) {
        display = !display
        i += run
        continue
      }
      var follower = text.charAt(i + 1)
      if (follower >= "0" && follower <= "9") {
        i += 1
        continue
      }
      inline = !inline
      i += 1
      continue
    }
    i += 1
  }
  return display || inline
}

/**
 * A bare-word trigger: the whole word before the caret is the token.
 *
 * Anything else in the table is a literal trigger, matched as the exact run of
 * characters before the caret (`//`).
 */
var WORD_TRIGGER = /^[A-Za-z][A-Za-z0-9]*$/

/**
 * Whether a literal trigger may fire where it sits.
 *
 * Mirrors the two carve-outs the shell itself applies to keep `/` dead inside
 * URLs: a slash directly after another slash (the second half of `//` is never
 * a menu trigger), and a slash pair after a `scheme:` colon. Without the second
 * one, typing `https://` would arm the fraction trigger.
 *
 * @param text - the text before the caret.
 * @param start - index the trigger begins at.
 * @param token - the trigger itself.
 * @returns true when the trigger is live here.
 */
function literalBoundaryOk(text, start, token) {
  if (start === 0) return true
  var prev = text.charAt(start - 1)
  if (token.charAt(0) === "/") {
    if (prev === "/") return false
    if (prev === ":" && start >= 2 && !/\s/.test(text.charAt(start - 2))) return false
  }
  return true
}

/** Same word-character test the shell uses for its own trigger boundaries. */
var WORD_CHAR = /\p{L}|\p{N}|_/u

/**
 * LaTeX Suite's `w` option: the trigger has to sit between word delimiters.
 *
 * Only the far side needs checking — a bare-word trigger's near side is already
 * whole-word matched — so this is what keeps `dm` from firing inside `dmx`. The
 * end of the draft counts as a delimiter, which is the common case while typing:
 * `dm` at the end of a line is display math, `dms` is a word.
 *
 * @param text - the projected composer text.
 * @param caret - caret offset, i.e. the offset just past the trigger.
 * @returns whether the trigger is followed by a delimiter.
 */
function wordBoundaryOk(text, caret) {
  if (caret >= text.length) return true
  return !WORD_CHAR.test(text.charAt(caret))
}

/**
 * The literal trigger ending at the caret, if the table has one.
 *
 * Longest match wins, so a table holding both `//` and `///` always resolves to
 * the latter. Word triggers are skipped: they take the other path.
 *
 * @param before - the text before the caret.
 * @param table - the snippet table.
 * @returns `{ token, start }`, or null.
 */
function matchLiteralTrigger(before, table) {
  var found = null
  for (var tag in table) {
    if (!Object.prototype.hasOwnProperty.call(table, tag)) continue
    if (tag === "" || tag.length > MAX_TRIGGER) continue
    if (WORD_TRIGGER.test(tag)) continue
    if (before.slice(before.length - tag.length) !== tag) continue
    var start = before.length - tag.length
    if (!literalBoundaryOk(before, start, tag)) continue
    if (found === null || tag.length > found.token.length) found = { token: tag, start: start }
  }
  return found
}

/**
 * The trigger immediately before the caret.
 *
 * A literal run (`//`) is tried first, then the bare word. The word path
 * requires a boundary before it, and refuses to fire behind `\ / @ #` so it can
 * never shadow the slash-command, reference or tag menus.
 *
 * @param text - the projected composer text.
 * @param caret - caret offset.
 * @param table - the snippet table whose keys may be literal triggers; defaults
 *   to the built-in one, which is what the offline tests exercise.
 * @returns `{ token, start }`, or null.
 */
function matchTrigger(text, caret, table) {
  var before = text.slice(0, caret)
  var snippets = table !== null && typeof table === "object" ? table : DEFAULT_SNIPPETS

  var literal = matchLiteralTrigger(before, snippets)
  if (literal !== null) return literal

  var match = /(^|[^A-Za-z0-9\\/@#])([A-Za-z][A-Za-z0-9]*)$/.exec(before)
  if (match === null) return null
  var token = match[2]
  if (token.length > MAX_TRIGGER) return null
  return { token: token, start: caret - token.length }
}

/**
 * Split one snippet body into its text, its holes, and what sits between them.
 *
 * `$0`, `$1`, `$2` … mark holes and Tab visits them in numeric order, exactly as
 * LaTeX Suite numbers its tabstops — `\frac{$0}{$1}$2` lands in the numerator,
 * then the denominator, then after the fraction. LaTeX Suite's placeholder form
 * `${0:\infty}` parses too, with the default text dropped: honouring it would
 * need a selection to type over, and the shell publishes no selection seam.
 *
 * The strip between two consecutive holes is what the Tab walk searches for to
 * find the next hole after the user has typed in the current one, which is why
 * it is returned alongside the offsets.
 *
 * @param body - snippet body.
 * @returns `{ text, hole, stops, separators }`; `hole` is the first stop (an
 *   offset into `text`) or null, `stops` every hole offset in Tab order, and
 *   `separators[i]` the literal text between `stops[i]` and `stops[i + 1]`.
 */
function parseBody(body) {
  var source = typeof body === "string" ? body : ""
  var marker = /\$(\d+)|\$\{(\d+)(?::[^}]*)?\}/g
  var text = ""
  var holes = []
  var last = 0
  var match
  while ((match = marker.exec(source)) !== null) {
    text += source.slice(last, match.index)
    holes.push({
      number: Number(match[1] !== undefined ? match[1] : match[2]),
      offset: text.length
    })
    last = match.index + match[0].length
  }
  text += source.slice(last)
  if (holes.length === 0) return { text: text, hole: null, stops: [], separators: [] }

  var ordered = holes.slice().sort(function (left, right) { return left.number - right.number })
  var stops = ordered.map(function (entry) { return entry.offset })

  // The walk searches forward for each separator, so it only means anything when
  // the tabstop order runs left to right. A body that numbers its holes out of
  // order gets no walk rather than a wrong one.
  var separators = []
  for (var i = 0; i + 1 < stops.length; i += 1) {
    if (stops[i] >= stops[i + 1]) {
      separators = []
      break
    }
    separators.push(text.slice(stops[i], stops[i + 1]))
  }
  return { text: text, hole: stops[0], stops: stops, separators: separators }
}

//#endregion

//#region Keystroke handling

/** Read the composer state a keystroke needs, or null when it is unusable. */
function readState(deps) {
  var state
  try {
    state = deps.getState()
  } catch (error) {
    return null
  }
  if (state === null || state === undefined || typeof state.detectText !== "string") return null
  if (typeof state.caret !== "number" || typeof state.draftRev !== "number") return null
  if (state.caret < 0 || state.caret > state.detectText.length) return null
  return state
}

/** Mark one handled keystroke, so the shell's own Tab binding never sees it. */
function consume(event) {
  if (typeof event.preventDefault === "function") event.preventDefault()
  if (typeof event.stopPropagation === "function") event.stopPropagation()
}

/**
 * Apply one expansion and arm the Tab walk over its remaining holes.
 *
 * The shell always leaves the caret *after* what it inserted, so the insert that
 * must end at the hole has to be the last one. Tail first, at the trigger span;
 * then the head at the collapsed point where the tail starts, which pushes the
 * tail right and parks the caret exactly in the hole. (A hole at offset 0 gives
 * an empty head: that second call is what moves the caret back to the start.)
 *
 * @param state - the state the trigger was read at.
 * @param match - `{ token, start }` from `matchTrigger`.
 * @param snippet - the table entry to expand.
 * @param deps - the keystroke dependencies, including the optional cycle.
 * @returns whether the edit applied.
 */
function expand(state, match, snippet, deps) {
  var expansion = parseBody(snippet.body)
  if (expansion.text === "") return false

  var hole = expansion.hole === null ? expansion.text.length : expansion.hole
  var tail = expansion.text.slice(hole)
  var head = expansion.text.slice(0, hole)

  var appliedTail = deps.dispatch(tail, { start: match.start, end: state.caret, draftRev: state.draftRev }) === true
  if (!appliedTail) return false

  var after
  try {
    after = deps.getState()
  } catch (error) {
    after = null
  }
  if (after !== null && after !== undefined && typeof after.draftRev === "number") {
    deps.dispatch(head, { start: match.start, end: match.start, draftRev: after.draftRev })
  }

  if (deps.cycle !== null && deps.cycle !== undefined) {
    deps.cycle.set(expansion.stops.length > 1
      ? {
          step: 0,
          anchor: match.start + hole,
          stops: expansion.stops,
          separators: expansion.separators
        }
      : null)
  }
  return true
}

/**
 * Where the next hole of an armed walk sits in the current text, or null.
 *
 * Re-found rather than tracked: the walk starts at the caret and looks for the
 * literal that sat between the hole the caret is in and the next one. Typing in
 * a hole therefore shifts everything to its right for free, and a caret that has
 * moved back before the hole we placed it in simply disarms the walk.
 *
 * @param text - the projected composer text.
 * @param caret - caret offset.
 * @param session - `{ step, anchor, stops, separators }`, or null.
 * @returns the offset to move the caret to, or null.
 */
function nextStop(text, caret, session) {
  if (session === null || session === undefined) return null
  var step = session.step
  if (typeof step !== "number" || step + 1 >= session.stops.length) return null
  if (caret < session.anchor) return null
  var separator = session.separators[step]
  if (typeof separator !== "string" || separator === "") return null
  var found = text.indexOf(separator, caret)
  if (found === -1) return null
  return found + separator.length
}

/**
 * Walk the caret to the next hole of the last expansion, if one is armed.
 *
 * The move is an edit that writes back the text it replaces, because the shell's
 * insert is the only caret-moving primitive it publishes — and it refuses an
 * empty replacement on a non-collapsed span (that would delete). A draft
 * carrying a file chip is skipped: detect coordinates and clipboard coordinates
 * diverge there, so the slice could not be written back verbatim.
 *
 * @param state - the current composer state.
 * @param deps - the keystroke dependencies.
 * @returns whether the caret moved.
 */
function advanceCycle(state, deps) {
  if (deps.cycle === null || deps.cycle === undefined) return false
  if (typeof state.clipboardText !== "string" || state.clipboardText !== state.detectText) return false
  var session = deps.cycle.get()
  var target = nextStop(state.detectText, state.caret, session)
  if (target === null || target <= state.caret) {
    if (session !== null && session !== undefined) deps.cycle.set(null)
    return false
  }
  var between = state.detectText.slice(state.caret, target)
  if (between === "") return false
  var applied = deps.dispatch(between, { start: state.caret, end: target, draftRev: state.draftRev }) === true
  if (!applied) return false
  deps.cycle.set({
    step: session.step + 1,
    anchor: target,
    stops: session.stops,
    separators: session.separators
  })
  return true
}

/**
 * Handle one keydown. Split out from the component so the whole decision path
 * can be exercised without a browser.
 *
 * An expansion wins over a pending hole walk, so typing `ff` inside the
 * numerator of an earlier `ff` still expands. Tab is consumed only when one of
 * the two actually applied.
 *
 * @param event - the keydown event.
 * @param deps - `{ getState, dispatch, table, cycle? }`, where `getState()`
 *   returns `{ detectText, clipboardText, caret, draftRev, phase }`,
 *   `dispatch(text, span)` performs one span replacement and answers whether it
 *   applied, `table` is the snippet map, and `cycle` is the optional
 *   `{ get, set }` hole-walk register.
 * @returns whether the keystroke was consumed.
 */
function handleKeydown(event, deps) {
  if (event === null || event === undefined) return false
  if (event.key !== "Tab") return false
  if (event.shiftKey === true || event.ctrlKey === true || event.metaKey === true || event.altKey === true) return false

  var state = readState(deps)
  if (state === null) return false

  var match = matchTrigger(state.detectText, state.caret, deps.table)
  var snippet = match === null ? undefined : deps.table[match.token]
  if (snippet !== null && snippet !== undefined && typeof snippet.body === "string") {
    if (snippet.word === true && !wordBoundaryOk(state.detectText, state.caret)) snippet = undefined
  }
  if (snippet !== null && snippet !== undefined && typeof snippet.body === "string") {
    if (snippet.open === true || insideMath(state.detectText, match.start)) {
      if (!expand(state, match, snippet, deps)) return false
      consume(event)
      return true
    }
  }

  if (!advanceCycle(state, deps)) return false
  consume(event)
  return true
}

/**
 * Handle one keyup, which is how an `auto` snippet expands with no Tab.
 *
 * Keyup rather than a draft subscription: by the time it fires the shell has
 * committed the character and re-projected, and this is an ordinary event
 * instead of a notification raised from inside the editor's own update — so the
 * scoped insert runs down the same path a keydown would have taken. The shell's
 * own gate is mirrored too: a trigger is only live while the composer phase is
 * `plain`.
 *
 * @param event - the keyup event.
 * @param deps - the same dependencies `handleKeydown` takes.
 * @returns whether an expansion applied.
 */
function handleKeyup(event, deps) {
  if (event === null || event === undefined) return false
  if (event.isComposing === true) return false
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return false
  var key = event.key
  if (typeof key !== "string" || key.length !== 1) return false

  var state = readState(deps)
  if (state === null || state.phase !== "plain") return false

  var match = matchTrigger(state.detectText, state.caret, deps.table)
  if (match === null) return false
  if (match.token.charAt(match.token.length - 1) !== key) return false
  var snippet = deps.table[match.token]
  if (snippet === null || snippet === undefined || typeof snippet.body !== "string") return false
  if (snippet.auto !== true) return false
  if (snippet.word === true && !wordBoundaryOk(state.detectText, state.caret)) return false
  if (snippet.open !== true && !insideMath(state.detectText, match.start)) return false
  return expand(state, match, snippet, deps)
}

//#endregion

//#region Component

/**
 * Fold a served table over the bundle's own copy, entry by entry.
 *
 * A served entry replaces the built-in of the same tag *field by field* rather
 * than wholesale. That matters because the common edit is to restate only a
 * body: a wholesale replace would silently drop the built-in's `open` or `auto`
 * switch, so a body-only override of `mk` would quietly stop working outside
 * math.
 *
 * @param base - the bundle's own table.
 * @param served - the table from the host route.
 * @returns a fresh table.
 */
function mergeTable(base, served) {
  var out = {}
  var tag
  for (tag in base) {
    if (Object.prototype.hasOwnProperty.call(base, tag)) out[tag] = base[tag]
  }
  for (tag in served) {
    if (!Object.prototype.hasOwnProperty.call(served, tag)) continue
    var entry = served[tag]
    if (entry === null || entry === undefined || typeof entry.body !== "string") continue
    var merged = {}
    var inherited = out[tag]
    var field
    if (inherited !== undefined) {
      for (field in inherited) {
        if (Object.prototype.hasOwnProperty.call(inherited, field)) merged[field] = inherited[field]
      }
    }
    for (field in entry) {
      if (Object.prototype.hasOwnProperty.call(entry, field)) merged[field] = entry[field]
    }
    out[tag] = merged
  }
  return out
}

/** Fetch the effective table, falling back to the bundle's copy. */
function loadTable(onTable) {
  try {
    fetch(TABLE_ROUTE, { headers: { accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null })
      .then(function (payload) {
        var snippets = payload !== null && payload !== undefined ? payload.snippets : undefined
        if (snippets !== null && typeof snippets === "object") onTable(mergeTable(DEFAULT_SNIPPETS, snippets))
      })
      .catch(function () {})
  } catch (error) {
    // No fetch (an unusual host): the bundle's copy already applies.
  }
}

/**
 * Invisible seat that turns Tab into snippet expansion while it is mounted.
 *
 * @param props - `{ shell, actx }` from the seat's inject.
 * @returns null: this seat draws nothing.
 */
function MathSnippets(props) {
  var shell = props.shell
  var actx = props.actx
  var tableRef = useRef(DEFAULT_SNIPPETS)
  var depsRef = useRef(null)
  var cycleRef = useRef(null)

  if (depsRef.current === null && shell !== undefined && shell !== null && actx !== undefined && actx !== null) {
    depsRef.current = {
      /** The composer's own projection: detect-space text, caret and revision. */
      getState: function () {
        try {
          var projection = shell.projection
          var snapshot = shell.snapshot
          if (projection === null || projection === undefined) return null
          return {
            detectText: typeof projection.detectText === "string" ? projection.detectText : "",
            clipboardText: typeof projection.clipboardText === "string" ? projection.clipboardText : "",
            caret: typeof projection.caret === "number" ? projection.caret : null,
            draftRev: snapshot !== null && snapshot !== undefined ? snapshot.draftRev : undefined,
            phase: snapshot !== null && snapshot !== undefined ? snapshot.phase : undefined
          }
        } catch (error) {
          return null
        }
      },
      dispatch: function (text, span) {
        try {
          return actx.bail(actx, "slash/input-insert-text", { text: text, span: span }) === true
        } catch (error) {
          return false
        }
      },
      /** The armed Tab walk, owned by this seat for as long as it lives. */
      cycle: {
        get: function () { return cycleRef.current },
        set: function (next) { cycleRef.current = next }
      },
      /** The live snippet table, so a re-read swaps in without re-binding. */
      get table() { return tableRef.current }
    }
  }

  useEffect(function () {
    loadTable(function (snippets) { tableRef.current = snippets })
    var timer = window.setInterval(function () {
      loadTable(function (snippets) { tableRef.current = snippets })
    }, TABLE_REFRESH_MS)
    return function () { window.clearInterval(timer) }
  }, [])

  useEffect(function () {
    /** Whether the event came from the composer rather than another editor. */
    function inComposer(event) {
      var target = event.target
      if (target === null || target === undefined || typeof target.closest !== "function") return false
      return target.closest("[data-lexical-editor=\"true\"]") !== null
    }
    function onKeyDown(event) {
      var deps = depsRef.current
      if (deps === null || !inComposer(event)) return
      handleKeydown(event, deps)
    }
    function onKeyUp(event) {
      var deps = depsRef.current
      if (deps === null || !inComposer(event)) return
      handleKeyup(event, deps)
    }
    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("keyup", onKeyUp, true)
    return function () {
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("keyup", onKeyUp, true)
    }
  }, [])

  return null
}

//#endregion

//#region Plugin

/** Cordis plugin name. */
exports.name = "math-snippets"

/** Required services: the slot registry and the session scope lookup. */
exports.inject = ["slots", "sessions"]

/**
 * Occupy the composer dock with an invisible seat.
 *
 * @param ctx - the client plugin context.
 */
exports.apply = function apply(ctx) {
  ctx.slots.inject("conversation.input.dock", function () {
    return ctx.slots.register({
      name: "conversation.input.dock",
      id: "math-snippets",
      // Ordering only: this seat draws nothing, so it never competes visually.
      order: 4,
      inject: function (sessionId) {
        try {
          if (typeof sessionId !== "string" || sessionId === "") return {}
          var actx = ctx.sessions.scope(sessionId)
          if (actx === undefined || actx === null) return {}
          var conversation = actx.get("conversation")
          if (conversation === undefined || conversation === null) return {}
          var input = conversation.input
          if (input === undefined || typeof input.shell !== "function") return {}
          return { shell: input.shell(sessionId), actx: actx }
        } catch (error) {
          return {}
        }
      }
    }, MathSnippets)
  })
}

/** Exposed for the offline test harness only. */
exports.internals = {
  DEFAULT_SNIPPETS: DEFAULT_SNIPPETS,
  insideMath: insideMath,
  matchTrigger: matchTrigger,
  parseBody: parseBody,
  mergeTable: mergeTable,
  nextStop: nextStop,
  handleKeydown: handleKeydown,
  handleKeyup: handleKeyup,
  MAX_TRIGGER: MAX_TRIGGER,
  TABLE_ROUTE: TABLE_ROUTE
}

return module.exports; } });
