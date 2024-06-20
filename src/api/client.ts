/**
 * This is the common entry point for end users.
 * A class with exhibits all Dune API properties and extensions.
 * Specifically, this class is a composition of QueryAPI, ExecutionAPI
 * and also contains implementations of runQuery[CSV], getLatestResults[CSV]
 */
import * as fs from "fs/promises";
import {
  DuneError,
  ResultsResponse,
  ExecutionState,
  QueryParameter,
  GetStatusResponse,
  ExecutionResponseCSV,
  ExecutionParams,
  RunQueryArgs,
  RunSqlArgs,
} from "../types";
import { sleep } from "../utils";
import log from "loglevel";
import { logPrefix } from "../utils";
import { ExecutionAPI } from "./execution";
import { POLL_FREQUENCY_SECONDS } from "../constants";
import { QueryAPI } from "./query";
import { TableAPI } from "./table";
import { CustomAPI } from "./custom";

/// Various states of query execution that are "terminal".
const TERMINAL_STATES = [
  ExecutionState.CANCELLED,
  ExecutionState.COMPLETED,
  ExecutionState.FAILED,
  ExecutionState.EXPIRED,
];

/**
 * The primary interface for devs to utilize
 * full functionality of the Dune API.
 */
export class DuneClient {
  /// Execution Interface.
  exec: ExecutionAPI;
  /// Query Management Interface.
  query: QueryAPI;
  /// Table Management Interface
  table: TableAPI;
  /// Custom Endpoint Interface
  custom: CustomAPI;

  /**
   * Constructor for the DuneClient.
   *
   * @param {string} apiKey
   * @returns Execution Results
   */
  constructor(apiKey: string) {
    this.exec = new ExecutionAPI(apiKey);
    this.query = new QueryAPI(apiKey);
    this.table = new TableAPI(apiKey);
    this.custom = new CustomAPI(apiKey);
  }

  /**
   * Runs an existing query by ID via execute, await, return results.
   *
   * @param {RunQueryArgs} args
   * @returns Execution Results
   */
  async runQuery(args: RunQueryArgs): Promise<ResultsResponse> {
    const { queryId, opts } = args;
    args.limit = opts?.batchSize || args.limit;
    const { state, execution_id } = await this.refreshResults(
      queryId,
      args,
      opts?.pingFrequency,
    );
    if (state === ExecutionState.COMPLETED) {
      const result = await this.getLatestResult(args);
      if (result.execution_id !== execution_id) {
        throw new DuneError(
          `invalid execution ID: expected ${execution_id}, got ${result.execution_id}`,
        );
      }
      return result;
    } else {
      const message = `refresh (execution ${execution_id}) yields incomplete terminal state ${state}`;
      // TODO - log the error in constructor
      log.error(logPrefix, message);
      throw new DuneError(message);
    }
  }

  /**
   * Runs an existing query by ID via execute, await, return Result CSV.
   *
   * @param {RunQueryArgs} args
   * @returns Execution Results as CSV
   */
  async runQueryCSV(args: RunQueryArgs): Promise<ExecutionResponseCSV> {
    const { queryId, opts } = args;
    args.limit = opts?.batchSize || args.limit;
    const { state, execution_id } = await this.refreshResults(
      queryId,
      args,
      opts?.pingFrequency,
    );
    if (state === ExecutionState.COMPLETED) {
      // we can't assert that the execution ids agree here!
      return this.exec.getLastResultCSV(queryId, args);
    } else {
      const message = `refresh (execution ${execution_id}) yields incomplete terminal state ${state}`;
      // TODO - log the error in constructor
      log.error(logPrefix, message);
      throw new DuneError(message);
    }
  }

  /**
   * Goes a bit beyond the internal call which returns that last execution results.
   * Here contains additional logic to refresh the results if they are too old.
   *
   * @param {RunQueryArgs} args
   * @returns Latest execution results for the given parameters.
   */
  async getLatestResult(args: RunQueryArgs): Promise<ResultsResponse> {
    const { queryId, opts } = args;
    args.limit = opts?.batchSize || args.limit;
    const lastestResults = await this.exec.getLastExecutionResults(
      queryId,
      args,
      opts?.maxAgeHours,
    );
    let results: ResultsResponse;
    if (lastestResults.isExpired) {
      log.info(logPrefix, `results expired, re-running query.`);
      results = await this.runQuery(args);
    } else {
      results = lastestResults.results;
    }
    return results;
  }

  /**
   * Get the lastest execution results in CSV format and saves to disk.
   *
   * @param {RunQueryArgs} args
   * @param outFile - location to save CSV.
   */
  async downloadCSV(args: RunQueryArgs, outFile: string): Promise<void> {
    const { queryId, opts } = args;
    args.limit = opts?.batchSize || args.limit;
    const { isExpired } = await this.exec.getLastExecutionResults(
      queryId,
      args,
      args.opts?.maxAgeHours,
    );
    let results: Promise<ExecutionResponseCSV>;
    if (isExpired) {
      results = this.runQueryCSV(args);
    } else {
      // TODO (user cost savings): transform the lastResults into CSV instead of refetching
      results = this.exec.getLastResultCSV(args.queryId, args);
    }
    // Wait for the results promise to resolve and then write the CSV data to the specified outFile
    const csvData = (await results).data;
    await fs.writeFile(outFile, csvData, "utf8");
    log.info(`CSV data has been saved to ${outFile}`);
  }

  /**
   * Allows user to provide execute raw_sql via the CRUD interface
   * - create, run, get results with optional archive/delete.
   * - Query is by default made private and archived after execution.
   * Requires Plus subscription!
   *
   * @returns {Promise<ResultsResponse>}
   */
  public async runSql(args: RunSqlArgs): Promise<ResultsResponse> {
    const { name, query_sql, isPrivate, query_parameters, archiveAfter } = args;
    const queryId = await this.query.createQuery({
      name: name ? name : "API Query",
      query_sql,
      query_parameters,
      is_private: isPrivate,
    });
    let results: ResultsResponse;

    try {
      results = await this.runQuery({ queryId, ...args });
    } finally {
      if (archiveAfter) {
        this.query.archiveQuery(queryId);
      }
    }

    return results;
  }

  /**
   * Executes query with provided parameters, checking every `pingFrequency`
   * seconds until execution status reaches a terminal state.
   * @param queryId
   * @param params
   * @param pingFrequency
   * @returns
   */
  async refreshResults(
    queryId: number,
    params?: ExecutionParams,
    pingFrequency: number = POLL_FREQUENCY_SECONDS,
  ): Promise<GetStatusResponse> {
    log.info(
      logPrefix,
      `refreshing query https://dune.com/queries/${queryId} with parameters ${JSON.stringify(
        params,
      )}`,
    );
    const { execution_id } = await this.exec.executeQuery(queryId, params);
    let status = await this.exec.getExecutionStatus(execution_id);
    while (!TERMINAL_STATES.includes(status.state)) {
      log.info(
        logPrefix,
        `waiting for query execution ${execution_id} to complete: current state ${status.state}`,
      );
      await sleep(pingFrequency);
      status = await this.exec.getExecutionStatus(execution_id);
    }
    return status;
  }

  /**
   * @deprecated since version 0.0.2 Use runQuery
   */
  async refresh(
    queryID: number,
    parameters: QueryParameter[] = [],
    pingFrequency?: number,
  ): Promise<ResultsResponse> {
    return this.runQuery({
      queryId: queryID,
      query_parameters: parameters,
      opts: { pingFrequency },
    });
  }
}
