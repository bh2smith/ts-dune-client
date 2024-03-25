import { expect } from "chai";
import { QueryParameter, ExecutionState, ExecutionAPI } from "../../src/";
import log from "loglevel";
import { ExecutionPerformance } from "../../src/types/requestPayload";
import { BASIC_KEY, expectAsyncThrow } from "./util";
import { sleep } from "../../src/utils";

log.setLevel("silent", true);

describe("ExecutionAPI: native routes", () => {
  let client: ExecutionAPI;
  let testQueryId: number;

  beforeEach(() => {
    client = new ExecutionAPI(BASIC_KEY);
    // https://dune.com/queries/1215383
    testQueryId = 1215383;
  });

  // This doesn't work if run too many times at once:
  // https://discord.com/channels/757637422384283659/1019910980634939433/1026840715701010473
  it("returns expected results on sequence execute-cancel-get_status", async () => {
    // Long running query ID.
    const queryID = 1229120;
    // Execute and check state
    const execution = await client.executeQuery(queryID);
    expect(execution.state).to.be.oneOf([
      ExecutionState.PENDING,
      ExecutionState.EXECUTING,
    ]);

    // Cancel execution and verify it was canceled.
    const canceled = await client.cancelExecution(execution.execution_id);
    expect(canceled).to.be.eq(true);

    // Get execution status
    const status = await client.getExecutionStatus(execution.execution_id);
    const expectedStatus = {
      state: ExecutionState.CANCELLED,
      execution_id: execution.execution_id,
      query_id: queryID,
    };
    const strippedStatus = {
      state: status.state,
      execution_id: status.execution_id,
      query_id: status.query_id,
    };
    expect(expectedStatus).to.be.deep.equal(strippedStatus);
  });

  it("successfully executes with query parameters", async () => {
    const parameters = [
      QueryParameter.text("TextField", "Plain Text"),
      QueryParameter.number("NumberField", 3.1415926535),
      QueryParameter.date("DateField", "2022-05-04 00:00:00"),
      QueryParameter.enum("ListField", "Option 1"),
    ];
    // Execute and check state
    const execution = await client.executeQuery(testQueryId, {
      query_parameters: parameters,
    });
    expect(execution.execution_id).is.not.eq(null);
  });

  it("execute with Large tier performance", async () => {
    const execution = await client.executeQuery(testQueryId, {
      performance: ExecutionPerformance.Large,
    });
    expect(execution.execution_id).is.not.eq(null);
  });

  it("returns expected results on cancelled query exection", async () => {
    // Execute and check state
    const cancelledExecutionId = "01GEHEC1W8P1V5ENF66R2WY54V";
    const result = await client.getExecutionResults(cancelledExecutionId);
    expect(result).to.deep.equal({
      execution_id: cancelledExecutionId,
      query_id: 1229120,
      state: "QUERY_STATE_CANCELLED",
      // TODO - this is a new field - not present in our type interfaces.
      is_execution_finished: true,
      submitted_at: "2022-10-04T12:08:47.753527Z",
      expires_at: "2024-10-03T12:08:48.790332Z",
      execution_started_at: "2022-10-04T12:08:47.756608607Z",
      cancelled_at: "2022-10-04T12:08:48.790331383Z",
      execution_ended_at: "2022-10-04T12:08:48.790331383Z",
    });
  });

  it("getResults", async () => {
    const execution = await client.executeQuery(testQueryId);
    await sleep(1);
    // expect basic query has completed after 1s
    const status = await client.getExecutionStatus(execution.execution_id);
    expect(status.state).to.be.eq(ExecutionState.COMPLETED);

    // let resultJSON = await client.getExecutionResults(execution.execution_id);
    await expect(() => client.getExecutionResults(execution.execution_id)).to.not.throw();

    const resultCSV = await client.getResultCSV(execution.execution_id);
    const expectedRows = [
      "text_field,number_field,date_field,list_field\n",
      "Plain Text,3.1415926535,2022-05-04T00:00:00Z,Option 1\n",
    ];
    expect(resultCSV.data).to.be.eq(expectedRows.join(""));
  });

  it("gets LastResult", async () => {
    const { results } = await client.getLastExecutionResults(testQueryId, {
      query_parameters: [QueryParameter.text("TextField", "Plain Text")],
    });
    expect(results.result?.rows).to.be.deep.equal([
      {
        date_field: "2022-05-04T00:00:00Z",
        list_field: "Option 1",
        number_field: "3.1415926535",
        text_field: "Plain Text",
      },
    ]);
  });

  it("gets LastResultCSV", async () => {
    // https://dune.com/queries/1215383
    const resultCSV = await client.getLastResultCSV(testQueryId, {
      query_parameters: [QueryParameter.text("TextField", "Plain Text")],
    });
    const expectedRows = [
      "text_field,number_field,date_field,list_field\n",
      "Plain Text,3.1415926535,2022-05-04T00:00:00Z,Option 1\n",
    ];
    expect(resultCSV.data).to.be.eq(expectedRows.join(""));
  });

  /// Pagination
  it("uses pagination parameters", async () => {
    // This execution was run with StartFrom = 1.
    const result = await client.getExecutionResults("01HQJ996M17AB1D7EWDMPZ79ZS", {
      limit: 2,
      offset: 1,
    });
    expect(result.result?.rows).to.be.deep.equal([
      {
        number: 2,
      },
      {
        number: 3,
      },
    ]);

    const resultCSV = await client.getResultCSV("01HQJ996M17AB1D7EWDMPZ79ZS", {
      limit: 1,
      offset: 2,
    });
    const expectedRows = ["number\n", "3\n"];
    expect(resultCSV.data).to.be.eq(expectedRows.join(""));
  });
});

describe("ExecutionAPI: Errors", () => {
  // TODO these errors can't be reached because post method is private
  // {"error":"unknown parameters (undefined)"}
  // {"error":"Invalid request body payload"}
  let client: ExecutionAPI;

  beforeEach(() => {
    client = new ExecutionAPI(BASIC_KEY);
  });

  it("returns invalid API key", async () => {
    const bad_client = new ExecutionAPI("Bad Key");
    await expectAsyncThrow(bad_client.executeQuery(1), "Response Error: invalid API Key");
  });

  it("returns query not found error", async () => {
    await expectAsyncThrow(
      client.executeQuery(999999999),
      "Response Error: Query not found",
    );
    await expectAsyncThrow(client.executeQuery(0), "Response Error: Query not found");
  });

  it("returns invalid job id", async () => {
    const invalidJobID = "Wonky Job ID";
    const expectedErrorMessage = `Response Error: The requested execution ID (ID: ${invalidJobID}) is invalid.`;
    await expectAsyncThrow(client.getExecutionStatus(invalidJobID), expectedErrorMessage);
    await expectAsyncThrow(
      client.getExecutionResults(invalidJobID),
      expectedErrorMessage,
    );
    await expectAsyncThrow(client.cancelExecution(invalidJobID), expectedErrorMessage);
  });
  it("fails execute with unknown query parameter", async () => {
    const queryID = 1215383;
    const invalidParameterName = "Invalid Parameter Name";
    await expectAsyncThrow(
      client.executeQuery(queryID, {
        query_parameters: [QueryParameter.text(invalidParameterName, "")],
      }),
      `Response Error: unknown parameters (${invalidParameterName})`,
    );
  });
  it("does not allow to execute private queries for other accounts.", async () => {
    await expectAsyncThrow(
      client.executeQuery(1348384),
      "Response Error: Query not found",
    );
  });
  it("fails with unhandled FAILED_TYPE_UNSPECIFIED when query won't compile", async () => {
    // Execute and check state
    // V1 query: 1348966
    await expectAsyncThrow(
      client.getExecutionResults("01GEHG4AY1Z9JBR3BYB20E7RGH"),
      "Response Error: FAILED_TYPE_EXECUTION_FAILED",
    );
    // V2 -query: :1349019
    await expectAsyncThrow(
      client.getExecutionResults("01GEHGXHQ25XWMVFJ4G2HZ5MGS"),
      "Response Error: FAILED_TYPE_EXECUTION_FAILED",
    );
  });
});
