/**
 * Offline test for dsh-math-snippets' browser half.
 *
 * No harness, no browser, no network. The bundle runs through the real
 * `__ModuleLoader__.load` handshake, and the keystroke path is driven against a
 * fake composer that mirrors the shell's span semantics:
 *
 *   - a span replacement swaps `[start, end)` for the text,
 *   - the caret lands immediately after what was inserted,
 *   - a collapsed span inserts at a point,
 *   - a stale `draftRev` refuses the edit (the shell's optimistic guard).
 *
 * That model is what makes the two-step hole placement assertable at all: the
 * tests check the resulting text *and* where the caret ends up.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

let passed = 0
const failures = []
function test(name, fn) {
  try {
    fn()
    passed += 1
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
  }
}

//#region Load the bundle through the real handshake

const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8')
let registration
/** Capture-phase DOM listeners the seat installs, keyed by event type. */
const domListeners = { keydown: [], keyup: [] }
const sandbox = {
  window: {
    __ModuleLoader__: { load: (value) => { registration = value } },
    setInterval: () => 1,
    clearInterval: () => {}
  },
  document: {
    addEventListener: (type, fn) => { (domListeners[type] ??= []).push(fn) },
    removeEventListener: (type, fn) => {
      domListeners[type] = (domListeners[type] ?? []).filter((entry) => entry !== fn)
    }
  },
  console
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

assert.equal(registration.id, 'dsh-math-snippets', 'bundle registers under the package name the host row id is')

// Only React is reached during registration; the seat-wiring tests at the end
// render the component and run the effects this stub collects.
const effects = []
const React = {
  useEffect: (fn) => { effects.push(fn) },
  useRef: (initial) => ({ current: initial })
}
const mod = registration.factory((spec) => {
  if (spec === 'react') return React
  throw new Error(`unexpected require("${spec}")`)
})

const { parseBody, insideMath, matchTrigger, nextStop, handleKeydown, handleKeyup, DEFAULT_SNIPPETS } = mod.internals

/**
 * A fake composer holding exactly the state the shell publishes to a plugin.
 * @param text - initial projected text.
 * @param caret - initial caret offset in that text.
 * @param rev - initial draft revision.
 */
function makeComposer(text, caret, rev = 1) {
  let value = text
  let position = caret
  let revision = rev
  let chip = false
  let phase = 'plain'
  let session = null
  const calls = []
  return {
    get state() {
      return {
        detectText: value,
        clipboardText: chip ? 'CHIP' + value : value,
        caret: position,
        draftRev: revision,
        phase
      }
    },
    get text() { return value },
    get caret() { return position },
    get calls() { return calls },
    /** The hole-walk register this composer's seat would own. */
    cycle: { get: () => session, set: (next) => { session = next } },
    /** A file chip anywhere in the draft: detect and clipboard text diverge. */
    withChip(on) { chip = on; return this },
    setPhase(next) { phase = next; return this },
    /** Type at the caret, as the editor commits it. */
    type(insert) { return this.dispatch(insert, { start: position, end: position, draftRev: revision }) },
    /** Move the caret without editing anything. */
    moveTo(offset) { position = offset; return this },
    dispatch(insert, span) {
      calls.push({ insert, span })
      if (span.draftRev !== revision) return false
      if (span.start < 0 || span.start > span.end || span.end > value.length) return false
      value = value.slice(0, span.start) + insert + value.slice(span.end)
      position = span.start + insert.length
      revision += 1
      return true
    }
  }
}

/** Drive one Tab through handleKeydown. */
function pressTab(composer, table = DEFAULT_SNIPPETS) {
  let prevented = false
  let stopped = false
  const consumed = handleKeydown(
    {
      key: 'Tab',
      preventDefault: () => { prevented = true },
      stopPropagation: () => { stopped = true }
    },
    {
      getState: () => composer.state,
      dispatch: (text, span) => composer.dispatch(text, span),
      cycle: composer.cycle,
      table
    }
  )
  return { consumed, prevented, stopped }
}

/** Drive one keyup, which is how an `auto` snippet fires with no Tab. */
function pressKey(composer, key, extra = {}, table = DEFAULT_SNIPPETS) {
  return handleKeyup(
    { key, ...extra },
    {
      getState: () => composer.state,
      dispatch: (text, span) => composer.dispatch(text, span),
      cycle: composer.cycle,
      table
    }
  )
}

//#endregion

//#region parseBody

test('a hole is stripped and its offset kept', () => {
  const parsed = parseBody('\\frac{$1}{$2}')
  assert.equal(parsed.text, '\\frac{}{}')
  assert.equal(parsed.hole, 6)
})

test('the lowest-numbered hole wins', () => {
  const parsed = parseBody('$2 + $1')
  assert.equal(parsed.text, ' + ', 'both markers stripped, only the gap between them kept')
  assert.equal(parsed.hole, 3, 'offset of the $1 marker in the stripped text')
})

test('a bare $0 keeps its own position', () => {
  const parsed = parseBody('$$1$')
  assert.equal(parsed.text, '$$')
  assert.equal(parsed.hole, 1)
})

test('braced holes parse too', () => {
  const parsed = parseBody('\\sqrt{${1}}')
  assert.equal(parsed.text, '\\sqrt{}')
  assert.equal(parsed.hole, 6)
})

test('a body with no hole reports none', () => {
  const parsed = parseBody('\\alpha')
  assert.equal(parsed.text, '\\alpha')
  assert.equal(parsed.hole, null)
})

test('every hole is listed in Tab order, with the strips between them', () => {
  const parsed = parseBody('\\frac{$1}{$2}')
  assert.deepEqual(Array.from(parsed.stops), [6, 8])
  assert.deepEqual(Array.from(parsed.separators), ['}{'], 'the literal the walk searches for')
  assert.equal(parsed.hole, 6, 'the walk starts at the first stop')
})

test('a bare $0 is the last stop, LaTeX Suite style', () => {
  const parsed = parseBody('\\left($1\\right)$0')
  assert.deepEqual(Array.from(parsed.stops), [6, 13])
  assert.deepEqual(Array.from(parsed.separators), ['\\right)'])
})

test('a hole-free body has no stops', () => {
  const parsed = parseBody('\\alpha')
  assert.deepEqual(Array.from(parsed.stops), [])
  assert.deepEqual(Array.from(parsed.separators), [])
})

//#endregion

//#region insideMath

test('inline and display math are recognised', () => {
  assert.equal(insideMath('$x', 2), true)
  assert.equal(insideMath('a $$x', 5), true)
  assert.equal(insideMath('\\(x', 3), true)
  assert.equal(insideMath('\\[x', 3), true)
})

test('prose is not math', () => {
  assert.equal(insideMath('hello', 5), false)
  assert.equal(insideMath('costs $5 and $10', 16), false)
})

test('closed math is not inside', () => {
  assert.equal(insideMath('$x$ tail', 8), false)
})

test('code spans and fences are never math', () => {
  assert.equal(insideMath('`$x', 3), false)
  assert.equal(insideMath('```\n$x\n```\n', 8), false)
})

//#endregion

//#region matchTrigger

test('the word before the caret is the trigger', () => {
  const first = matchTrigger('a ff', 4)
  assert.equal(first.token, 'ff')
  assert.equal(first.start, 2)
  const second = matchTrigger('$ff', 3)
  assert.equal(second.token, 'ff')
  assert.equal(second.start, 1)
})

test('the whole word is the trigger, so a suffix never matches', () => {
  // "xff" yields the token "xff", which is simply not a known trigger: a
  // snippet named "ff" can never fire from the middle of a word.
  assert.equal(matchTrigger('xff', 3).token, 'xff')
  assert.equal(DEFAULT_SNIPPETS.xff, undefined)
})

test('a menu prefix suppresses the trigger', () => {
  assert.equal(matchTrigger('/ff', 3), null)
  assert.equal(matchTrigger('@ff', 3), null)
  assert.equal(matchTrigger('#ff', 3), null)
  assert.equal(matchTrigger('\\ff', 3), null)
})

test('an over-long word is not a trigger', () => {
  assert.equal(matchTrigger('abcdefghijklmn', 14), null)
})

test('a literal run before the caret is a trigger too', () => {
  const match = matchTrigger('$//', 3)
  assert.equal(match.token, '//')
  assert.equal(match.start, 1)
})

test('a literal trigger fires after a symbol and after a space', () => {
  assert.equal(matchTrigger('x//', 3).start, 1, 'a LaTeX Suite habit: x// is still a fraction')
  assert.equal(matchTrigger('$a //', 5).start, 3)
})

test('URLs never arm the literal trigger', () => {
  // The same two carve-outs the shell itself uses to keep '/' dead in URLs.
  assert.equal(matchTrigger('https://', 8), null)
  assert.equal(matchTrigger('go https://', 11), null)
})

test('a third slash does not re-arm the pair', () => {
  assert.equal(matchTrigger('///', 3), null)
})

test('the longest literal in the table wins', () => {
  const table = { ...DEFAULT_SNIPPETS, '///': { body: '\\dfrac{$1}{$2}' } }
  assert.equal(matchTrigger('$///', 4, table).token, '///')
  assert.equal(matchTrigger('$//', 3, table).token, '//')
})

//#endregion

//#region handleKeydown: the whole path

test('a fraction lands the caret inside the first brace', () => {
  const composer = makeComposer('$ff', 3)
  const result = pressTab(composer)
  assert.equal(result.consumed, true)
  assert.equal(result.prevented, true, 'Tab is consumed only because it applied')
  assert.equal(composer.text, '$\\frac{}{}')
  assert.equal(composer.caret, 7, 'caret sits right after \\frac{')
  assert.equal(composer.text[composer.caret - 1], '{', 'character before the caret')
  assert.equal(composer.text[composer.caret], '}', 'character after the caret')
})

test('// expands to a fraction with the caret in the numerator', () => {
  const composer = makeComposer('$//', 3)
  const result = pressTab(composer)
  assert.equal(result.consumed, true)
  assert.equal(composer.text, '$\\frac{}{}')
  assert.equal(composer.caret, 7)
  assert.equal(composer.text[composer.caret - 1], '{')
  assert.equal(composer.text[composer.caret], '}')
})

test('// is math-only, so a URL keeps Tab', () => {
  const prose = makeComposer('//', 2)
  assert.equal(pressTab(prose).consumed, false, 'prose stays prose')
  assert.equal(prose.text, '//')
  const url = makeComposer('go https://', 11)
  assert.equal(pressTab(url).consumed, false)
  assert.equal(url.calls.length, 0, 'nothing was dispatched')
})

test('the two steps use the live revision, not the stale one', () => {
  const composer = makeComposer('$ff', 3)
  pressTab(composer)
  assert.equal(composer.calls.length, 2)
  const [tail, head] = composer.calls
  assert.equal(tail.span.start, 1)
  assert.equal(tail.span.end, 3)
  assert.equal(tail.span.draftRev, 1, 'the revision the trigger was read at')
  assert.equal(head.span.start, 1)
  assert.equal(head.span.end, 1, 'collapsed: the head goes in front of the tail')
  assert.equal(head.span.draftRev, 2, 'and the revision the tail left behind')
  assert.equal(tail.insert, '}{}')
  assert.equal(head.insert, '\\frac{')
})

test('a hole-free symbol leaves the caret after the insertion', () => {
  const composer = makeComposer('$alp', 4)
  pressTab(composer)
  assert.equal(composer.text, '$\\alpha')
  assert.equal(composer.caret, 7, 'caret at the end, ready for the next keystroke')
})

test('inline math opens outside math', () => {
  const composer = makeComposer('mk', 2)
  const result = pressTab(composer)
  assert.equal(result.consumed, true)
  assert.equal(composer.text, '$$')
  assert.equal(composer.caret, 1, 'caret between the dollars')
})

test('display math opens on its own line', () => {
  const composer = makeComposer('dm', 2)
  pressTab(composer)
  assert.equal(composer.text, '$$\n\n$$')
  assert.equal(composer.caret, 3, 'caret on the empty line')
})

test('a snippet that needs math never fires in prose', () => {
  const composer = makeComposer('ff', 2)
  const result = pressTab(composer)
  assert.equal(result.consumed, false)
  assert.equal(result.prevented, false, 'Tab keeps its normal meaning')
  assert.equal(composer.calls.length, 0)
  assert.equal(composer.text, 'ff')
})

test('a code span disables expansion', () => {
  const composer = makeComposer('`ff', 3)
  assert.equal(pressTab(composer).consumed, false)
})

test('an unknown trigger is left alone', () => {
  const composer = makeComposer('$zzz', 4)
  assert.equal(pressTab(composer).consumed, false)
  assert.equal(composer.text, '$zzz')
})

test('only a bare Tab is a snippet key', () => {
  for (const extra of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    const composer = makeComposer('$ff', 3)
    let prevented = false
    const consumed = handleKeydown(
      { key: 'Tab', ...extra, preventDefault: () => { prevented = true }, stopPropagation: () => {} },
      { getState: () => composer.state, dispatch: (t, s) => composer.dispatch(t, s), table: DEFAULT_SNIPPETS }
    )
    assert.equal(consumed, false, JSON.stringify(extra))
    assert.equal(prevented, false)
  }
})

test('other keys pass through', () => {
  const composer = makeComposer('$ff', 3)
  const consumed = handleKeydown(
    { key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} },
    { getState: () => composer.state, dispatch: (t, s) => composer.dispatch(t, s), table: DEFAULT_SNIPPETS }
  )
  assert.equal(consumed, false)
})

test('a stale revision refuses the edit and does not eat Tab', () => {
  const composer = makeComposer('$ff', 3)
  let prevented = false
  const consumed = handleKeydown(
    { key: 'Tab', preventDefault: () => { prevented = true }, stopPropagation: () => {} },
    {
      // The composer advanced between reading and dispatching.
      getState: () => ({ detectText: '$ff', caret: 3, draftRev: 99 }),
      dispatch: (text, span) => composer.dispatch(text, span),
      table: DEFAULT_SNIPPETS
    }
  )
  assert.equal(consumed, false)
  assert.equal(prevented, false)
  assert.equal(composer.text, '$ff')
})

test('a missing projection is survivable', () => {
  const consumed = handleKeydown(
    { key: 'Tab', preventDefault: () => {}, stopPropagation: () => {} },
    { getState: () => null, dispatch: () => true, table: DEFAULT_SNIPPETS }
  )
  assert.equal(consumed, false)
})

test('a user table can add and override triggers', () => {
  const table = { ...DEFAULT_SNIPPETS, ff: { body: '\\dfrac{$1}{$2}' }, npv: { body: '\\mathrm{NPV}_{$1}' } }
  const composer = makeComposer('$npv', 4, 1)
  pressTab(composer, table)
  assert.equal(composer.text, '$\\mathrm{NPV}_{}')
  assert.equal(composer.text[composer.caret - 1], '{', 'caret inside the subscript braces')
  assert.equal(composer.text[composer.caret], '}')
})

//#endregion

//#region the Tab hole walk

test('nextStop re-finds the strip and refuses a caret behind the anchor', () => {
  const session = { step: 0, anchor: 7, stops: [6, 8], separators: ['}{'] }
  assert.equal(nextStop('$\\frac{}{}', 7, session), 9)
  assert.equal(nextStop('$\\frac{}{}', 6, session), null, 'the caret moved back before the hole')
  assert.equal(nextStop('$\\frac{}{}', 7, null), null, 'no walk is armed')
  assert.equal(nextStop('$\\frac{}{}', 7, { ...session, step: 1 }), null, 'the walk is exhausted')
})

test('Tab walks from one hole to the next', () => {
  const composer = makeComposer('$ff', 3)
  pressTab(composer)
  assert.equal(composer.caret, 7, 'the first Tab lands in the numerator')
  composer.type('3')
  assert.equal(composer.text, '$\\frac{3}{}')

  const before = composer.calls.length
  const result = pressTab(composer)
  assert.equal(result.consumed, true)
  assert.equal(composer.text, '$\\frac{3}{}', 'the walk writes back exactly what it replaces')
  assert.equal(composer.caret, 10, 'caret now inside the denominator braces')
  assert.equal(composer.text[composer.caret - 1], '{')
  assert.equal(composer.text[composer.caret], '}')
  assert.equal(composer.calls.length, before + 1, 'exactly one span replacement')
  const jump = composer.calls[before]
  assert.equal(jump.insert, '}{')
  assert.equal(jump.span.start, 8)
  assert.equal(jump.span.end, 10)
})

test('the walk survives an edit of any length in the hole', () => {
  const composer = makeComposer('$ff', 3)
  pressTab(composer)
  composer.type('\\alpha')
  pressTab(composer)
  assert.equal(composer.text, '$\\frac{\\alpha}{}')
  assert.equal(composer.caret, 15)
  assert.equal(composer.text[composer.caret - 1], '{')
  assert.equal(composer.text[composer.caret], '}')
})

test('the walk covers every hole and then stops', () => {
  const composer = makeComposer('$int', 4)
  pressTab(composer)
  assert.equal(composer.text, '$\\int_{}^{}')
  assert.equal(composer.caret, 7, 'lower limit')
  composer.type('0')
  pressTab(composer)
  assert.equal(composer.caret, 11, 'upper limit')
  assert.equal(composer.text[composer.caret - 1], '{')
  composer.type('1')
  assert.equal(composer.text, '$\\int_{0}^{1}')
  const result = pressTab(composer)
  assert.equal(result.consumed, false, 'the second hole was the last one')
  assert.equal(result.prevented, false, 'Tab is free again')
  assert.equal(composer.caret, 12)
})

test('a trigger typed inside a hole still expands', () => {
  const composer = makeComposer('$ff', 3)
  pressTab(composer)
  composer.type('ff')
  const result = pressTab(composer)
  assert.equal(result.consumed, true, 'an expansion wins over the walk')
  assert.equal(composer.text, '$\\frac{\\frac{}{}}{}')
  assert.equal(composer.caret, 13, 'caret in the nested numerator')
  assert.equal(composer.text[composer.caret - 1], '{')
  assert.equal(composer.text[composer.caret], '}')
})

test('a caret moved back before the hole disarms the walk', () => {
  const composer = makeComposer('$ff', 3)
  pressTab(composer)
  composer.moveTo(2)
  const result = pressTab(composer)
  assert.equal(result.consumed, false)
  assert.equal(composer.text, '$\\frac{}{}', 'nothing moved')
})

test('a draft carrying a file chip stands the walk down', () => {
  const composer = makeComposer('$ff', 3)
  pressTab(composer)
  composer.type('3')
  composer.withChip(true)
  const result = pressTab(composer)
  assert.equal(result.consumed, false, 'detect and clipboard coordinates diverge')
  assert.equal(composer.text, '$\\frac{3}{}')
})

//#endregion

//#region auto snippets: no Tab at all

test('an auto snippet expands on the keystroke that completes it', () => {
  const composer = makeComposer('$//', 3)
  assert.equal(pressKey(composer, '/'), true)
  assert.equal(composer.text, '$\\frac{}{}')
  assert.equal(composer.caret, 7, 'caret in the numerator')
})

test('one slash is not yet a trigger', () => {
  const composer = makeComposer('$/', 2)
  assert.equal(pressKey(composer, '/'), false)
  assert.equal(composer.text, '$/')
  assert.equal(composer.calls.length, 0)
})

test('auto still needs math, and a URL never arms it', () => {
  const prose = makeComposer('//', 2)
  assert.equal(pressKey(prose, '/'), false, 'prose stays prose')
  assert.equal(prose.text, '//')
  const url = makeComposer('go https://', 11)
  assert.equal(pressKey(url, '/'), false)
  assert.equal(url.calls.length, 0)
})

test('auto only fires for the character that completes the trigger', () => {
  const composer = makeComposer('$//', 3)
  assert.equal(pressKey(composer, 'x'), false)
})

test('auto waits until the composer phase is plain', () => {
  const composer = makeComposer('$//', 3).setPhase('claimed')
  assert.equal(pressKey(composer, '/'), false)
  assert.equal(composer.text, '$//')
})

test('auto is opt-in: a word trigger without the flag waits for Tab', () => {
  const composer = makeComposer('$sum', 4)
  assert.equal(pressKey(composer, 'm'), false)
  assert.equal(composer.text, '$sum')
  assert.equal(pressTab(composer).consumed, true)
  assert.equal(composer.text, '$\\sum_{i=1}^{n} ')
})

test('auto ignores modifiers, composition, and non-character keys', () => {
  assert.equal(pressKey(makeComposer('$//', 3), '/', { metaKey: true }), false)
  assert.equal(pressKey(makeComposer('$//', 3), '/', { isComposing: true }), false)
  assert.equal(pressKey(makeComposer('$//', 3), 'Shift'), false)
})

test('an auto expansion arms the walk too', () => {
  const composer = makeComposer('$//', 3)
  pressKey(composer, '/')
  composer.type('3')
  assert.equal(pressTab(composer).consumed, true, 'the walk works from either entry point')
  assert.equal(composer.text, '$\\frac{3}{}')
  assert.equal(composer.caret, 10)
})

//#endregion

//#region Registration

const injected = []
const registrations = []
mod.apply({
  slots: {
    inject(key, callback) {
      injected.push(key)
      return callback()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    }
  },
  sessions: { scope: () => undefined }
})

test('declares its name and services', () => {
  assert.equal(mod.name, 'math-snippets')
  assert.deepEqual(Array.from(mod.inject), ['slots', 'sessions'])
})

test('claims exactly one invisible composer-dock seat', () => {
  assert.deepEqual(injected, ['conversation.input.dock'])
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.name, 'conversation.input.dock')
  assert.equal(registrations[0].options.id, 'math-snippets')
  assert.equal(typeof registrations[0].component, 'function')
  assert.equal(typeof registrations[0].options.inject, 'function')
})

test('the seat degrades to no props when the session has no scope', () => {
  assert.equal(Object.keys(registrations[0].options.inject('session-x')).length, 0)
})

test('the default table is self-consistent', () => {
  for (const [tag, snippet] of Object.entries(DEFAULT_SNIPPETS)) {
    assert.ok(/^([A-Za-z][A-Za-z0-9]*|[^A-Za-z0-9]+)$/.test(tag), `trigger "${tag}" must be a bare word or a literal run`)
    assert.ok(tag.length <= mod.internals.MAX_TRIGGER, `trigger "${tag}" must fit the cap`)
    assert.equal(typeof snippet.body, 'string')
    if (snippet.auto !== undefined) assert.equal(snippet.auto, true, `snippet "${tag}" auto is a boolean flag`)
    const parsed = parseBody(snippet.body)
    assert.ok(parsed.text.length > 0, `snippet "${tag}" expands to something`)
  }
  assert.equal(parseBody(DEFAULT_SNIPPETS.ff.body).hole, 6)
  assert.equal(parseBody(DEFAULT_SNIPPETS.mk.body).text, '$$')
})

//#endregion

//#region the seat, driven end to end

/** Fire one captured DOM event through every listener the seat installed. */
function fireDom(type, event) {
  for (const listener of [...domListeners[type]]) listener(event)
}

/** A DOM event aimed at the composer, or at something else. */
function domEvent(type, extra, inComposer = true) {
  return {
    type,
    ...extra,
    target: { closest: (selector) => (inComposer && selector === '[data-lexical-editor="true"]' ? {} : null) }
  }
}

test('the rendered seat expands from a keydown and a keyup', () => {
  const composer = makeComposer('$//', 3)
  const seen = []
  const shell = {
    get projection() {
      const state = composer.state
      return {
        detectText: state.detectText,
        clipboardText: state.clipboardText,
        caret: state.caret,
        selection: null
      }
    },
    get snapshot() {
      return { draftRev: composer.state.draftRev, phase: composer.state.phase }
    }
  }
  const actx = {
    bail: (ctx, event, payload) => {
      seen.push(event)
      return composer.dispatch(payload.text, payload.span)
    }
  }

  const seats = []
  mod.apply({
    slots: {
      inject: (key, callback) => callback(),
      register: (options, component) => { seats.push({ options, component }); return () => {} }
    },
    sessions: {
      scope: () => ({
        get: () => ({ input: { shell: () => shell } }),
        bail: actx.bail
      })
    }
  })

  const props = seats[0].options.inject('session-1')
  assert.equal(props.shell, shell, 'the seat resolves the composer shell for the session')
  assert.equal(typeof props.actx, 'object')

  effects.length = 0
  assert.equal(seats[0].component(props), null, 'the seat draws nothing')
  assert.equal(effects.length, 2, 'the table loader and the keystroke listeners')
  const cleanups = effects.map((effect) => effect())
  assert.deepEqual(Object.keys(domListeners).map((type) => domListeners[type].length), [1, 1], 'one listener each')

  // A real keyup completes the trigger: no Tab at all.
  fireDom('keyup', domEvent('keyup', { key: '/', isComposing: false }))
  assert.equal(composer.text, '$\\frac{}{}')
  assert.equal(composer.caret, 7)
  assert.deepEqual(seen, ['slash/input-insert-text', 'slash/input-insert-text'], 'both halves went out scoped')

  // A real keydown then walks to the second hole.
  composer.type('3')
  let prevented = false
  fireDom('keydown', domEvent('keydown', {
    key: 'Tab',
    preventDefault: () => { prevented = true },
    stopPropagation: () => {}
  }))
  assert.equal(composer.text, '$\\frac{3}{}')
  assert.equal(composer.caret, 10)
  assert.equal(prevented, true, 'only a real move eats Tab')

  // Events from anywhere else on the page are ignored.
  fireDom('keyup', domEvent('keyup', { key: '/', isComposing: false }, false))
  assert.equal(composer.caret, 10)

  for (const cleanup of cleanups) cleanup()
  assert.deepEqual(Object.keys(domListeners).map((type) => domListeners[type].length), [0, 0], 'the seat unlistens')
})

//#endregion

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}`)
  for (const failure of failures) console.error('  - ' + failure)
  process.exit(1)
}
console.log(`ok — ${passed} assertions passed`)
