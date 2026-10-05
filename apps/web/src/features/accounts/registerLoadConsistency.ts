export interface LoadRegisterAfterScheduledGenerationOptions {
  readonly generateScheduledTransactions: () => Promise<unknown>;
  readonly reloadRegister: () => Promise<void>;
  readonly onGenerationError?: (error: unknown) => void;
}

/**
 * Keep account summaries and register rows on the same persistence revision as
 * automatic scheduled-transaction processing.
 *
 * Scheduled generation is deliberately non-fatal for register navigation, but
 * the register read must not race it. Waiting for the generation attempt to
 * settle prevents a pre-generation balance/row snapshot from being rendered
 * after the scheduled mutations have committed.
 */
export async function loadRegisterAfterScheduledGeneration({
  generateScheduledTransactions,
  reloadRegister,
  onGenerationError,
}: LoadRegisterAfterScheduledGenerationOptions): Promise<void> {
  try {
    await generateScheduledTransactions();
  } catch (error) {
    onGenerationError?.(error);
  }

  await reloadRegister();
}
