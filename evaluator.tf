variable "alert_email" {
  type = string
}

resource "aws_sns_topic" "alerts" {
  name = "uptime-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = resource.aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_iam_role" "evaluator" {
  name               = "uptime-evaluator-lambda"
  assume_role_policy = local.lambda_assume_role
}

resource "aws_iam_role_policy_attachment" "evaluator-logs" {
  role       = resource.aws_iam_role.evaluator.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "evaluator" {
  name = "judge-and-alert"
  role = resource.aws_iam_role.evaluator.id
  policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Sid" : "Statement1",
        "Effect" : "Allow",
        "Action" : [
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ],
        "Resource" : resource.aws_dynamodb_table.incidents.arn
      },
      {
        "Sid" : "Statement2",
        "Effect" : "Allow",
        "Action" : [
          "sns:Publish"
        ],
        "Resource" : resource.aws_sns_topic.alerts.arn
      },
      {
        "Sid" : "Statement3",
        "Effect" : "Allow",
        "Action" : [
          "dynamodb:Query"
        ],
        "Resource" : resource.aws_dynamodb_table.results.arn
      }
    ]
  })
}

data "archive_file" "evaluator" {
  type        = "zip"
  source_file = "${path.module}/functions/dist/evaluator/handler.js"
  output_path = "${path.module}/build/evaluator.zip"
}

resource "aws_cloudwatch_log_group" "evaluator" {
  name              = "/aws/lambda/uptime-evaluator"
  retention_in_days = 14
}

resource "aws_lambda_function" "evaluator" {
  filename         = data.archive_file.evaluator.output_path
  function_name    = "uptime-evaluator"
  role             = resource.aws_iam_role.evaluator.arn
  handler          = "handler.handler"
  architectures    = ["arm64"]
  runtime          = "nodejs24.x"
  source_code_hash = data.archive_file.evaluator.output_base64sha256
  timeout          = 15
  memory_size      = 256

  logging_config {
    log_format = "Text"
    log_group  = resource.aws_cloudwatch_log_group.evaluator.name
  }

  environment {
    variables = {
      PROBE_REGIONS    = join(",", var.probe_region)
      RESULTS_TABLE    = resource.aws_dynamodb_table.results.name
      INCIDENTS_TABLE  = resource.aws_dynamodb_table.incidents.name
      ALERTS_TOPIC_ARN = resource.aws_sns_topic.alerts.arn
      TARGET_ID        = "flaky-target"
    }
  }
}

//for error handling
resource "aws_lambda_function_event_invoke_config" "name" {
  function_name          = resource.aws_lambda_function.evaluator.function_name
  maximum_retry_attempts = 0
}

resource "aws_scheduler_schedule" "evaluator" {
  name                = "uptime-evaluator-every-minute"
  schedule_expression = "cron(* * * * ? *)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = resource.aws_lambda_function.evaluator.arn
    role_arn = resource.aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

output "alerts_topic_arn" {
  value = resource.aws_sns_topic.alerts.arn
}
