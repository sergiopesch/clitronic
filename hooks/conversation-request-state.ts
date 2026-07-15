export function isActiveRequest(
  current: AbortController | null,
  candidate: AbortController
): boolean {
  return current === candidate && !candidate.signal.aborted;
}

export function resolveDraftAfterSubmission(
  currentDraft: string,
  submittedText: string,
  succeeded: boolean
): string {
  return succeeded && currentDraft === submittedText ? '' : currentDraft;
}

export function selectRecentAssistantIndexes(
  assistantIndexes: number[],
  displayedAssistantIndex: number | null,
  limit = 2
): number[] {
  return assistantIndexes
    .filter((index) => index !== displayedAssistantIndex)
    .slice(-Math.max(0, limit));
}
