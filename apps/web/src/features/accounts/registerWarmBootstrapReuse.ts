/** Whether the initial Register load can use its already-applied local snapshot. */
export function canReuseCurrentRegisterBootstrap(input: {
  hasLoadedData: boolean;
  hasSqlitePage: boolean;
  claimedWarmKey: string | null;
  currentQueryKey: string;
  appliedRevision: number;
  currentRevision: number;
}): boolean {
  return input.hasLoadedData &&
    input.hasSqlitePage &&
    input.claimedWarmKey === input.currentQueryKey &&
    input.appliedRevision === input.currentRevision;
}
