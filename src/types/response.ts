/*
 * Various possible states of a query exeuction.
 */
export enum ExecutionState {
  COMPLETED = "QUERY_STATE_COMPLETED",
  EXECUTING = "QUERY_STATE_EXECUTING",
  PENDING = "QUERY_STATE_PENDING",
  CANCELLED = "QUERY_STATE_CANCELLED",
  FAILED = "QUERY_STATE_FAILED",
  EXPIRED = "QUERY_STATE_EXPIRED",
}

export interface ExecutionResponseCSV {
  data: string;
  next_uri: string | null;
  next_offset?: number;
}

export function concatResultCSV(
  left: ExecutionResponseCSV,
  right: ExecutionResponseCSV,
): ExecutionResponseCSV {
  left.next_uri = right.next_uri;
  left.next_offset = right.next_offset;

  // Trim last newline from the left and split both on newlines.
  const leftData = left.data.trimEnd().split("\n");
  const rightData = right.data.split("\n");
  // Remove the header column from right:
  rightData.shift();

  return {
    next_uri: right.next_uri,
    next_offset: right.next_offset,
    // Concatenate the two arrays and join them back into a single string
    data: leftData.concat(rightData).join("\n"),
  };
}

/*
 * Response resturned from query execution request.
 */
export interface ExecutionResponse {
  execution_id: string;
  state: ExecutionState;
}

/*
 * Response resturned from query creation request.
 */
export interface CreateQueryResponse {
  query_id: number;
}

export type SuccessResponse = {
  success: boolean;
};

/*
 * Various query times related to an query status request.
 */
export interface TimeData {
  submitted_at: Date;
  /*
   * Timestamp of when the query execution started.
   */
  execution_started_at?: Date;
  /*
   * Timestamp of when the query execution ended.
   */
  execution_ended_at?: Date;
  /*
   * Timestamp of when the query result expires.
   */
  expires_at?: Date;
  /*
   * Timestamp of when the query execution was cancelled, if applicable.
   */
  cancelled_at?: Date;
}

/*
 * Metadata contained within a quer `ExecutionResult`
 */
export interface ResultMetadata {
  /*
   * Names of the columns contained in the query results.
   */
  column_names: string[];
  /*
   * Total number of data points in result.
   * Used as part of the API credits computation.
   */
  datapoint_count: number;
  /*
   * Time in milliseconds that the query took to execute.
   */
  execution_time_millis: number;
  /*
   * How long they query was pending (in the queue) before execution began.
   */
  pending_time_millis: number;
  /*
   * Number of bytes in the result set for the current page of results.
   */
  result_set_bytes: number;
  /*
   * Number of rows in the result set for the current page of results.
   */
  row_count: number;
  /*
   * Total number of bytes in the result set. This doesn't include the json representation overhead.
   */
  total_result_set_bytes: number;
  /*
   * Total number of rows in the result set.
   */
  total_row_count: number;
}

/*
 * Status resonse fields contained in both Incomplete and Complete ExecutionStatus Responses.
 */
interface BaseStatusResponse extends TimeData {
  /*
   * Unique identifier for the execution of the query.
   */
  execution_id: string;
  /*
   * Unique identifier of the query.
   */
  query_id: number;
  queue_position?: number;
}

/*
 * Format of a `GetStatusResponse` when the query execution is anything but complete.
 */
interface IncompleteStatusResponse extends BaseStatusResponse {
  /*
   * The state of the query execution.
   */
  state: Exclude<ExecutionState, ExecutionState.COMPLETED>;
}

/*
 * Format of `GetStatusResponse` when a query execution has completed.
 */
interface CompleteStatusResponse extends BaseStatusResponse {
  /*
   *  The state of the query execution.
   */
  state: ExecutionState.COMPLETED;
  /*
   * Metadata about the execution of the query, including details like column names,
   * row counts, and execution times.
   */
  result_metadata: ResultMetadata;
}

export type GetStatusResponse = IncompleteStatusResponse | CompleteStatusResponse;

/*
 * Result of a Query Execution.
 */
export interface ExecutionResult {
  /*
   * A list of rows. A row is dictionary of key-value pairs returned by the query,
   * each pair corresponding to a column
   */
  rows: Record<string, unknown>[];
  /*
   * Metadata about the execution of the query, including details like column names,
   * row counts, and execution times.
   */
  metadata: ResultMetadata;
}

/*
 * Response of reqeust for results of a query execution.
 */
export interface ResultsResponse extends TimeData {
  /*
   * Unique identifier for the execution of the query.
   */
  execution_id: string;
  /*
   * Unique identifier of the query.
   */
  query_id: number;
  /*
   * Whether the state of the query execution is terminal. This can be used for polling purposes.
   */
  is_execution_finished: boolean;
  /*
   * Offset that can be used to retrieve the next page of results.
   */
  next_offset: number;
  /*
   * URI that can be used to fetch the next page of results.
   */
  next_uri: string;
  /*
   * The state of the query execution.
   */
  state: ExecutionState;
  /*
   * only present when state is COMPLETE
   */
  result?: ExecutionResult;
}

export interface LatestResultsResponse {
  results: ResultsResponse;
  isExpired?: boolean;
}

export function concatResultResponse(
  left: ResultsResponse,
  right: ResultsResponse,
): ResultsResponse {
  if (left.execution_id !== right.execution_id) {
    throw new Error(
      `Can't combine results: ExecutionIds (${left.execution_id} != ${right.execution_id})`,
    );
  } else if (left.result === undefined) {
    throw new Error(`Can't combine results: Left Entry has no results`);
  } else if (right.result === undefined) {
    throw new Error(`Can't combine results: Right Entry has no results`);
  }

  const { next_offset, next_uri, result: _, ...remainingValues } = right;
  return {
    next_uri,
    next_offset,
    result: concatResult(left.result!, right.result!),
    ...remainingValues,
  };
}

function concatResult(left: ExecutionResult, right: ExecutionResult): ExecutionResult {
  return {
    rows: [...left.rows, ...right.rows],
    metadata: concatResultMetadata(left.metadata, right.metadata),
  };
}

function concatResultMetadata(
  left: ResultMetadata,
  right?: ResultMetadata,
): ResultMetadata {
  if (right === undefined) {
    throw new Error("Can not concatenate with empty metadata");
  }
  const { row_count, result_set_bytes, datapoint_count, ...remainingValues } = right;
  return {
    row_count: left.row_count + row_count,
    result_set_bytes: left.result_set_bytes + result_set_bytes,
    datapoint_count: left.datapoint_count + datapoint_count,
    ...remainingValues,
  };
}

export interface DeleteTableResult {
  /*
   * The confirmation message of the deleted table
   */
  message: string;
}

export interface CreateTableResult {
  /*
   * An example query to use on Dune querying your new table.
   */
  example_query: string;
  /*
   * The full name of the created table, as it should be referred to in a query.
   */
  full_name: string;
  /*
   * The namespace of the created table.
   */
  namespace: string;
  /*
   * The name of the created table.
   */
  table_name: string;
}

export interface InsertTableResult {
  rows_written: number;
}
