# PRD: firefox-tab-gc

## 1. Problem

Over the course of a working session the user accumulates 20–30 open tabs that hold
live process memory. Firefox can free that memory by *discarding* a tab (unloading
its content while keeping it visible and recoverable in the tabstrip), but Firefox's
own auto-discarding is uncontrollable and the user has no simple, predictable way to
say "free the memory of any tab I haven't touched in a while."

## 2. Goals (v1)

- **Free memory** held by idle tabs by discarding them via `browser.tabs.discard()`.
- **Be dead simple and predictable:** a tab that has not been active or playing media
  for more than 10 minutes gets discarded. Nothing else happens.
- **Surface a single metric:** the toolbar button/popup shows how many currently-open
  tabs the extension itself deactivated.

## 3. Non-Goals (v1)

Everything below is explicitly out of scope for v1. Some are deferred to v2; some
were considered and dropped for simplicity.

- **No tab moving / reordering.** Discarded tabs stay wherever they are in the
  tabstrip. No grouping.
- **No visual marker (e.g., `⊘` title prefix).** Discarding is invisible on the
  tabstrip beyond Firefox's own (subtle) discarded styling. This is accepted for v1.
- **No cap / no eviction.** Nothing is ever closed by the extension. Discarding is
  reversible by clicking the tab; no auto-closing of stale-discarded tabs.
- **No idle-delay configuration.** The 10-minute threshold is hardcoded.
- **No private-window handling.** No special code. Whatever Firefox's default
  extension behavior is for private windows applies; the extension does not opt in or
  out or branch on it.
- **No whitelist.** Every non-pinned, non-active, non-audible tab in scope.
- **No per-URL backoff / backoff decay.** Deferred to v2.
- **No "sort by recency" button.** Considered, dropped for v1 simplicity.
- **No live-tab recency gradient.** Deferred.
- **No manifest MV3 migration.** v1 stays MV2 to match the spike.

## 4. Behavior

The extension is a single background script with a recurring timer ("tick") firing
every ~10 seconds and a popup. There are no content scripts and no options page.

### 4.1 Per-tick algorithm

On every tick:

1. **Stamp active tabs.** `browser.tabs.query({active: true})` → for each tab `t`,
   set `lastActive[t.id] = Date.now()`.
2. **Stamp audible tabs.** `browser.tabs.query({audible: true})` → for each tab `t`,
   set `lastActive[t.id] = Date.now()`.
   - Audible tabs are treated as active-by-virtue-of-playing: their idle clock keeps
     getting refreshed every tick while they remain audible, and resumes naturally
     from the last stamp when playback stops. No event listeners, no paused-clock
     state — the poll re-derives everything each tick.
3. **Reconcile the ledger** (see §4.3): drop `ourDiscarded` entries for tabs no
   longer discarded (reloaded or closed).
4. **Discard candidates.** For every tab in `browser.tabs.query({})` that is not
   `pinned`, not `active`, not `audible`, and not already `discarded`: if
   `Date.now() - lastActive[t.id] > 10 min`, call `browser.tabs.discard([t.id])` and
   add `t.id` to `ourDiscarded`. Failures from `discard` (e.g., the tab became active
   again between query and discard) are swallowed.

### 4.2 Popup

The browser action popup displays one integer: the number of currently-open tabs the
extension itself has deactivated (`ourDiscarded.size`). It is **not** a session or
all-time total, and it **does not** include tabs Firefox auto-discarded on its own.

On open, the popup sends a `getCount` message to the background; the background
reconciles the ledger against `tabs.query({discarded:true})` and responds with the
count. The popup shows a snapshot at open time — it does not live-update while open.

### 4.3 State

- `lastActive: Map<tabId, number>` — last time the tab was active or audible. Stamped
  on tick. Seeded `now` for all existing tabs on startup and on `tabs.onCreated`.
- `ourDiscarded: Set<tabId>` — membership ledger of tabs *this extension* has
  discarded. Drives only the popup count. Reconciled each tick (and on each popup
  open) against `tabs.query({discarded:true})` so reloads and closes drop out within
  ~10s. `tabs.onRemoved` also removes the id from both maps immediately as
  belt-and-suspenders.

### 4.4 Startup / session restore

On extension startup: `browser.tabs.query({})` → `stamp` each existing tab with
`now` (assumes fresh on startup). Tabs that Firefox had already discarded before our
startup are **not** seeded into `ourDiscarded` — they were not deactivated by us and
do not count toward the popup number.

## 5. Why poll-driven (not event-driven) for idle tracking

Event listeners (`tabs.onActivated`, `tabs.onUpdated` with `audible`) can be missed
during OS sleep/suspend or browser throttling. The tick re-derives the active+audible
set from fresh queries every 10 seconds, so the worst case for a missed state
transition is one tick (~10s) of staleness. This trades a tiny bit of CPU for a much
simpler correctness story. The only event listeners used are `onCreated` and
`onRemoved` for seeding/cleanup — not for idle-clock maintenance.

## 6. Edge cases

- **`tabs.discard` fails** (tab became active again between query and discard; or is
  otherwise undiscardable): the rejection is swallowed; the tab is not added to
  `ourDiscarded`. Next tick re-evaluates.
- **Firefox already discarded a tab on its own** before our tick or between ticks:
  that tab is filtered out by `t.discarded` (not a candidate) and is never in
  `ourDiscarded`, so it never counts toward the popup number.
- **User clicks one of our discarded tabs** → Firefox reloads it → it is no longer
  `discarded:true` → next tick's reconcile drops it from `ourDiscarded` → popup
  count decrements within ~10s.
- **Private windows:** with the manifest's default private-window behavior the
  extension's background runs there too, and the algorithm treats private-window
  tabs identically to normal tabs. No branching, no opt-in. This is intentional and
  matches "do nothing around private windows."

## 7. Permissions

- `tabs` — required for `tabs.query`, `tabs.discard`, `tabs.onCreated`,
  `tabs.onRemoved`. Also yields access to the non-privileged `Tab` properties used
  in candidate filtering (`pinned`, `active`, `audible`, `discarded`).

No `<all_urls>`, no `storage`, no `contextMenus`, no host permissions. Manifest is
MV2, matching the spike.

## 8. File layout

```
extension/
  manifest.json   - MV2 manifest; tabs permission; background script; popup.
  background.js   - tick loop, stamping, ledger, discard, popup message handler.
  popup.html      - one-number popup.
  popup.js        - sends getCount, renders the integer.
```

## 9. Deferred to v2

- Per-URL reopening-frequency backoff (multiplies base delay per frequently-reopened
  URL) and its decay strategy.
- Whitelist (match patterns of URLs never to discard) and its runtime UX (options
  textarea vs. context menu "never auto-close this site").
- Optional idle-delay configurability (currently hardcoded 10 min).
- Live-tab recency gradient or an on-demand "sort by lastActive" toolbar action.
- Manifest V3 migration.
- Optional cap-eviction (auto-close oldest discarded tabs beyond a limit) —
  explicitly dropped from v1; only reintroduce if unbounded discarded memory becomes
  a real problem in practice.
- Optional tab grouping / tab moving of discarded tabs to the tail of the tabstrip —
  dropped from v1 for simplicity.
- Optional `⊘` title-prefix visual marker for discarded tabs — dropped from v1.