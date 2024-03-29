export const logPrefix = "dune-client:";

/**
 * utility sleep method.
 * @param seconds number of seconds to sleep for.
 * @returns void
 */
export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Computes the difference between a given timestamp and now (in hours)
 * @param timestamp
 * @returns time difference between input `timestamp` and now (in hours)
 */
export function ageInHours(timestamp: Date | string): number {
  // Get the current date and time
  const now: Date = new Date();
  // Given date time:
  const time = new Date(timestamp);
  // Calculate the difference in milliseconds
  const resultAge: number = now.getTime() - time.getTime();
  // Convert milliseconds to hours and return
  return resultAge / (1000 * 60 * 60);
}

/**
 *
 * @param obj Used to populate partial payloads with required defaults
 * @param defaults
 * @returns
 */
export function withDefaults<T>(obj: T, defaults: Partial<T>): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = { ...obj };
  for (const key in defaults) {
    if (result[key] === undefined) {
      result[key] = defaults[key];
    }
  }
  return result as T;
}
