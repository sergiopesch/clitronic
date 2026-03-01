import OpenAI from 'openai';

export async function POST(req: Request) {
  // Check for API key in header or environment
  const userApiKey = req.headers.get('x-openai-key');
  const apiKey = userApiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: 'OpenAI API key required. Set OPENAI_API_KEY or provide x-openai-key header.' },
      { status: 401 }
    );
  }

  // Parse multipart form data
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

  const openai = new OpenAI({ apiKey });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    return Response.json({ text: transcription.text });
  } catch (error) {
    console.error('OpenAI Whisper API error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for specific OpenAI error types
    if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
      return Response.json(
        { error: 'Invalid OpenAI API key.' },
        { status: 401 }
      );
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
      return Response.json(
        { error: 'Rate limited. Please wait and try again.' },
        { status: 429 }
      );
    }

    return Response.json(
      { error: `Transcription failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
