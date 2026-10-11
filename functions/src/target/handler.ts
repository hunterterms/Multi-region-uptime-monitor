import { requireEnv } from "../shared/env";
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
import type {
  LambdaFunctionURLEvent,
  LambdaFunctionURLResult,
} from "aws-lambda";
import { decideResponse, FaultState } from "./fault";

const STATE_TABLE = requireEnv("STATE_TABLE");
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handler(
  event: LambdaFunctionURLEvent,
): Promise<LambdaFunctionURLResult> {
  const { Item } = await db.send(
    new GetCommand({
      TableName: STATE_TABLE,
      Key: {
        id: "current",
      },
    }),
  );

  const state: FaultState = (Item as FaultState | undefined) ?? {
    mode: "healthy",
  };
  const { status, delayMs } = decideResponse(
    state,
    event.headers["x-probe-region"],
  );
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

  return {
    statusCode: status,
    body: status === 200 ? "ok\n" : "unavailable\n",
  };
}
