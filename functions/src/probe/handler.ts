import { requireEnv } from "../shared/env";
import { probe } from "./probe";
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const RESULTS_TABLE = requireEnv("RESULTS_TABLE");
const RESULTS_TABLE_REGION = requireEnv("RESULTS_TABLE_REGION");
const TARGET_ID = requireEnv("TARGET_ID");
const TARGET_URL = requireEnv("TARGET_URL");
const REGION = requireEnv("AWS_REGION");
const RETENTION_DAYS = 35;

const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: RESULTS_TABLE_REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);

export async function handler() {
  const result = await probe(TARGET_URL, REGION);
  const minute = result.checkedAt.slice(0, 16);

  await db.send(
    new PutCommand({
      TableName: RESULTS_TABLE,
      Item: {
        targetId: TARGET_ID,
        minuteRegion: `${minute}#${REGION}`,
        ...result,
        expiresAt:
          Math.floor(Date.now() / 1000) + RETENTION_DAYS * 24 * 60 * 60,
      },
    }),
  );

  console.log(JSON.stringify(result));
}
