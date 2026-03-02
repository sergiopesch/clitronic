import OpenAI from 'openai';
import { resolveOpenAIAuth } from '@/lib/auth/server-auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let authToken: string;
  try {
    const resolved = await resolveOpenAIAuth(req.headers.get('x-openai-key'));
    authToken = resolved.token;
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'OpenAI authentication unavailable. Connect OpenAI Codex or configure server credentials.',
      },
      { status: 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json(
      { error: 'Invalid form data. Expected multipart/form-data.' },
      { status: 400 }
    );
  }

  const audioFile = formData.get('audio');
  if (!audioFile || !(audioFile instanceof File)) {
    return Response.json(
      { error: 'No audio file provided. Include an "audio" field in form data.' },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey: authToken });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    return Response.json({ text: transcription.text });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
      return Response.json(
        { error: 'OpenAI authentication failed. Reconnect OpenAI Codex and retry.' },
        { status: 401 }
      );
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
      return Response.json({ error: 'Rate limited. Please wait and try again.' }, { status: 429 });
    }

    return Response.json({ error: `Transcription failed: ${errorMessage}` }, { status: 500 });
  }
}
