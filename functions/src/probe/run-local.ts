import { probe } from "./probe";

const TARGET = process.env.TARGET_URL ?? "http://localhost:4000";
const REGIONS = ["ap-south-1", "eu-west-1", "us-east-1"];

const results = await Promise.all(
  REGIONS.map((region) => probe(TARGET, region)),
);

console.table(results, [
  "region",
  "outcome",
  "statusCode",
  "latencyMs",
  "errorCode",
]);
