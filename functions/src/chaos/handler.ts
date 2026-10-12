import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "../shared/env";
import { buildPlan, desiredFault, sameFault } from "./plan";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { FaultState } from "../target/fault";

const EXPERIMENT_START = requireEnv("EXPERIMENT_START");
const STATE_TABLE = requireEnv("STATE_TABLE");
const PAUSED = process.env.PAUSED === "true";
const CHAOS_LOG_TABLE = requireEnv("CHAOS_LOG_TABLE");

//if the plan is empty, don't break the site
const plan = PAUSED
  ? []
  : buildPlan({
      start: new Date(EXPERIMENT_START),
      hours: Number(requireEnv("EXPERIMENT_HOURS")),
      seed: Number(requireEnv("EXPERIMENT_SEED")),
      regions: requireEnv("PROBE_REGIONS").split(","),
    });

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true }, //https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html
});

export async function handler() {
  const now = new Date();
  const { fault, episode } = desiredFault(plan, now);

  //what is the switch currently set to? if it's already correct, do nothing
  const { Item } = await db.send(
    new GetCommand({
      TableName: STATE_TABLE,
      Key: { id: "current" },
      ConsistentRead: true,
    }),
  );
  const current = (Item as FaultState | undefined) ?? { mode: "healthy" };
  if (sameFault(current, fault)) return;

  //flip the switch
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: STATE_TABLE, Item: { id: "current", ...fault } } },
        {
          Put: {
            TableName: CHAOS_LOG_TABLE,
            Item: {
              experimentId: EXPERIMENT_START,
              at: now.toISOString(),
              ...fault,
              kind: episode?.kind ?? "healthy",
              episodeId: episode?.id,
            },
          },
        },
      ],
    }),
  );

  console.log(
    JSON.stringify({
      at: now.toISOString(),
      from: current.mode,
      to: fault,
      episode,
    }),
  );
}
