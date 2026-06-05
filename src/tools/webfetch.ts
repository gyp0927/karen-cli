import { Tool, ToolResult } from '../core/types.js';
import { resilientFetch } from '../utils/http.js';

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function createWebFetchTool(): Tool {
  return {
    name: 'WebFetch',
    description: 'Fetch the content of a web page by URL. Returns the page text content. Use this to read documentation, check APIs, or gather information from the internet.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL of the web page to fetch (e.g., https://example.com/docs).',
        },
        max_length: {
          type: 'number',
          description: 'Optional. Maximum number of characters to return (default 8000).',
        },
      },
      required: ['url'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const url = String(args.url || '');
      const maxLength = typeof args.max_length === 'number' ? args.max_length : 8000;

      if (!url) {
        return {
          success: false,
          output: '',
          error: 'Missing "url" argument.',
        };
      }

/** Normalize hostname: decode punycode, strip zone indices, etc. */
function normalizeHost(hostname: string): string {
  try {
    // Decode punycode (IDN)
    const decoded = new URL(`http://${hostname}`).hostname;
    return decoded.toLowerCase();
  } catch {
    return hostname.toLowerCase();
  }
}

/** Check if a hostname resolves to a private/internal IP range. */
function isPrivateHost(hostname: string): boolean {
  const h = normalizeHost(hostname);
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]' || h === '::1') return true;
  if (h.startsWith('10.')) return true;
  if (h.startsWith('192.168.')) return true;
  if (h.startsWith('169.254.')) return true;
  if (h.endsWith('.local')) return true;

  // 172.16.0.0/12
  const match172 = h.match(/^172\.(\d+)\./);
  if (match172) {
    const second = parseInt(match172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // 100.64.0.0/10 (CGNAT)
  const match100 = h.match(/^100\.(\d+)\./);
  if (match100) {
    const second = parseInt(match100[1], 10);
    if (second >= 64 && second <= 127) return true;
  }

  // IPv6 link-local and ULA
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;

  // Block full IPv6 loopback forms
  if (/^\[:?[0:]+1\]$/.test(hostname)) return true;

  // Block octal/hex-encoded IPv4 (e.g., 0177.0.0.1, 0x7f000001)
  try {
    // Check for hex IP
    if (/^0x[0-9a-f]{8}$/i.test(h.replace(/\./g, ''))) return true;
    // Check for octal IP (leading zero in any octet)
    const octets = h.split('.');
    if (octets.length === 4 && octets.some(o => o.startsWith('0') && o.length > 1)) return true;
  } catch { /* ignore */ }

  return false;
}

      try {
        // SSRF protection: block private/internal IP ranges
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          return { success: false, output: '', error: 'Only HTTP and HTTPS URLs are allowed.' };
        }
        if (isPrivateHost(parsedUrl.hostname)) {
          return { success: false, output: '', error: 'Access to internal/private networks is blocked.' };
        }

        const result = await resilientFetch({
          url,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeoutMs: 30_000,
          maxRetries: 2,
          // SSRF protection: block redirects (maxRedirects defaults to 0)
        });

        if (!result.ok) {
          const code = result.status === 429 ? 'RATE_LIMITED' : result.error?.includes('timed out') ? 'TIMEOUT' : 'NETWORK_ERROR';
          return { success: false, output: '', error: result.error || `HTTP ${result.status}`, errorCode: code };
        }

        const MAX_BODY_BYTES = 5 * 1024 * 1024;
        if (result.text.length > MAX_BODY_BYTES) {
          return { success: false, output: '', error: `Response too large. Use a more specific URL.` };
        }

        const raw = result.text;

        // Auto-detect content type from response body
        let output: string;
        if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
          try { output = JSON.stringify(JSON.parse(raw), null, 2); } catch { output = raw; }
        } else if (raw.trim().startsWith('<')) {
          output = htmlToText(raw);
        } else {
          output = raw;
        }

        if (output.length > maxLength) {
          output = output.slice(0, maxLength) + '\n\n[Content truncated. Use a lower max_length or fetch a specific section.]'; }

        return {
          success: true,
          output,
        };
      } catch (err) {
        return {
          success: false,
          output: '',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
