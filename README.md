# dsh-math-snippets

Obsidian-LaTeX-Suite-style **snippet expansion in the DSH web composer**: type a short
trigger, press **Tab**, and it becomes a formula template with the caret already
inside the first hole.

```
$ff<Tab>     →  $\frac{}{}$          cursor between the braces
$//          →  $\frac{}{}$          no Tab needed: `//` is an auto snippet
$sum<Tab>    →  $\sum_{i=1}^{n} $    cursor after the sum
mk<Tab>      →  $$                   cursor between the dollars, outside math
dm<Tab>      →  $$⏎⏎$$               display math, cursor on the empty line
$alp<Tab>    →  $\alpha              cursor at the end
```

Then Tab again to walk to the next hole: `$ff<Tab>3<Tab>` puts the caret in the
denominator.

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

## Snippet table

On first start the host half writes an editable table to **`~/.dsh/math-snippets.json`**
containing every built-in trigger, and serves the effective table at
`/plugin/math-snippets/table`. The browser half re-reads that route once a minute, so
edits take effect without a restart or a page reload.

Each entry is `{ "body": "...", "open": false }`:

| Field | Meaning |
|---|---|
| `body` | what the trigger becomes. `$1`, `$2` … are holes; the caret lands in the **lowest-numbered** one and Tab then walks the rest. `$0` is the final position and is walked to last. A body with no hole leaves the caret after the text. |
| `open` | `true` allows the trigger **outside** math (used by `mk` and `dm`, which are how you *enter* math). Everything else only fires inside `$…$`, `$$…$$`, `\(…\)` or `\[…\]`. |
| `auto` | `true` expands on the keystroke that completes the trigger, with **no Tab** (`//` ships this way). Opt-in per tag. |
| `desc` | free-form note for yourself; unused by the expander. |

Example — add your own:

```json
{
  "snippets": {
    "capm": { "body": "$E[R_i]=R_f+\\beta_i(E[R_m]-R_f)$" },
    "npv":  { "body": "\\mathrm{NPV}=\\sum_{t=0}^{n}\\frac{CF_t}{(1+r)^t}" },
    "ff":   { "body": "\\dfrac{$1}{$2}" }
  }
}
```

A tag in the file overrides the built-in of the same name **field by field**, so an entry that
only restates a `body` keeps the built-in's `open` and `auto` switches — and an explicit
`"auto": false` turns one off.

### Two kinds of tag

| Tag | Kind | Matched as |
|---|---|---|
| `ff`, `sum`, `alp` | bare word | the **whole word** before the caret (`xff` is the token `xff`, not `ff`) |
| `//` | literal run | the **exact characters** before the caret; longest table entry wins |

A literal tag is anything that is not a bare word, so `//`, `__` or `@@` all work as
triggers — `//` is simply the one LaTeX Suite users already have in their fingers. Two
carve-outs keep them out of URLs, mirroring the shell's own `/` rules: a slash directly
after another slash does not fire (`///` is dead), and a slash pair after a `scheme:` colon
does not either, so `https://` never arms the fraction. `//` keeps `ff` as an alias; drop
either from the table if you want only one.

## How it works

Three seams the shell already publishes, no DOM editing and no fork of the composer:

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

## Behaviour and limits

- **Tab is only consumed when a replacement actually applied.** Every other keystroke, and
  every trigger that does not match, passes through untouched — including Tab's normal
  meaning. The decision is made by dispatching first and only calling
  `preventDefault()` once the shell confirms the edit.
- **`auto` snippets need no Tab.** `//` is marked `auto: true`, so the fraction appears on the
  keystroke that completes the trigger — the LaTeX Suite habit exactly. It rides `keyup`,
  because by then the character is committed and the shell has re-projected, and it is an
  ordinary event rather than a notification raised inside the editor's own update, so the
  insert travels the same scoped path a Tab would have taken. Only a tag marked `auto` does
  this, and only while the composer phase is `plain`.
- **Tab walks the holes.** `$ff<Tab>` puts the caret in the numerator; type it, press Tab, and
  the caret is in the denominator. The next hole is *re-found* each time — the walk searches
  forward from the caret for the literal that sat between the two holes in the body — so
  typing any amount in a hole shifts nothing, and an expansion typed inside a hole still wins
  over the walk. Moving the caret back before the hole you were placed in, or a draft that
  carries a file chip (detect and clipboard coordinates diverge there), stands the walk down
  and hands Tab back. The walk is not free: the shell publishes no bare caret move, so each
  jump is an edit that writes back the exact text it replaces — the draft ends up unchanged,
  but the jump costs one undo step.
- **Prose is safe.** A snippet without `"open": true` never fires outside math, so typing
  `ff` in a sentence and pressing Tab does nothing. `$` glued to a digit is read as a
  currency sign, so `costs $5 and $10` is not math. Code spans and fenced blocks are
  skipped whole.
- **Menu prefixes are excluded.** A bare-word trigger directly behind `/`, `@`, `#` or `\`
  is not recognised, so this can never shadow the slash-command, reference or tag menus.
  Literal triggers (like `//`) use their own boundary rule instead — see above.
- **The whole word is the trigger.** `xff` yields the token `xff`, not `ff`: a word snippet
  can never fire from the middle of a word. A literal trigger still fires there, because
  `x//` is a fraction in LaTeX Suite too.
- **`$` in a body is a hole marker.** A literal `$` cannot currently be written in a body.

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

59 assertions, no harness and no browser. Two layers: the keystroke paths run against a fake
composer that mirrors the shell's span semantics (span replacement, caret after the
insertion, collapsed inserts, stale-revision refusal), so the two-step hole placement and the
hole walk are asserted at the level that matters — the resulting text **and** where the caret
ends up — and the seat itself is then rendered against a fake document and fake shell, so the
dependency wiring, the composer gate, the capture listeners and their cleanup are exercised
too.

## Compatibility

Written and verified against **dsh 0.1.5-rc.2** (client packages `0.1.5-rc.2`, DSH Desktop
2.0.13). The projection product and the `slash/input-insert-text` contract were read out of
that version's sources; a newer shell may move either.

## License

MIT
