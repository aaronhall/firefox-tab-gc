# firefox-tab-gc

A minimal Firefox extension that frees memory for tabs that have been idle for
more than 10 minutes. Useful for people like me who don't possess any tab
discipline and exhaust memory with their reckless tab usage.

## What it does

Deactivates tabs that haven't been focused and haven't played media for the last
ten minutes, ignoring pinned tabs. An inactive tab is simply unloaded from
memory; the tab remains open. When you focus it again, it will refresh the page
but navigation history is preserved.

Firefox does this automatically when the system is close to running out of
memory. This extension just does it more aggressively.

The toolbar button's popup shows how many of the currently-open tabs were
deactivated by this extension (not including those deactivated by Firefox
itself).

## Install

1. In Firefox, open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select `extension/manifest.json`.
