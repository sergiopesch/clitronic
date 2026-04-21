/**
 * Dependency-injection seam for the OpenAI chat-completions client.
 *
 * The route handler calls `getChatClient()` to obtain a minimal client that
 * exposes only the shape we actually use:
 *
 *   client.chat.completions.create(body, options)
 *
 * Production code ignores this module's test hooks and gets a lazily
 * constructed real OpenAI client. Tests call `setChatClientForTests(fake)`
 * to inject a fake that records calls and returns canned responses, without
 * needing to network out or hold an API key.
 *
 * This file intentionally has no behavioral knowledge -- it is a pure
 * factory. All policy (timeouts, prompts, rate limits) lives in route.ts.
 */
import OpenAI from 'openai';

type ChatCompletionsCreate = OpenAI['chat']['completions']['create'];

export type ChatCompletionClient = {
  chat: {
    completions: {
      create: ChatCompletionsCreate;
    };
  };
};

let _realClient: OpenAI | null = null;
let _override: ChatCompletionClient | null = null;

export function getChatClient(): ChatCompletionClient {
  if (_override) return _override;
  if (!_realClient) _realClient = new OpenAI();
  return _realClient;
}

/**
 * Test hook: inject a fake chat client. Pass `null` to clear.
 *
 * The double-underscore prefix signals that production code MUST NOT call
 * this. In a stricter codebase we'd split it into a separate entrypoint to
 * keep the prod bundle clean; for this repo's size, a naming convention is
 * enough and we verified no prod callsite reaches for it.
 */
export function __setChatClientForTests(client: ChatCompletionClient | null): void {
  _override = client;
}
