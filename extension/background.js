const TICK_MS = 10000;
const IDLE_MS = 10 * 60 * 1000;

const lastActive = new Map();
const ourDiscarded = new Set();

function stamp(tab) {
  lastActive.set(tab.id, Date.now());
}

browser.tabs.query({}).then((tabs) => tabs.forEach(stamp));

browser.tabs.onCreated.addListener((tab) => stamp(tab));
browser.tabs.onRemoved.addListener((tabId) => {
  lastActive.delete(tabId);
  ourDiscarded.delete(tabId);
});

async function tick() {
  const now = Date.now();
  const [active, audible] = await Promise.all([
    browser.tabs.query({ active: true }),
    browser.tabs.query({ audible: true }),
  ]);
  active.forEach(stamp);
  audible.forEach(stamp);

  const discardedTabs = await browser.tabs.query({ discarded: true });
  const stillDiscarded = new Set(discardedTabs.map((t) => t.id));
  for (const id of [...ourDiscarded]) {
    if (!stillDiscarded.has(id)) ourDiscarded.delete(id);
  }

  const allTabs = await browser.tabs.query({});
  for (const t of allTabs) {
    if (t.pinned || t.active || t.audible || t.discarded) continue;
    const seen = lastActive.get(t.id);
    if (seen === undefined || now - seen <= IDLE_MS) continue;
    try {
      await browser.tabs.discard(t.id);
      ourDiscarded.add(t.id);
    } catch (e) {
    }
  }
}

setInterval(tick, TICK_MS);

async function reconcile() {
  const discardedTabs = await browser.tabs.query({ discarded: true });
  const stillDiscarded = new Set(discardedTabs.map((t) => t.id));
  for (const id of [...ourDiscarded]) {
    if (!stillDiscarded.has(id)) ourDiscarded.delete(id);
  }
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "getCount") {
    reconcile().then(() => sendResponse({ count: ourDiscarded.size }));
    return true;
  }
});