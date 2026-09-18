/* 引擎层 · CDP 客户端与目标发现。
 * 来自 Dream-Work-Theme 的注入方式（electron/manager/cdp.ts 的等价最小实现），
 * 不依赖任何第三方包：Node 22+ 自带 fetch 与全局 WebSocket。 */

import type { RendererTarget } from './types';

/** 目标发现依赖 /json/list。注意：若本机有 HTTP 代理，必须绕过，否则会被代理 502 截胡，
 *  表现为"端口没开"的假象。Node 的 fetch 默认读 HTTP_PROXY/HTTPS_PROXY：
 *  这里显式指定 127.0.0.1 直连，并且在进程内禁用代理环境变量对本次请求的影响。 */
export async function fetchTargets(port: number, timeoutMs = 4000): Promise<RendererTarget[]> {
  const previous = { http: process.env.HTTP_PROXY, https: process.env.HTTPS_PROXY, all: process.env.ALL_PROXY };
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.ALL_PROXY;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];
    const list = await response.json();
    return Array.isArray(list) ? (list as RendererTarget[]) : [];
  } catch {
    return [];
  } finally {
    if (previous.http !== undefined) process.env.HTTP_PROXY = previous.http;
    if (previous.https !== undefined) process.env.HTTPS_PROXY = previous.https;
    if (previous.all !== undefined) process.env.ALL_PROXY = previous.all;
  }
}

/** 在候选端口里挑出第一个有匹配渲染页的调试端点 */
export async function resolvePort(candidates: number[], urlHint: string): Promise<{ port: number; target: RendererTarget } | null> {
  for (const port of candidates) {
    const targets = await fetchTargets(port, 1500);
    const target = pickRendererTarget(targets, urlHint);
    if (target) return { port, target };
  }
  return null;
}

export function pickRendererTarget(targets: RendererTarget[], urlHint: string): RendererTarget | null {
  const pages = targets.filter((t) => t.type === 'page' && Boolean(t.webSocketDebuggerUrl));
  return pages.find((t) => typeof t.url === 'string' && t.url.includes(urlHint)) ?? null;
}

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** 一条 CDP 连接。只实现本注入器需要的 Runtime.evaluate / Page.addScriptToEvaluateOnNewDocument。 */
export class CdpSession {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly url: string) {}

  open(timeoutMs = 12_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error('CDP_CONNECT_TIMEOUT')), timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP_CONNECT_FAILED'));
      }, { once: true });
      socket.addEventListener('message', (event) => {
        let message: any;
        try {
          message = JSON.parse(String((event as MessageEvent).data));
        } catch {
          return;
        }
        if (!message.id || !this.pending.has(message.id)) return;
        const entry = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(`CDP_ERROR: ${JSON.stringify(message.error)}`));
        else entry.resolve(message.result);
      });
    });
  }

  call(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<any> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP_NOT_CONNECTED'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP_TIMEOUT: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify({ id, method, params }));
    });
  }

  /** 求值一个表达式并取回 JSON 值；表达式内请自行 JSON.stringify。 */
  async evaluate(expression: string, timeoutMs = 60_000): Promise<any> {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, timeoutMs);
    if (result?.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'unknown';
      throw new Error(`PAGE_EXCEPTION: ${String(text).split('\n')[0]}`);
    }
    return result?.result?.value;
  }

  close(): void {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
    this.socket = null;
  }
}
