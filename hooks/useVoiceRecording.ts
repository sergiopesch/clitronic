'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

interface UseVoiceRecordingOptions {
  /** API endpoint for speech-to-text (default: /api/speech-to-text) */
  endpoint?: string;
  /** Selected auth provider forwarded to the server */
  authProvider?: 'claude-code' | 'openai-codex' | null;
  /** Callback when transcription completes */
  onTranscription?: (text: string) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

interface UseVoiceRecordingReturn {
  /** Whether currently recording */
  isRecording: boolean;
  /** Whether transcription is in progress */
  isTranscribing: boolean;
  /** Current microphone permission state */
  permissionState: PermissionState;
  /** Whether voice recording is supported in this browser */
  isSupported: boolean;
  /** Start recording audio */
  startRecording: () => Promise<void>;
  /** Stop recording and send for transcription */
  stopRecording: () => Promise<void>;
}

/**
 * Hook for browser audio recording and speech-to-text transcription.
 * Uses MediaRecorder API with WebM/Opus format.
 */
export function useVoiceRecording({
  endpoint = '/api/speech-to-text',
  authProvider = null,
  onTranscription,
  onError,
}: UseVoiceRecordingOptions = {}): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>('prompt');
  const [isSupported, setIsSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Check browser support on mount
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined';

    setIsSupported(supported);

    if (!supported) {
      setPermissionState('unsupported');
      return;
    }

    // Check current permission state if available
    if (navigator.permissions && 'query' in navigator.permissions) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((result) => {
          setPermissionState(result.state as PermissionState);

          // Listen for permission changes
          result.onchange = () => {
            setPermissionState(result.state as PermissionState);
          };
        })
        .catch(() => {
          // Permissions API not available for microphone in some browsers
          setPermissionState('prompt');
        });
    }
  }, []);

  const getMimeType = useCallback((): string => {
    // Prefer WebM with Opus codec
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback - let browser choose
    return '';
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      onError?.('Voice recording is not supported in this browser');
      return;
    }

    if (isRecording) return;

    try {
      // Request microphone access with audio processing options
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;
      setPermissionState('granted');

      // Create MediaRecorder with preferred format
      const mimeType = getMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        onError?.('Recording failed');
        setIsRecording(false);
        cleanupStream();
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setPermissionState('denied');
          onError?.('Microphone permission denied');
        } else if (error.name === 'NotFoundError') {
          onError?.('No microphone found');
        } else {
          onError?.(`Microphone error: ${error.message}`);
        }
      } else {
        onError?.('Failed to start recording');
      }
    }
  }, [isSupported, isRecording, getMimeType, cleanupStream, onError]);

  const stopRecording = useCallback(async () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    const mediaRecorder = mediaRecorderRef.current;

    return new Promise<void>((resolve) => {
      mediaRecorder.onstop = async () => {
        setIsRecording(false);

        // Create audio blob from chunks
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        // Cleanup stream
        cleanupStream();

        // Skip if no audio data
        if (audioBlob.size === 0) {
          onError?.('No audio recorded');
          resolve();
          return;
        }

        // Send to transcription endpoint
        setIsTranscribing(true);

        try {
          const formData = new FormData();
          // Use appropriate file extension based on mime type
          const extension = mimeType.includes('webm') ? 'webm' : 'ogg';
          formData.append('audio', audioBlob, `recording.${extension}`);

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: authProvider ? { 'x-auth-provider': authProvider } : undefined,
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${response.status}`);
          }

          const data = await response.json();

          if (data.text) {
            onTranscription?.(data.text);
          } else {
            onError?.('No transcription received');
          }
        } catch (error) {
          onError?.(error instanceof Error ? error.message : 'Transcription failed');
        } finally {
          setIsTranscribing(false);
        }

        resolve();
      };

      // Stop recording
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      } else {
        // Already stopped, trigger onstop manually
        mediaRecorder.onstop?.(new Event('stop'));
      }
    });
  }, [isRecording, endpoint, authProvider, cleanupStream, onTranscription, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    isRecording,
    isTranscribing,
    permissionState,
    isSupported,
    startRecording,
    stopRecording,
  };
}
