import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POST as chatPost } from '@/app/api/chat/route';
import { validateStructuredResponse } from '@/app/api/chat/response-validator';
import { searchImages } from '@/app/api/image-search/service';
import type { ImageSearchResponse } from '@/app/api/image-search/types';
import type { StructuredResponse } from '@/lib/ai/response-schema';

type EvalTask = {
  id: string;
  category: string;
  persona: string;
  prompt: string;
  expected_ui_components: string[];
  expected_answer_traits: string[];
  expected_image_traits: string[];
  must_include: string[];
  should_avoid: string[];
  safety_notes: string[];
};

type HarnessOutput = {
  task: EvalTask;
  chatInvocation: {
    method: 'direct-route-handler';
    routePath: string;
    requestShape: string;
  };
  imageSearchInvocation?: {
    method: 'service';
    servicePath: string;
    query: string;
    requestedCount: number;
  };
  status: number;
  schemaValid: boolean;
  response: unknown;
  imageSearch?: ImageSearchResponse & { candidateCount: number };
  timingsMs: {
    chat: number;
    imageSearch?: number;
  };
  error?: string;
};

const runDir = process.env.AUTORESEARCH_RUN_DIR;
if (!runDir) {
  throw new Error('AUTORESEARCH_RUN_DIR is required.');
}

const evalPath = 'autoresearch/evals/clitronic_expert_tasks.jsonl';
const outputsPath = join(runDir, 'outputs.jsonl');
mkdirSync(runDir, { recursive: true });
writeFileSync(outputsPath, '');

const tasks = readFileSync(evalPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line) as EvalTask);

function appendOutput(output: HarnessOutput) {
  writeFileSync(outputsPath, `${JSON.stringify(output)}\n`, { flag: 'a' });
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: text.slice(0, 1000) };
  }
}

function getImageData(response: StructuredResponse | null) {
  if (response?.mode !== 'ui') return null;
  if (response.ui?.component !== 'imageBlock') return null;
  if (response.ui.data.imageMode !== 'photo') return null;
  if (!response.ui.data.searchQuery) return null;
  return response.ui.data;
}

async function main() {
  for (const [index, task] of tasks.entries()) {
    const chatStarted = Date.now();
    const baseOutput: HarnessOutput = {
      task,
      chatInvocation: {
        method: 'direct-route-handler',
        routePath: 'app/api/chat/route.ts POST',
        requestShape: '{ messages: [{ role: "user", content }], inputMode: "text" }',
      },
      status: 0,
      schemaValid: false,
      response: null,
      timingsMs: { chat: 0 },
    };

    try {
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': `127.200.0.${(index % 240) + 1}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: task.prompt }],
          inputMode: 'text',
        }),
      });

      const chatResponse = await chatPost(request);
      const payload = await readJsonResponse(chatResponse);
      const validated = validateStructuredResponse(payload);
      baseOutput.status = chatResponse.status;
      baseOutput.schemaValid = Boolean(validated);
      baseOutput.response = payload;
      baseOutput.timingsMs.chat = Date.now() - chatStarted;

      const imageData = getImageData(validated);
      if (imageData) {
        const searchQuery = imageData.searchQuery;
        if (searchQuery) {
          const requestedCount = Math.min(Math.max(Math.floor(imageData.imageCount ?? 1), 1), 6);
          const imageStarted = Date.now();
          baseOutput.imageSearchInvocation = {
            method: 'service',
            servicePath: 'app/api/image-search/service.ts searchImages',
            query: searchQuery,
            requestedCount,
          };
          const imageSearch = await searchImages({
            query: searchQuery,
            caption: imageData.caption,
            description: imageData.description,
            requestedCount,
            braveKey: process.env.BRAVE_API_KEY,
          });
          baseOutput.imageSearch = {
            ...imageSearch,
            candidateCount: imageSearch.images?.length ?? (imageSearch.url ? 1 : 0),
          };
          baseOutput.timingsMs.imageSearch = Date.now() - imageStarted;
        }
      }
    } catch (error) {
      baseOutput.timingsMs.chat = Date.now() - chatStarted;
      baseOutput.error = error instanceof Error ? error.message : String(error);
    }

    appendOutput(baseOutput);
  }

  console.log(`Wrote ${tasks.length} eval outputs to ${outputsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
