export function calculateAvailable(
  previousAvailable: number,
  assigned: number,
  activity: number,
): number {
  return previousAvailable + assigned + activity;
}
