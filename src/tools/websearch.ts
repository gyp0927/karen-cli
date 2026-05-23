import { Tool, ToolResult } from '../core/types.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // DuckDuckGo HTML results use .result class
  const resultBlocks = html.match(/<div class="result[^"]*"[\s\S]*?<\/div>\s*<\/div>/g) || [];

  for (const block of resultBlocks.slice(0, 10)) {
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"/);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    if (titleMatch && urlMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      let url = urlMatch[1];
      // DuckDuckGo sometimes wraps URLs in their redirect
      const ddgiMatch = url.match(/uddg=([^&]+)/);
      if (ddgiMatch) {
        try {
          url = decodeURIComponent(ddgiMatch[1]);
        } catch { /* keep original */ }
      }
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      results.push({ title, url, snippet });
    }
  }

  return results;
}

export function createWebSearchTool(): Tool {
  return {
    name: 'WebSearch',
    description: 'Search the web using DuckDuckGo. Returns a list of search results with title, URL, and snippet. Use this to find current information, documentation, tutorials, or anything on the internet.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g., "Node.js fetch API tutorial").',
        },
        count: {
          type: 'number',
          description: 'Optional. Number of results to return (default 5, max 10).',
        },
      },
      required: ['query'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const query = String(args.query || '');
      const count = Math.min(10, Math.max(1, typeof args.count === 'number' ? args.count : 5));

      if (!query) {
        return {
          success: false,
          output: '',
          error: 'Missing "query" argument.',
        };
      }

      try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
          redirect: 'follow',
        });

        if (!response.ok) {
          return {
            success: false,
            output: '',
            error: `Search failed: HTTP ${response.status}`,
          };
        }

        const html = await response.text();
        const results = parseDuckDuckGoResults(html);

        if (results.length === 0) {
          return {
            success: true,
            output: 'No results found for this query. Try different keywords.',
          };
        }

        const lines = results.slice(0, count).map((r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
        );

        return {
          success: true,
          output: `Search results for "${query}":\n\n${lines.join('\n\n')}`,
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
