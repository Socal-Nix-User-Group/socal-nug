import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Just enough of the Chrome DevTools Protocol to behave like a visitor:
 * load a page, move a mouse, press a key, drag a finger, and read back what
 * the page did about it.
 *
 * Nothing here but node's own modules and its built-in WebSocket and fetch,
 * so the browser check needs no npm any more than the rest of this package
 * does. It expects a `chromium` on PATH, which the Nix wrapper provides.
 */

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Protocol payloads are whatever Chromium says they are. */
type Payload = any;

export interface Tab {
  /** Uncaught exceptions the page has thrown since the last `goto`. */
  readonly errors: string[];
  send(method: string, params?: Record<string, unknown>): Promise<Payload>;
  /** Run an expression in the page and bring its value back. */
  evaluate<T>(expression: string): Promise<T>;
  /**
   * Poll an expression until it is truthy. Waiting on what the page does
   * rather than for a fixed time is what keeps a slow machine from turning
   * a pass into a failure. False if it never came true.
   */
  waitFor(expression: string, timeoutMs?: number): Promise<boolean>;
  size(width: number, height: number, phone?: boolean): Promise<void>;
  goto(url: string): Promise<void>;
  move(x: number, y: number): Promise<void>;
  click(x: number, y: number): Promise<void>;
  key(name: "Tab" | "Enter" | "Escape" | "ArrowDown"): Promise<void>;
  /** With `ctrl`, the wheel a pinch on a trackpad sends. */
  wheel(x: number, y: number, deltaY: number, ctrl?: boolean): Promise<void>;
  /** A mouse pressed in one place, moved, and let go in another. */
  pull(fromX: number, fromY: number, toX: number, toY: number): Promise<void>;
  /** A finger put down and lifted in one place. */
  tap(x: number, y: number): Promise<void>;
  /** A finger dragged from one height to another. */
  drag(x: number, fromY: number, toY: number): Promise<void>;
}

export interface Browser {
  tab(): Promise<Tab>;
  close(): void;
}

const KEY_CODES = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40 };

export async function launch(): Promise<Browser> {
  const profile = mkdtempSync(join(tmpdir(), "origins-browser-"));
  const chromium = spawn("chromium", [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-gpu",
    "about:blank",
  ], { stdio: "ignore" });
  const close = (): void => {
    chromium.kill();
    // Chromium goes on writing to its profile for a moment after it is told
    // to stop, so the first attempt can find the directory not yet empty.
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  };

  // Asked for port 0, Chromium picks a free one and writes it into its
  // profile once it is listening.
  const portFile = join(profile, "DevToolsActivePort");
  let port = "";
  for (let waited = 0; port === ""; waited += 50) {
    if (waited > 20_000) {
      close();
      throw new Error("chromium did not start listening within 20s");
    }
    await sleep(50);
    if (existsSync(portFile)) {
      port = readFileSync(portFile, "utf8").split("\n")[0].trim();
    }
  }

  return {
    close,
    async tab(): Promise<Tab> {
      const made = await fetch(
        `http://127.0.0.1:${port}/json/new?about:blank`,
        { method: "PUT" },
      );
      const { webSocketDebuggerUrl } = await made.json();
      return await attach(webSocketDebuggerUrl);
    },
  };
}

async function attach(url: string): Promise<Tab> {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });

  let nextId = 1;
  const waiting = new Map<
    number,
    { resolve: (value: Payload) => void; reject: (reason: Error) => void }
  >();
  const once = new Map<string, Array<() => void>>();
  const errors: string[] = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const call = waiting.get(message.id);
      waiting.delete(message.id);
      if (call === undefined) return;
      if (message.error !== undefined) {
        call.reject(new Error(JSON.stringify(message.error)));
      } else {
        call.resolve(message.result);
      }
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      errors.push(details.exception?.description ?? details.text);
    }
    for (const resume of once.get(message.method) ?? []) resume();
    once.delete(message.method);
  });

  const send = (
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Payload> =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      waiting.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const next = (method: string): Promise<void> =>
    new Promise((resolve) => {
      once.set(method, [...(once.get(method) ?? []), resolve]);
    });

  const mouse = (type: string, x: number, y: number, more = {}) =>
    send("Input.dispatchMouseEvent", { type, x, y, ...more });
  const touch = (type: string, points: Array<{ x: number; y: number }>) =>
    send("Input.dispatchTouchEvent", { type, touchPoints: points });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const tab: Tab = {
    errors,
    send,
    async evaluate<T>(expression: string): Promise<T> {
      const out = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (out.exceptionDetails !== undefined) {
        const details = out.exceptionDetails;
        throw new Error(
          `in the page: ${details.exception?.description ?? details.text}`,
        );
      }
      return out.result.value;
    },
    async waitFor(expression: string, timeoutMs = 4000): Promise<boolean> {
      for (let waited = 0; waited <= timeoutMs; waited += 50) {
        if (await tab.evaluate<unknown>(expression)) return true;
        await sleep(50);
      }
      return false;
    },
    async size(width: number, height: number, phone = false): Promise<void> {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: phone,
      });
      await send("Emulation.setTouchEmulationEnabled", { enabled: phone });
    },
    async goto(url: string): Promise<void> {
      errors.length = 0;
      const loaded = next("Page.loadEventFired");
      await send("Page.navigate", { url });
      await loaded;
    },
    async move(x: number, y: number): Promise<void> {
      await mouse("mouseMoved", x, y);
    },
    async click(x: number, y: number): Promise<void> {
      const press = { button: "left", clickCount: 1 };
      await mouse("mouseMoved", x, y);
      await mouse("mousePressed", x, y, press);
      await mouse("mouseReleased", x, y, press);
    },
    async key(name): Promise<void> {
      const key = {
        key: name,
        code: name,
        windowsVirtualKeyCode: KEY_CODES[name],
        ...(name === "Enter" ? { text: "\r" } : {}),
      };
      await send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    },
    async wheel(x: number, y: number, deltaY: number, ctrl = false): Promise<void> {
      // 2 is Ctrl in the protocol's modifier bits
      await mouse("mouseWheel", x, y, {
        deltaX: 0,
        deltaY,
        modifiers: ctrl ? 2 : 0,
      });
    },
    async pull(fromX, fromY, toX, toY): Promise<void> {
      const held = { button: "left", buttons: 1 };
      const steps = 8;
      await mouse("mouseMoved", fromX, fromY);
      await mouse("mousePressed", fromX, fromY, { ...held, clickCount: 1 });
      for (let i = 1; i <= steps; i += 1) {
        await mouse(
          "mouseMoved",
          fromX + ((toX - fromX) * i) / steps,
          fromY + ((toY - fromY) * i) / steps,
          held,
        );
        await sleep(16);
      }
      await mouse("mouseReleased", toX, toY, { button: "left", clickCount: 1 });
    },
    async tap(x: number, y: number): Promise<void> {
      await touch("touchStart", [{ x, y }]);
      await touch("touchEnd", []);
    },
    async drag(x: number, fromY: number, toY: number): Promise<void> {
      const steps = 12;
      await touch("touchStart", [{ x, y: fromY }]);
      for (let i = 1; i <= steps; i += 1) {
        await touch("touchMove", [{ x, y: fromY + ((toY - fromY) * i) / steps }]);
        await sleep(16);
      }
      await touch("touchEnd", []);
    },
  };
  return tab;
}
