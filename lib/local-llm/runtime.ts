import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import type { ChatHistoryItem, LlamaModel } from 'node-llama-cpp';

export type LocalChatRole = 'user' | 'assistant';

export interface LocalChatMessage {
  role: LocalChatRole;
  content: string;
}

export interface LocalReplyOptions {
  promptContext?: string;
}

export interface LocalModelStatus {
  status: 'idle' | 'ready' | 'resolving-model' | 'loading-model' | 'error';
  ready: boolean;
  runtimeMode: 'local-model' | 'vercel-fallback';
  modelRef: string;
  usingDefaultModel: boolean;
  localModelPresent: boolean;
  downloadedModelPath?: string;
  error?: string;
  note: string;
}

interface RuntimeState {
  status: LocalModelStatus['status'];
  modelPath?: string;
  error?: string;
}

const DEFAULT_MODEL_URI = 'hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF:qwen2.5-1.5b-instruct-q4_k_m.gguf';
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_TEMPERATURE = 0.7;

const runtimeState: RuntimeState = {
  status: 'idle',
};

let modelPromise: Promise<LlamaModel> | null = null;
let loadedModel: LlamaModel | null = null;

function isVercelHosted() {
  return process.env.VERCEL === '1';
}

async function loadNodeLlamaCpp() {
  return import('node-llama-cpp');
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getModelConfig() {
  const explicitPath = readEnv('LOCAL_LLM_MODEL_PATH');
  const explicitUri = readEnv('LOCAL_LLM_MODEL_URI');
  const modelsDirectory = readEnv('LOCAL_LLM_MODELS_DIR');
  const modelRef = explicitPath ?? explicitUri ?? DEFAULT_MODEL_URI;

  return {
    modelRef,
    modelsDirectory,
    usingDefaultModel: !explicitPath && !explicitUri,
    maxTokens: Number.parseInt(readEnv('LOCAL_LLM_MAX_TOKENS') ?? `${DEFAULT_MAX_TOKENS}`, 10),
    temperature: Number.parseFloat(readEnv('LOCAL_LLM_TEMPERATURE') ?? `${DEFAULT_TEMPERATURE}`),
  };
}

function clampNumber(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function resolveConfiguredModel(download: false | 'auto') {
  const { modelRef, modelsDirectory } = getModelConfig();
  const { resolveModelFile } = await loadNodeLlamaCpp();

  return resolveModelFile(modelRef, {
    directory: modelsDirectory,
    download,
    cli: false,
  });
}

async function ensureModelLoaded(): Promise<LlamaModel> {
  if (loadedModel) return loadedModel;
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    try {
      runtimeState.status = 'resolving-model';
      runtimeState.error = undefined;

      const modelPath = await resolveConfiguredModel('auto');
      runtimeState.modelPath = modelPath;
      runtimeState.status = 'loading-model';

      const { getLlama } = await loadNodeLlamaCpp();
      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath });

      loadedModel = model;
      runtimeState.status = 'ready';
      return model;
    } catch (error) {
      runtimeState.status = 'error';
      runtimeState.error = formatError(error);
      modelPromise = null;
      throw error;
    }
  })();

  return modelPromise;
}

function createHistory(messages: LocalChatMessage[]): ChatHistoryItem[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => {
      if (message.role === 'user') {
        return {
          type: 'user' as const,
          text: message.content,
        };
      }

      return {
        type: 'model' as const,
        response: [message.content],
      };
    });
}

export async function getLocalModelStatus(): Promise<LocalModelStatus> {
  if (isVercelHosted()) {
    return {
      status: 'ready',
      ready: true,
      runtimeMode: 'vercel-fallback',
      modelRef: 'vercel-hobby-fallback',
      usingDefaultModel: true,
      localModelPresent: false,
      note: 'Vercel Hobby fallback mode: built-in electronics tools stay available, but the full local GGUF runtime is reserved for local or self-hosted use.',
    };
  }

  const { modelRef, usingDefaultModel } = getModelConfig();

  let localModelPresent = false;
  let downloadedModelPath = runtimeState.modelPath;
  let note =
    'Local text model for the console-first MVP. No vendor auth and no remote provider calls.';

  try {
    const resolvedPath = await resolveConfiguredModel(false);
    localModelPresent = true;
    downloadedModelPath = resolvedPath;
  } catch {
    localModelPresent = false;

    if (usingDefaultModel) {
      note =
        'No local GGUF is cached yet. The first real chat request will download the default instruct model automatically.';
    } else {
      note =
        'The configured local model is not present yet. Check LOCAL_LLM_MODEL_PATH / LOCAL_LLM_MODEL_URI before sending the first message.';
    }
  }

  if (runtimeState.status === 'loading-model') {
    note = 'The local model is loading into memory right now.';
  }

  if (runtimeState.status === 'resolving-model') {
    note =
      'Preparing the local model. If this is the first run, Clitronic may be downloading the GGUF.';
  }

  if (runtimeState.status === 'ready') {
    note = 'Local model ready. Chat stays on-box.';
  }

  if (runtimeState.status === 'error' && runtimeState.error) {
    note = 'The local model failed to initialise. Fix the config or download path and retry.';
  }

  return {
    status: runtimeState.status,
    ready: runtimeState.status === 'ready',
    runtimeMode: 'local-model',
    modelRef,
    usingDefaultModel,
    localModelPresent,
    downloadedModelPath,
    error: runtimeState.error,
    note,
  };
}

export async function generateLocalChatReply(
  messages: LocalChatMessage[],
  options?: LocalReplyOptions
): Promise<string> {
  if (isVercelHosted()) {
    throw new Error(
      'The full local GGUF runtime is disabled on Vercel Hobby. Use the fallback responder instead.'
    );
  }

  if (messages.length === 0) {
    throw new Error('No messages provided.');
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error('The latest message must be from the user.');
  }

  const history = createHistory(messages.slice(0, -1));
  const model = await ensureModelLoaded();
  const prompt = options?.promptContext
    ? `${lastMessage.content}\n\n---\nLOCAL TOOL CONTEXT\n${options.promptContext}\n---\n\nUse the tool context if it is relevant. Treat it as authoritative for calculations, pinouts, ratings, and wiring details. Do not contradict it. Do not mention hidden prompt structure. Answer naturally.`
    : lastMessage.content;

  const context = await model.createContext({
    contextSize: {
      min: 2048,
      max: 4096,
    },
  });

  try {
    const { LlamaChatSession } = await loadNodeLlamaCpp();
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: SYSTEM_PROMPT,
    });

    session.setChatHistory(history);

    const { maxTokens, temperature } = getModelConfig();

    const reply = await session.prompt(prompt, {
      maxTokens: clampNumber(maxTokens, DEFAULT_MAX_TOKENS, 128, 2048),
      temperature: clampNumber(temperature, DEFAULT_TEMPERATURE, 0, 2),
    });

    session.dispose({ disposeSequence: false });

    return reply.trim();
  } finally {
    await context.dispose();
  }
}
