/**
 * Lumen's inspection was simulated against EventRegistry on Agung (chain id 9990).
 * The call reverts with empty data for both the operator and Lumen-04.
 * No transaction was submitted, so there is no receipt hash.
 */
export const ACTIVITY_STATUS: {
  ok: boolean;
  hash: string | null;
  label: string;
  error: string;
} = {
  ok: false,
  hash: null,
  label: "Lumen activity event",
  error: "Did not land. Agung EventRegistry reverts Lumen's inspection. No receipt hash.",
};
