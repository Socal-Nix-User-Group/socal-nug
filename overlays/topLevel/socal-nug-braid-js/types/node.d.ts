/**
 * The slice of node's standard library this package uses.
 *
 * The engine itself is DOM code and imports nothing from node; this exists so
 * the tests and the smoke check can be typechecked rather than only compiled.
 * esbuild strips types without checking them, so a test file outside `tsc`'s
 * reach is a test file with no types at all, and adding a required field to
 * an interface then shows up as a confusing test failure instead of a type
 * error naming every fixture that needs it.
 *
 * Hand-written rather than `@types/node`, which nixpkgs does not package: the
 * alternative is a package.json, a lockfile and an npmDepsHash for three
 * modules' worth of signatures. Declare only what is used, so an import that
 * reaches past this is a compile error and a prompt to come back here.
 */

declare module "node:test" {
  /** Runs `body`; a rejected promise from it fails the test. */
  export default function test(
    name: string,
    body: () => void | Promise<void>,
  ): void;
}

declare module "node:assert/strict" {
  interface Assert {
    /** Deep strict equality, which for primitives is `===`. */
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    /**
     * Truthy, not `=== true`. An assertion signature, so the narrowing a
     * test does with it carries into the lines after it: `assert.ok(x !==
     * undefined)` leaves `x` non-optional, as it does at runtime.
     */
    ok(value: unknown, message?: string): asserts value;
    throws(body: () => unknown, expected?: RegExp | (new () => Error)): void;
    doesNotThrow(body: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:fs" {
  /** With an encoding it returns text; without one, bytes. */
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { isDirectory(): boolean };
  /** Makes a fresh directory whose name starts with `prefix`; returns it. */
  export function mkdtempSync(prefix: string): string;
  export function rmSync(
    path: string,
    options: {
      recursive: boolean;
      force: boolean;
      /** Tries again when the directory is busy or not yet empty. */
      maxRetries: number;
      retryDelay: number;
    },
  ): void;
}

// What follows is for the browser check, which starts a browser and serves
// it the built site. The tests and the smoke check use none of it.

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function normalize(path: string): string;
  /** The last extension with its dot, or "" when there is none. */
  export function extname(path: string): string;
}

declare module "node:child_process" {
  export function spawn(
    command: string,
    args: string[],
    options: { stdio: "ignore" },
  ): { kill(): boolean };
}

declare module "node:http" {
  interface Request {
    readonly url?: string;
  }
  interface Response {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: Uint8Array): void;
  }
  interface Server {
    listen(port: number, host: string, ready: () => void): void;
    /** The port is the one the system picked when asked for 0. */
    address(): { port: number };
    close(): void;
  }
  export function createServer(
    handler: (request: Request, response: Response) => void,
  ): Server;
}
