export interface ResolvedPayeeReference {
  id: string;
  name: string;
}

export interface PayeeSubmissionReference {
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
}

export type PayeeSubmissionResolver = (
  name: string,
) => Promise<ResolvedPayeeReference>;

function isTransferPayee(input: PayeeSubmissionReference): boolean {
  return (
    Boolean(input.transferAccountId) ||
    input.payee.trim().toLocaleLowerCase().startsWith("transfer:")
  );
}

export async function resolvePayeeForSubmission<
  T extends PayeeSubmissionReference,
>(
  input: T,
  resolvePayee?: PayeeSubmissionResolver,
): Promise<T> {
  if (
    input.payeeId ||
    isTransferPayee(input) ||
    !input.payee.trim() ||
    !resolvePayee
  ) {
    return input;
  }

  const resolved = await resolvePayee(input.payee);

  return {
    ...input,
    payee: resolved.name,
    payeeId: resolved.id,
  };
}
