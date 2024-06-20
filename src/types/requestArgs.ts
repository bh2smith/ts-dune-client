import assert from "assert";
import { QueryParameter } from "./queryParameter";

/*
 * Optional parameters for query exection.
 */
export interface ExecutionParams {
  query_parameters?: QueryParameter[];
  performance?: QueryEngine;
}

/*
 * Choice of execution engine when executing query via API [default = medium]
 */
export enum QueryEngine {
  Medium = "medium",
  Large = "large",
}

/*
 *  Payload sent when uploading a CSV file to Dune.
 */
export type UploadCSVArgs = {
  table_name: string;
  data: string;
  description?: string;
  is_private?: boolean;
};

/*
 *  Payload sent upon requests to Dune API.
 */
export type RequestPayload =
  | GetResultParams
  | ExecuteQueryParams
  | UpdateQueryParams
  | CreateQueryParams
  | UploadCSVArgs
  | CreateTableArgs
  | InsertTableArgs
  | Buffer;

/*
 * Utility method used by router to parse request payloads.
 */
export function payloadJSON(payload?: RequestPayload): string {
  return JSON.stringify(payloadRecords(payload));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payloadRecords(payload?: RequestPayload): Record<string, any> {
  if (payload !== undefined) {
    if ("query_parameters" in payload) {
      // Destructure to separate parameters and the rest of the payload
      const { query_parameters, ...rest } = payload;
      return {
        ...rest,
        query_parameters: query_parameters
          ? QueryParameter.unravel(query_parameters)
          : [],
      };
    }
    return payload;
  }
  return {};
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO - this is a "dirty" hack to trick the compiler into thinking the types are well defined.
interface IntermediaryRequestPayload {
  query_parameters?: Array<{ name: string; value: any }>;
  [key: string]: any; // This is the index signature
}

/**
 * Converts all arguments into a format
 * which can be converted into a URL path for GET requests.
 */
export function payloadSearchParams(payload?: RequestPayload): Record<string, any> {
  if (payload !== undefined) {
    const intermPayload = payload as IntermediaryRequestPayload;
    if ("query_parameters" in payload) {
      // Destructure to separate parameters and the rest of the payload
      const { query_parameters, ...rest } = intermPayload;
      // Remove all undefined keys from payload.
      const result: Record<string, any> = Object.keys(rest).reduce(
        (acc, key) => {
          if (rest[key] !== undefined) {
            acc[key] = rest[key];
          }
          return acc;
        },
        {} as Record<string, any>,
      );

      // Modify query parameter to satisfy API formating requirements.
      if (Array.isArray(payload.query_parameters)) {
        for (const qp of payload.query_parameters) {
          result[`params.${qp.name}`] = qp.value;
        }
      }
      return result;
    }
    return payload;
  }
  return {};
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface BaseParams {
  query_parameters?: QueryParameter[];
}

export interface GetResultParams extends BaseParams {
  /*
   * Limit number of rows to return.
   * This together with 'offset' allows easy pagination through results in an incremental and efficient way.
   * This parameter is incompatible with sampling (`sample_count`).
   */
  limit?: number;
  /*
   * Offset row number to start (inclusive, first row means offset=0) returning results from.
   * This together with 'limit' allows easy pagination through results.
   * This parameter is incompatible with sampling (`sample_count`).
   */
  offset?: number;
  /*
   * Number of rows to return from the result by sampling the data.
   * This is useful when you want to get a uniform sample instead of the entire result.
   * If the result has less than the sample count, the entire result is returned.
   * Note that this will return a randomized sample, so not every call will return the same result.
   * This parameter is incompatible with `offset`, `limit`, and `filters` parameters.
   */
  sample_count?: number;
  /*
   * Expression to filter out rows from the results to return.
   * This expression is similar to a SQL WHERE clause.
   * More details about it in the [Filtering](https://docs.dune.com/api-reference/executions/filtering) section of the doc.
   * This parameter is incompatible with `sample_count`.
   */
  filters?: string;
  /*
   * Expression to define the order in which the results should be returned.
   * This expression is similar to a SQL ORDER BY clause.
   * More details about it in the [Sorting](https://docs.dune.com/api-reference/executions/sorting) section of the doc.
   */
  sort_by?: string[] | string;
  /*
   * Specified columns to be returned. If omitted, all columns are included.
   * Tip: use this to limit the result to specific columns, reducing datapoints cost of the call.
   */
  columns?: string[] | string;
}

/**
 * Custom API parameters for creating and managing custom endpoints.
 * Extends GetResultParams but omits 'query_parameters'.
 *
 * @extends {Omit<GetResultParams, "query_parameters">}
 */
export interface CustomAPIParams extends Omit<GetResultParams, "query_parameters"> {
  /**
   * The team or user handle owning the custom endpoint.
   */
  handle: string;
  /**
   * Custom endpoint slug.
   */
  slug: string;
}

export function validateAndBuildGetResultParams({
  limit,
  offset,
  sample_count,
  filters,
  sort_by,
  columns,
  query_parameters,
}: GetResultParams): GetResultParams {
  assert(
    sample_count === undefined ||
      (limit === undefined && offset === undefined && filters === undefined),
    "sampling cannot be combined with filters or pagination",
  );
  if (columns !== undefined) {
    if (typeof columns === "string") {
      columns = columns.split(",");
    }
    const output: string[] = columns.map((column) => {
      // Check if the column contains quotes
      if (column.includes('"')) {
        // Escape quotes and add quotes around the entire string
        return `"${column.replace(/"/g, '\\"')}"`;
      } else {
        // Leave the column unchanged
        return column;
      }
    });

    columns = output.join(",");
  }
  if (sort_by !== undefined && Array.isArray(sort_by)) {
    sort_by = sort_by.join(",");
  }
  query_parameters = query_parameters || [];
  return {
    // It used to be the case that limit was required,
    // but now that they have introduced some other filters that
    // are incompatible with this field, it is no longer required.
    // It is becomes required again later, we will need to use withDefaults here.
    limit,
    offset,
    sample_count,
    filters,
    sort_by,
    columns,
    query_parameters,
  };
}

export interface ExecuteQueryParams extends BaseParams {
  /* The performance engine tier the execution will be run on.
   * Can be either medium or large.
   * Medium consumes 10 credits, and large consumes 20 credits, per run.
   * Default is medium.
   */
  performance: QueryEngine;
}

export interface BaseCRUDParams extends BaseParams {
  /**
   * Description of the query.
   */
  description?: string;
  /**
   * Name of the query.
   */
  name?: string;
  /**
   * The SQL query text.
   */
  query_sql: string;
}

/**
 * Payload sent with query update requests.
 */
export interface UpdateQueryParams extends BaseCRUDParams {
  /// Tags to be added (overrides existing tags).
  tags?: string[];
}

/*
 * Payload sent with query creation requests.
 */
export interface CreateQueryParams extends BaseCRUDParams {
  /// Indicates if the query is private.
  is_private?: boolean;
}

export enum ColumnType {
  Varchar = "varchar",
  Integer = "integer",
  Double = "double",
  Boolean = "boolean",
  Timestamp = "timestamp",
}

export interface SchemaRecord {
  /*
   * The column name. Can contain letters, numbers, and underscores,
   * but must begin with a letter or an underscore.
   */
  name: string;
  /*
   * The column type.
   */
  type: ColumnType;
}

export interface DeleteTableArgs {
  /*
   * The namespace of the table to delete (e.g. my_user).
   */
  namespace: string;
  /*
   * The name of the table to delete (e.g. interest_rates).
   */
  table_name: string;
}

export interface CreateTableArgs {
  /*
   * A description of the table.
   */
  description?: string;
  /*
   * If true, the table will be private.
   * If private it is only visible to the team or user that your API key is associated with.
   */
  is_private?: boolean;
  /*
   * The namespace of the table to create.
   * Must be the name of your associated API key, i.e. either `my_user` or `my_team`.
   */
  namespace: string;
  /*
   * An ordered list of columns that define the table schema. Cannot be empty.
   */
  schema: SchemaRecord[];
  /*
   * The name of the table to create.
   * Must begin with a lowercase letter and contain only lowercase letters,
   * digits, and underscores.
   */
  table_name: string;
}

/**
 * All supported API content types
 */
export enum ContentType {
  Json = "application/json",
  Csv = "text/csv",
  NDJson = "application/x-ndjson",
}

export interface InsertTableArgs {
  /*
   * The namespace of the table to insert into (e.g. `my_user`).
   */
  namespace: string;
  /*
   * The name of the table to insert into (e.g. `interest_rates`).
   */
  table_name: string;
  /*
   * The body is of type file.
   */
  data: Buffer;
  content_type: ContentType;
}

export interface Options {
  /*
   * The page size when retriving results.
   */
  batchSize?: number;
  /*
   * How frequently should we check execution status
   */
  pingFrequency?: number;
  /*
   * Determines result expiry date.
   */
  maxAgeHours?: number;
}

export interface RunQueryArgs extends GetResultParams, ExecutionParams {
  /*
   * ID of the query.
   */
  queryId: number;
  opts?: Options;
}

export interface LatestResultArgs {
  /*
   * ID of the query.
   */
  queryId: number;
  parameters?: QueryParameter[];
  opts?: Options;
}

export interface RunSqlArgs extends ExecutionParams {
  /*
   * raw sql of query to run (Trino/DuneSQL syntax)
   */
  query_sql: string;
  /*
   * Name of created query.
   */
  name?: string;
  /*
   * Whether the created query should be private or not (default = true).
   */
  isPrivate?: boolean;
  /*
   * Whether the created query should be archived immediately after execution or not (default = true).
   */
  archiveAfter?: boolean;
  /*
   * Additional options execution options.
   */
  opts?: Options;
}
