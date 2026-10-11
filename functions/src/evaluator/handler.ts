import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  decide,
  evaluateMinute,
  lastCompleteMinutes,
  MinuteEvaluation,
} from "./quorum";
import { requireEnv } from "../shared/env";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { ProbeResult } from "../probe/probe";

const CONFIRM_MINUTES = 2; //how many minutes must agree before we make a decision
const REGIONS = requireEnv("PROBE_REGIONS").split(",");
const RESULTS_TABLE = requireEnv("RESULTS_TABLE");
const TARGET_ID = requireEnv("TARGET_ID");
const INCIDENTS_TABLE = requireEnv("INCIDENTS_TABLE");
const ALERTS_TOPIC_ARN = requireEnv("ALERTS_TOPIC_ARN");

const sns = new SNSClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface Incident {
  targetId: string;
  startedAt: string;
  openedAt: string;
  resolvedAt?: string;
}

export async function handler() {
  const minutes = lastCompleteMinutes(new Date(), CONFIRM_MINUTES); //we are judging the last two minutes
  const evaluations: MinuteEvaluation[] = [];

  //one verdict per minute
  for (const minute of minutes) {
    evaluations.push(
      evaluateMinute(minute, REGIONS, await readResults(minute)),
    );
  }

  //is an incident open right now?
  const latest = await latestIncident();
  const incidentOpen = latest !== undefined && latest.resolvedAt === undefined;

  const action = decide(evaluations, incidentOpen);
  console.log(JSON.stringify({ evaluations, incidentOpen, action }));

  if (action === "open") await openIncident(minutes[0], evaluations);
  else if (action === "resolve" && latest)
    await resolveIncident(latest, minutes[0], evaluations);
}

async function readResults(minute: string) {
  const { Items } = await db.send(
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/QueryCommand/
    new QueryCommand({
      TableName: RESULTS_TABLE,
      KeyConditionExpression: "targetId = :t AND begins_with(minuteRegion, :m)",
      ExpressionAttributeValues: { ":t": TARGET_ID, ":m": minute },
      ConsistentRead: true,
    }),
  );
  return (Items ?? []) as ProbeResult[];
}

async function latestIncident() {
  const { Items } = await db.send(
    new QueryCommand({
      TableName: INCIDENTS_TABLE,
      KeyConditionExpression: "targetId = :t",
      ExpressionAttributeValues: { ":t": TARGET_ID },
      ConsistentRead: true,
      ScanIndexForward: false, //newest first
      Limit: 1,
    }),
  );
  return Items?.[0] as Incident | undefined;
}

async function openIncident(
  startedAt: string,
  evauluations: MinuteEvaluation[],
) {
  const key = { targetId: TARGET_ID, startedAt };
  const recorded = await claim(
    db.send(
      new PutCommand({
        TableName: INCIDENTS_TABLE,
        Item: {
          ...key,
          openedAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(targetId)", //this incident is not yet recorded
      }),
    ),
  );
  if (!recorded) return;

  try {
    await alert(
      `DOWN: ${TARGET_ID}`,
      `${TARGET_ID} has been down since ${startedAt} UTC.`,
      evauluations,
    );
  } catch (err) {
    //if the email wasn't sent, delete the table record abn try again next time
    await db.send(new DeleteCommand({ TableName: INCIDENTS_TABLE, Key: key }));
    throw err;
  }
}

async function resolveIncident(
  incident: Incident,
  resolvedAt: string,
  evaluations: MinuteEvaluation[],
) {
  const recorded = await claim(
    db.send(
      new UpdateCommand({
        TableName: INCIDENTS_TABLE,
        Key: { targetId: incident.targetId, startedAt: incident.startedAt },
        UpdateExpression: "SET resolvedAt = :r",
        ExpressionAttributeValues: { ":r": resolvedAt },
        ConditionExpression: "attribute_not_exists(resolvedAt)", //not resolved yet
      }),
    ),
  );
  if (!recorded) return;

  const headline = `${TARGET_ID} is back up. It was down from ${incident.startedAt} to ${resolvedAt} UTC.`;
  await alert(`RECOVERED: ${TARGET_ID}`, headline, evaluations);
}

//runs a conditional write
async function claim(write: Promise<unknown>): Promise<Boolean> {
  try {
    await write; //wait for the write to finish
    return true; //this run recorded the incident, the caller then sends the email
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false; //another run got there first (recorded that incident first)
    throw err;
  }
}

//sends one email
async function alert(
  subject: string,
  headline: string,
  evaluations: MinuteEvaluation[],
) {
  const evidence = evaluations.map((e) => {
    /* Object.entries(e.votes)
  -> [["ap-south-1","down"], ["eu-west-1","down"], ["us-east-1","up"]]

.map(([region, vote]) => `${region}=${vote}`)
  -> ["ap-south-1=down", "eu-west-1=down", "us-east-1=up"]

votes.join('  ')
  -> "ap-south-1=down  eu-west-1=down  us-east-1=up"

`${e.minute}  ${votes.join('  ')}`
  -> "2026-10-04T10:14  ap-south-1=down  eu-west-1=down  us-east-1=up" */
    const votes = Object.entries(e.votes).map(
      ([region, vote]) => `${region}:${vote}`,
    );
    return `${e.minute}  ${votes.join("  ")}`;
  });

  await sns.send(
    new PublishCommand({
      TopicArn: ALERTS_TOPIC_ARN,
      Subject: subject,
      Message: `${headline}\n\nWhat each region saw:\n${evidence.join("\n")}\n`,
    }),
  );
}
