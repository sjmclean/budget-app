export async function runAccountRegisterSqliteMutation(
  action: () => Promise<void>,
  reportError: (message: string) => void,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    reportError(
      error instanceof Error
        ? error.message
        : "Failed to update SQLite register.",
    );
    throw error;
  }
}
