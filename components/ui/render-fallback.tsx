import type { StructuredResponse } from '@/lib/ai/response-schema';

export const DEFAULT_RENDER_FALLBACK_MESSAGE =
  "I couldn't render that visual response. Please try again.";

export function getVisibleFallbackText(response: StructuredResponse): string {
  const spokenSummary = response.voice?.spokenSummary?.trim();
  if (spokenSummary) return spokenSummary;

  const text = response.text?.trim();
  if (text) return text;

  return DEFAULT_RENDER_FALLBACK_MESSAGE;
}

export function RenderFallback({ message }: { message: string }) {
  return (
    <div className="border-warning/20 bg-warning/[0.06] text-text-primary overflow-hidden rounded-2xl border px-4 py-3.5 backdrop-blur-sm sm:px-5 sm:py-4">
      <p className="text-sm leading-relaxed sm:text-base">{message}</p>
    </div>
  );
}
