export type ImageSource = 'brave' | 'wikimedia';

export interface ScoredImage {
  url: string;
  thumbnail?: string;
  attribution: string;
  source: ImageSource;
  score: number;
}

export interface ImageSearchResponse {
  url: string | null;
  thumbnail?: string;
  attribution?: string;
  source?: ImageSource;
  score?: number;
  confident: boolean;
  queryUsed?: string;
  images?: {
    url: string;
    thumbnail?: string;
    attribution?: string;
    source?: ImageSource;
  }[];
}

export type ImageIntent =
  | 'board'
  | 'sensor'
  | 'actuator'
  | 'passive'
  | 'tool'
  | 'connector'
  | 'power'
  | 'display'
  | 'chip'
  | 'generic';

export interface CuratedProfile {
  id: string;
  intent: ImageIntent;
  aliases: string[];
  preferredQuery: string;
  fallbackQuery?: string;
  relevanceTokens: string[];
}
