export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TranscriptMeta {
  raw?: string;
  cleaned?: string;
}

export interface ChatRequestBody {
  messages?: unknown;
  inputMode?: 'text' | 'voice';
  transcriptMeta?: TranscriptMeta;
}
