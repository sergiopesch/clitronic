import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_REALTIME_SESSIONS_URL = 'https://api.openai.com/v1/realtime/sessions';
const SESSION_REQUEST_TIMEOUT_MS = 12000;

const REALTIME_SESSION_CONFIG = {
  model: 'gpt-4o-realtime-preview',
  modalities: ['text', 'audio'],
  voice: 'alloy',
  output_audio_format: 'pcm16',
  instructions:
    'You are Clitronic, a voice-first electronics assistant. Always understand and respond in English only. Keep replies concise and practical.',
  turn_detection: {
    type: 'server_vad',
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 550,
    create_response: true,
    interrupt_response: true,
  },
  input_audio_transcription: {
    model: 'gpt-4o-mini-transcribe',
    language: 'en',
  },
};

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(OPENAI_REALTIME_SESSIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: JSON.stringify(REALTIME_SESSION_CONFIG),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to create realtime session: ${text}` },
        { status: response.status }
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Realtime session request failed: ${error.message}`
            : 'Realtime session request failed.',
      },
      { status: 500 }
    );
  }
}
