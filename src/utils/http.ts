/**
 * Shared HTTP utilities with retry, timeout, and resilience.
 */

export interface FetchOptions {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  /** Maximum number of redirects to follow. Default 0 for SSRF safety. */
  maxRedirects?: number;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function resilientFetch(opts: FetchOptions): Promise<FetchResult> {
  if (!isValidHttpUrl(opts.url)) {
    return { ok: false, status: 0, text: '', error: 'Invalid URL: only HTTP and HTTPS are supported' };
  }

  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxRetries = opts.maxRetries ?? 2;

  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let abortListener: (() => void) | undefined;

    // If parent signal fires, propagate
    if (opts.signal) {
      abortListener = () => controller.abort();
      opts.signal.addEventListener('abort', abortListener, { once: true });
    }

    try {
      const maxRedirects = opts.maxRedirects ?? 0;
      const response = await fetch(opts.url, {
        headers: opts.headers,
        signal: controller.signal,
        redirect: maxRedirects > 0 ? 'follow' : 'manual',
      });

      // Block redirect responses when SSRF protection is active (maxRedirects=0)
      if (maxRedirects === 0 && (response.status >= 300 && response.status < 400)) {
        return {
          ok: false,
          status: response.status,
          text: '',
          error: `Redirects are blocked for security. The server attempted to redirect to another URL.`,
        };
      }
      clearTimeout(timer);
      if (abortListener && opts.signal) {
        opts.signal.removeEventListener('abort', abortListener);
      }

      const text = await response.text();

      if (response.ok) {
        return { ok: true, status: response.status, text };
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
        lastError = `HTTP ${response.status}`;
        await sleep(Math.pow(2, attempt) * 500); // 500ms, 1s, 2s
        continue;
      }

      return { ok: false, status: response.status, text, error: `HTTP ${response.status}: ${response.statusText}` };
    } catch (err) {
      clearTimeout(timer);
      if (abortListener && opts.signal) {
        opts.signal.removeEventListener('abort', abortListener);
      }
      const msg = err instanceof Error ? err.message : String(err);

      if (attempt < maxRetries && (msg.includes('abort') || msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET'))) {
        lastError = msg;
        await sleep(Math.pow(2, attempt) * 500);
        continue;
      }

      return { ok: false, status: 0, text: '', error: msg };
    }
  }

  return { ok: false, status: 0, text: '', error: lastError || 'Request failed after retries' };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
