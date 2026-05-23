import { Tool, ToolResult } from '../core/types.js';

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

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (!response.ok) {
          return {
            success: false,
            output: '',
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const contentType = response.headers.get('content-type') || '';
        const raw = await response.text();

        let output: string;
        if (contentType.includes('application/json')) {
          // Pretty-print JSON
          try {
            const parsed = JSON.parse(raw);
            output = JSON.stringify(parsed, null, 2);
          } catch {
            output = raw;
          }
        } else if (contentType.includes('text/html') || raw.trim().startsWith('<')) {
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
