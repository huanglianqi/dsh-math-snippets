# dsh-math-snippets

LaTeX-Suite-style **snippet expansion in the DSH web composer**. The trigger table is built
from [Obsidian LaTeX Suite](https://github.com/artisticat1/obsidian-latex-suite)'s own
defaults — the same triggers, the same auto/Tab split, the same tabstop numbering — so the
muscle memory carries over.

```
$//        →  $\frac{}{}$          no Tab: an auto snippet expands as it is typed
$sum       →  $\sum_{i=1}^{n} $
$ff<Tab>   →  $\frac{}{}$          this plugin's short pair, on Tab or on its own
mk         →  $$                   outside math, caret between the dollars
dm         →  $$⏎⏎$$               display math, caret on the empty line
$@a        →  $\alpha              LaTeX Suite's Greek spelling, also auto
$sr        →  $^{2}                and `_`, `cb`, `rd`, `**`, `->`, `<=`, `!=`, `oo` …
```

Tab then walks the tabstops, in the order LaTeX Suite numbers them: `$ff<Tab>3<Tab>4<Tab>`
puts the caret in the numerator, then the denominator, then after the fraction.

## Install

```sh
dsh plugin --profile <profile> add dsh-math-snippets
```

Restart the harness afterwards (a profile's bundle list is read at boot), then reload
the GUI page.

<details>
<summary>Installing from a checkout instead</summary>

Add a row to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: math-snippets
      name: 'file:///path/to/dsh-math-snippets/index.js'
```
</details>

## LaTeX Suite parity

The table is not a hand-written approximation: it is generated from LaTeX Suite's
`src/default_snippets.js`, keeping every entry that can be expressed as a plain string
snippet. **142 tags, 138 of them auto, 4 left on Tab.**

| | |
|---|---|
| Same | the trigger vocabulary (`//`, `@a`, `sr`, `cb`, `rd`, `_`, `**`, `->`, `<=`, `>=`, `!=`, `oo`, `sum`, `lim`, `dint`, `hat`, `bar`, `vec`, `norm`, `ceil`, `floor`, `text`, …), which triggers are **auto** and which need Tab, `w` word-boundary flags, and the `$0`,`$1`,`$2` tabstop order |
| Same | the `${1:\infty}` placeholder syntax parses (the default text is dropped — see below) |
| Different | the four LaTeX Suite deliberately keeps on <kbd>Tab</kbd> — `par`, `\sum`, `\prod`, `\int` — stay on Tab here too, which is the point |
| Different | `dm` does not prepend the newline LaTeX Suite's does. In a note you always want display math on a line of its own; in a chat composer the common case is that you are already on an empty line, and that newline would leave a blank first paragraph |
| Different | no *conceal/render* of formulas while typing, no auto-enlarging brackets, no backwards expansion, no regex/visual/function snippets, and `${1:x}` placeholder text is not preselected: the shell publishes no selection seam, so a hole is empty instead |

## Snippet table

On first start the host half writes an editable table to **`~/.dsh/math-snippets.json`**
containing every built-in trigger, and serves the effective table at
`/plugin/math-snippets/table`. The browser half re-reads that route once a minute, so
edits take effect without a restart or a page reload.

Each entry is `{ "body": "...", "auto": true }`:

| Field | Meaning |
|---|---|
| `body` | what the trigger becomes. `$0`, `$1`, `$2` … are holes and Tab visits them in numeric order; `${1:\infty}` is accepted too. A body with no hole leaves the caret after the text. |
| `auto` | `true` expands on the keystroke that completes the trigger, with **no Tab**. This is the default here, as it is in LaTeX Suite. |
| `open` | `true` allows the trigger **outside** math (used by `mk` and `dm`, which are how you *enter* math). Everything else only fires inside `$…$`, `$$…$$`, `\(…\)` or `\[…\]`. |
| `word` | `true` also requires a delimiter after the trigger, so `dm` inside `dmx` stays a word. Taken from LaTeX Suite's `w` flag. |
| `desc` | free-form note for yourself; unused by the expander. |

Example — add your own:

```json
{
  "snippets": {
    "capm": { "body": "$E[R_i]=R_f+\\beta_i(E[R_m]-R_f)$", "auto": true },
    "npv":  { "body": "\\mathrm{NPV}=\\sum_{t=0}^{n}\\frac{CF_t}{(1+r)^t}" },
    "par":  { "body": "\\frac{\\partial $0}{\\partial $1}", "auto": true }
  }
}
```

A tag in the file overrides the built-in of the same name **field by field**, so an entry that
only restates a `body` keeps the built-in's `open`/`auto`/`word` switches — and an explicit
`"auto": false` turns one off. That last line is the escape hatch: if an auto trigger fires
when you were still typing a word, switch that one tag to Tab.

### Two kinds of tag

| Tag | Kind | Matched as |
|---|---|---|
| `ff`, `sum`, `alp` | bare word | the **whole word** before the caret (`xff` is the token `xff`, not `ff`) |
| `//`, `@a`, `_`, `sr` | literal run | the **exact characters** before the caret; longest table entry wins |

A tag is a bare word when it is all letters, and a literal run otherwise, so `//`, `_`, `**`,
`->`, `@a` and `:e` all work. Two carve-outs keep literal runs out of URLs, mirroring the
shell's own `/` rules: a slash directly after another slash does not fire (`///` is dead), and
a slash pair after a `scheme:` colon does not either, so `https://` never arms the fraction.

## How it works

Four seams the shell already publishes, no DOM editing and no fork of the composer:

1. **The caret** comes from `shell.projection`, the composer's own projection product
   (`{ detectText, clipboardText, selection, caret }`). `caret` is an offset into
   `detectText` — the same coordinate space the input span uses — so nothing is measured
   from the DOM.
2. **The replacement** is dispatched as the scoped input event the shell installs for its
   own input-trigger sources:
   `actx.bail(actx, "slash/input-insert-text", { text, span })` with
   `actx = sessions.scope(sessionId)` and `span = { start, end, draftRev }`. The shell
   refuses a span whose `draftRev` no longer matches, so a stale keystroke can never
   corrupt the draft.
3. **The hole** needs no caret API, because the shell always leaves the caret *after* what
   it inserted. So the expansion goes in **tail first, then head at the collapsed point
   where the tail starts** — the head pushes the tail right and the caret ends up exactly
   in the hole. This is why the second insert uses `start === end`.
4. **Typing without Tab** rides `keyup`, not a draft subscription: by then the character is
   committed and the shell has re-projected, and it is an ordinary event rather than a
   notification raised inside the editor's own update, so the insert travels the same scoped
   path a Tab would have taken.

## Behaviour and limits

- **Auto by default, Tab available always.** Every tag except `par`, `\sum`, `\prod` and
  `\int` (the four LaTeX Suite keeps on Tab) expands as it is typed; Tab expands any of them
  and is never needed for the rest.
- **Tab is only consumed when something actually applied.** Every other keystroke, and every
  trigger that does not match, passes through untouched — including Tab's normal meaning.
- **Tab walks the holes.** The next hole is *re-found* each time — the walk searches forward
  from the caret for the literal that sat between the two holes in the body — so typing any
  amount in a hole shifts nothing, and an expansion typed inside a hole still wins over the
  walk. Moving the caret back before the hole you were placed in, or a draft that carries a
  file chip (detect and clipboard coordinates diverge there), stands the walk down and hands
  Tab back. The walk is not free: the shell publishes no bare caret move, so each jump is an
  edit that writes back the exact text it replaces — the draft ends up unchanged, but the
  jump costs one undo step.
- **Prose is safe.** A snippet without `"open": true` never fires outside math, so typing
  `sum` in a sentence does nothing. `$` glued to a digit is read as a currency sign, so
  `costs $5 and $10` is not math. Code spans and fenced blocks are skipped whole.
- **A LaTeX command is never a trigger.** The word path refuses a trigger directly behind
  `\`, `/`, `@` or `#`, so typing `\operatorname` cannot fire `op`. Only the three explicit
  literal tags `\sum`, `\prod` and `\int` match a backslash, and they are Tab-only.
- **Auto can still surprise on a longer word.** Typing `par` is fine (Tab-only), but a bare
  word that *starts* with an auto trigger expands at the trigger, so `integral` would become
  `\int…egral`. `word: true` only guards the case where a character already follows the
  trigger. Fix it per tag with `"auto": false`, or press Cmd/Ctrl+Z — the undo step restores
  the typed trigger.
- **The whole word is the trigger.** `xff` yields the token `xff`, not `ff`: a word snippet
  can never fire from the middle of a word. A literal trigger still fires there, because
  `x//` is a fraction in LaTeX Suite too.
- **`$` in a body is a hole marker.** A literal `$` cannot currently be written in a body,
  and `${1:default}` loses its default text.

## Diagnostics

```sh
curl -s http://127.0.0.1:<port>/plugin/math-snippets/status   # mounted + counts
curl -s http://127.0.0.1:<port>/plugin/math-snippets/table    # the effective table
```

Loopback `Host` only.

## Tests

```sh
npm test
```

62 assertions, no harness and no browser. Two layers: the keystroke paths run against a fake
composer that mirrors the shell's span semantics (span replacement, caret after the
insertion, collapsed inserts, stale-revision refusal), so hole placement, the tabstop walk and
the auto path are asserted at the level that matters — the resulting text **and** where the
caret ends up — and the seat itself is then rendered against a fake document and fake shell,
so the dependency wiring, the composer gate, the capture listeners and their cleanup are
exercised too.

## Compatibility

Written and verified against **dsh 0.1.5-rc.2** (client packages `0.1.5-rc.2`, DSH Desktop
2.0.13). The projection product and the `slash/input-insert-text` contract were read out of
that version's sources; a newer shell may move either.

## License

MIT
