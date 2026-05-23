import { Tool, ToolResult } from '../core/types.js';

export function createWeatherTool(): Tool {
  return {
    name: 'Weather',
    description: 'Get current weather and forecast for a city. Use this when the user asks about weather, temperature, or forecast.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name in English or Chinese (e.g., "Shenyang", "沈阳", "Beijing", "上海").',
        },
        days: {
          type: 'number',
          description: 'Optional. Number of forecast days (0 = today only, max 3). Default 0.',
        },
      },
      required: ['city'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const city = String(args.city || '');
      const days = Math.min(3, Math.max(0, typeof args.days === 'number' ? args.days : 0));

      if (!city) {
        return { success: false, output: '', error: 'Missing "city" argument.' };
      }

      const now = new Date();
      const todayStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

      try {
        // wttr.in provides free weather data without API key
        const format = days > 0
          ? `%C|%t|%h|%w|%P|%D|%d`
          : `%l:+%C+|+Temperature:+%t+|+Humidity:+%h+|+Wind:+%w+|+Pressure:+%P`;

        const url = `https://wttr.in/${encodeURIComponent(city)}?format=${encodeURIComponent(format)}&lang=zh`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'curl/7.68.0',
          },
        });

        if (!response.ok) {
          return {
            success: false,
            output: '',
            error: `Weather API error: HTTP ${response.status}`,
          };
        }

        const text = await response.text();

        if (text.includes('Unknown location') || text.trim().length === 0) {
          return {
            success: false,
            output: '',
            error: `Could not find weather data for "${city}". Try the English city name.`,
          };
        }

        return {
          success: true,
          output: `Today's actual date: ${todayStr}\nWeather for ${city}:\n${text.trim()}`,
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
