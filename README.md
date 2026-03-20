# Clitronic

**Console-first local electronics chat MVP**

Clitronic is now focused on the simplest thing worth validating first:

> can a local open-source model hold a genuinely useful electronics conversation inside a console-first interface?

This refactor deliberately removes provider auth and the workbench-first default flow from the main route. The goal is to test the core interaction loop before rebuilding tools, voice, image analysis, and richer workspace behaviour on top.

## What this version does

- opens into a **console-first local chat UI**
- runs against a **local in-process model runtime** via `node-llama-cpp`
- avoids **remote vendor model calls**
- avoids **provider auth** in the main user flow
- includes a **first local tool layer** for resistor calculation and component lookup
- keeps the MVP **text-only and honest**

## What this version does not do yet

Right now the default route does **not** attempt to provide:

- image understanding
- voice input
- workbench / topology / graph windows
- broad tool execution beyond the first local calculation / lookup helpers
- provider switching / auth flows

Those can return later, one by one, once the local conversation loop is solid.

## Local model behaviour

Clitronic loads a GGUF model locally using `node-llama-cpp`.

### Default model

If you do not configure anything, Clitronic defaults to:

```text
hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF:qwen2.5-1.5b-instruct-q4_k_m.gguf
```

That is a **small but more credible default** than the ultra-tiny variants, so the local MVP stays fast enough to boot while still being useful for real conversation.

### First run

On the first real chat request, if the model is not cached yet, Clitronic will try to download it into the `node-llama-cpp` model cache (global by default, unless you override the cache directory).

That means:

- the **very first prompt can take longer**
- later prompts should be much faster
- you can replace the default with a larger or better GGUF as soon as you want

## Configuration

Copy the env file:

```bash
cp .env.example .env.local
```

Available settings:

```bash
# direct file path
LOCAL_LLM_MODEL_PATH=/absolute/path/to/model.gguf

# or auto-resolved model URI
LOCAL_LLM_MODEL_URI=hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF:qwen2.5-1.5b-instruct-q4_k_m.gguf

# optional model cache directory
LOCAL_LLM_MODELS_DIR=/absolute/path/to/model-cache

# optional generation controls
LOCAL_LLM_MAX_TOKENS=512
LOCAL_LLM_TEMPERATURE=0.7
```

## Quick start

```bash
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If no GGUF is cached yet, the app will tell you. The first real message may trigger the model download.

## Development

```bash
npm run dev
npm run build
npm run validate
```

## Current architecture

```text
clitronic/
├── app/
│   ├── api/
│   │   └── chat/            # local model status + local chat endpoint
│   ├── layout.tsx           # app shell metadata
│   └── page.tsx             # console-first local chat route
├── components/
│   └── console/             # local console UI
├── lib/
│   ├── ai/                  # prompt and response posture
│   └── local-llm/           # node-llama-cpp runtime wiring
└── cli/                     # legacy CLI package, still available separately
```

## Direction after this pass

The likely next sequence is:

1. keep improving local chat quality
2. add a minimal tool layer with explicit invocation rules
3. reintroduce structured circuit actions one by one
4. bring the workbench back only when it is grounded in real state

## Tech stack

- **Web**: Next.js 16, React 19, Tailwind CSS
- **Local inference**: `node-llama-cpp`
- **Rendering**: React Markdown + remark-gfm

## License

MIT
