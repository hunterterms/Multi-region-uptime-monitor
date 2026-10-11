import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { lastCompleteMinutes } from "../evaluator/quorum";
import { buildSummary, IncidentRecord, WINDOW_MINUTES } from "./summary";
import { requireEnv } from "../shared/env";
import { ProbeResult } from "../probe/probe";

const RESULTS_TABLE = requireEnv("RESULTS_TABLE");
const TARGET_ID = requireEnv("TARGET_ID");
const INCIDENTS_TABLE = requireEnv("INCIDENTS_TABLE");
const REGIONS = requireEnv("PROBE_REGIONS").split(",");

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handler(): Promise<APIGatewayProxyResultV2> {
  const now = new Date();
  const oldestMinute = lastCompleteMinutes(now, WINDOW_MINUTES)[0];

  //every probe row from the last hour
  const results = await db.send(
    new QueryCommand({
      TableName: RESULTS_TABLE,
      KeyConditionExpression: "targetId = :t AND minuteRegion >= :from",
      ExpressionAttributeValues: {
        ":t": TARGET_ID,
        ":from": oldestMinute,
      },
    }),
  );

  //the most recent incidents
  const incidents = await db.send(
    new QueryCommand({
      TableName: INCIDENTS_TABLE,
      KeyConditionExpression: "targetId = :t",
      ExpressionAttributeValues: { ":t": TARGET_ID },
      ScanIndexForward: false, //newest first
      Limit: 100,
    }),
  );

  const summary = buildSummary({
    target: TARGET_ID,
    now,
    regions: REGIONS,
    rows: (results.Items ?? []) as ProbeResult[],
    incidents: (incidents.Items ?? []) as IncidentRecord[],
  });

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=30",
    },
    body: JSON.stringify(summary),
  };
}
