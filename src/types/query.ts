import { QueryParameter } from "./queryParameter";

/**
 * Enriched structure representing all data constituting a DuneQuery.
 * Modeling the CRUD operation response for 'get_query'
 * https://docs.dune.com/api-reference/queries/endpoint/read#example-return
 */
export interface DuneQuery {
  /**
   * Description of the query.
   */
  description: string;
  /**
   * Indicates if the query is archived.
   * Note: This is as close as a user can get to deleting a query.
   */
  is_archived: boolean;
  /**
   * Indicates if the query is private.
   */
  is_private: boolean;
  /**
   * Indicates if the query is unsaved.
   */
  is_unsaved: boolean;
  /**
   * Name of the query.
   */
  name: string;
  /**
   * Dune user who owns the query.
   */
  owner: string;
  /**
   * Parameters with their names and default values.
   */
  parameters: QueryParameter[];
  /**
   * The query engine used to execute the query.
   */
  query_engine: string;
  /**
   * Unique identifier of the query.
   */
  query_id: number;
  /**
   * Raw SQL of the query.
   */
  query_sql: string;
  /**
   * Tags associated with the query.
   */
  tags: string[];
  /**
   * Version of the query.
   */
  version: number;
}
