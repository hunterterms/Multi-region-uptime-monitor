# Multi-region uptime monitoring
 
A serverless uptime monitor on AWS. It checks a website every minute from three regions (Mumbai, Ireland and North Virginia), and only calls an outage when most of them agree.

**Built with:** AWS Lambda (Node.js 24), EventBridge Scheduler, DynamoDB, SNS, API Gateway, S3, CloudFront, Terraform, TypeScript, Next.js and GitHub Actions.

## Why it exists
 
Most simple uptime checkers test a site from one place. When that place has a problem, like a slow network route, a DNS hiccup or a check that times out, the checker reports the site as down and sends an alert, even though real users were fine. After enough false alarms, people start ignoring alerts, and then they miss the real one. 
 
This monitor follows three rules instead:
 
1. **Check from three places.** Every minute, a probe in each region loads the site and records what happened.
2. **Go with the majority.** A minute counts as down only when at least 2 of the 3 regions saw a failure.
3. **Wait for confirmation.** An incident opens, and one email goes out, only after 2 down minutes in a row. It closes after 2 up minutes in a row.

# Chaos experiment, 2026-10-12 17:00 to 2026-10-14 17:00 UTC

- Faults planned: 60 (30 regional, 12 blips, 12 outages, 6 slow)
- Faults that happened (chaos-log): 60 (30 regional, 12 blips, 12 outages, 6 slow)
- Checks recorded: 8640 of 8640 expected
- Failed checks when nothing was injected for that region: Mumbai 0, Ireland 0, North Virginia 0

| Rule | Outages caught | Median time to alert | False alarms | Blips that alerted | Alerts |
|---|---|---|---|---|---|
| Any failed check, anywhere | 18 of 18 | 1.3 min | 30 (30 regional, 0 real-world) | 12 of 12 | 60 |
| Mumbai only, 2 in a row | 18 of 18 | 2.3 min | 10 (10 regional, 0 real-world) | 0 of 12 | 28 |
| Ireland only, 2 in a row | 18 of 18 | 2.3 min | 10 (10 regional, 0 real-world) | 0 of 12 | 28 |
| North Virginia only, 2 in a row | 18 of 18 | 2.3 min | 10 (10 regional, 0 real-world) | 0 of 12 | 28 |
| Any region, 2 in a row | 18 of 18 | 2.3 min | 30 (30 regional, 0 real-world) | 0 of 12 | 48 |
| 2 of 3, 1 minute | 18 of 18 | 1.3 min | 0 | 12 of 12 | 30 |
| 2 of 3, 2 in a row (this project) | 18 of 18 | 2.3 min | 0 | 0 of 12 | 18 |
| 2 of 3, 3 in a row | 18 of 18 | 3.3 min | 0 | 0 of 12 | 18 |
| All 3, 2 in a row | 18 of 18 | 2.3 min | 0 | 0 of 12 | 18 |

# The main finding

| Rule | False alarms | Blip alerts | Time to alert |
|---|---|---|---|
| Any failed check | 30 | 12 | 1.3 min |
| + require 2 of 3 regions | **0** | 12 | 1.3 min |
| + wait for a second minute (this project) | 0 | **0** | 2.3 min |
