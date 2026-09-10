// Minimal dependency-free CDP driver (Node >= 22 global WebSocket).
const PORT = process.env.CDP_PORT || "9411";
const base = `http://127.0.0.1:${PORT}`;

async function targets() {
  return (await fetch(`${base}/json/list`)).json();
}

export async function open(url) {
  const created = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!created.ok) throw new Error(`new tab failed: ${created.status}`);
  return created.json();
}

/**
 * Close the tab, not just the socket.
 *
 * `Session.close()` only drops the WebSocket, so every script run left its tab
 * behind. 163 accumulated across a day of sweeps and starved the browser until
 * `Runtime.evaluate` began timing out mid-run — which reads as a failing check
 * rather than as an exhausted browser.
 */
export async function closeTab(target) {
  if (!target?.id) return;
  await fetch(`${base}/json/close/${target.id}`).catch(() => {});
}

export class Session {
  #ws; #id = 0; #pending = new Map(); #events = [];
  constructor(ws) { this.#ws = ws; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && s.#pending.has(msg.id)) {
        const { resolve, reject } = s.#pending.get(msg.id);
        s.#pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      } else if (msg.method) {
        s.#events.push(msg);
      }
    };
    return s;
  }
  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.#pending.delete(id)) reject(new Error(`${method} timed out`)); }, 60_000);
    });
  }
  events() { return this.#events; }
  close() { this.#ws.close(); }
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
    return r.result.value;
  }
  /**
   * Navigate and stop at the first frame that matches, rather than at
   * readyState complete.
   *
   * A streamed RSC route is "complete" only after its data resolves, so a
   * loading skeleton is never on screen by then: 47 of 51 loading pairs in an
   * earlier sweep measured the fully loaded page and reported it as screened.
   */
  async gotoUntil(url, expression, timeoutMs = 4000) {
    await this.send("Page.navigate", { url });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 80));
      const hit = await this.evaluate(expression).catch(() => false);
      if (hit) return true;
    }
    return false;
  }
  async goto(url) {
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const ready = await this.evaluate("document.readyState").catch(() => null);
      const here = await this.evaluate("location.href").catch(() => null);
      if (ready === "complete" && here && here !== "about:blank") return here;
    }
    throw new Error(`navigation to ${url} did not settle`);
  }
  /**
   * Tried and abandoned: forcing real `:hover` via CDP.
   *
   * Both `CSS.forcePseudoState` and a real `Input.dispatchMouseEvent` at the
   * element's own coordinates leave `element.matches(':hover')` reporting
   * `true` while `getComputedStyle` never applies a single `:hover`-scoped
   * rule — confirmed directly: a row's own built-in `hover:bg-muted/50`
   * computed as fully transparent (its un-hovered default) under both forcing
   * methods, in this headless Chrome. `matches()` reflects DevTools' forced
   * state for inspector purposes; the render/layout engine's actual style
   * recalculation does not follow it. There is no reliable way to observe a
   * genuine `:hover`-time computed style in this environment, so the sticky
   * probe's hover check goes back to reading declared CSS rules (in
   * `probe.mjs`) rather than the rendered result — a real limitation
   * worth a comment here so nobody re-discovers it by losing an evening to it.
   */
}

export async function firstPage() {
  const list = await targets();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  return page;
}
