import { GetResultParams } from "./types/requestArgs";

/*
 * Seconds between checking execution status
 */
export const POLL_FREQUENCY_SECONDS = 1;
/*
 * This is the expiry time on old query results.
 */
export const THREE_MONTHS_IN_HOURS = 2191;
/*
 * Headers used for pagination in CSV results
 */
export const DUNE_CSV_NEXT_URI_HEADER = "x-dune-next-uri";
export const DUNE_CSV_NEXT_OFFSET_HEADER = "x-dune-next-offset";
/*
 * Default maximum number of rows to retrieve per batch of results
 */
export const MAX_NUM_ROWS_PER_BATCH = 32_000;

export const DEFAULT_GET_PARAMS: GetResultParams = {
  query_parameters: [],
  limit: MAX_NUM_ROWS_PER_BATCH,
  offset: 0,
};
