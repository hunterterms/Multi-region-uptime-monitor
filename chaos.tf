locals {
  chaos_start  = "2026-10-12T17:00:00Z"
  chaos_hours  = 48
  chaos_seed   = 7
  chaos_paused = false
}

resource "aws_dynamodb_table" "chaos_log" {
  name         = "chaos-log"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "experimentId"
  range_key    = "at"

  attribute {
    name = "experimentId"
    type = "S"
  }
  attribute {
    name = "at"
    type = "S"
  }
}

resource "aws_iam_role" "chaos" {
  name               = "uptime-chaos-lambda"
  assume_role_policy = local.lambda_assume_role
}

resource "aws_iam_role_policy_attachment" "chaos" {
  role       = resource.aws_iam_role.chaos.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "chaos" {
  name = "flip-switch-and-log"
  role = resource.aws_iam_role.chaos.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = resource.aws_dynamodb_table.target_state.arn
      },
      {
        Effect   = "Allow"
        Action   = "dynamodb:PutItem"
        Resource = aws_dynamodb_table.chaos_log.arn
      },
    ]
  })
}

data "archive_file" "chaos" {
  type        = "zip"
  source_file = "${path.module}/functions/dist/chaos/handler.js"
  output_path = "${path.module}/build/chaos.zip"
}

resource "aws_cloudwatch_log_group" "chaos" {
  name              = "/aws/lambda/uptime-chaos"
  retention_in_days = 14
}

resource "aws_lambda_function" "chaos" {
  function_name    = "uptime-chaos"
  role             = resource.aws_iam_role.chaos.arn
  runtime          = "nodejs24.x"
  handler          = "handler.handler"
  architectures    = ["arm64"]
  filename         = data.archive_file.chaos.output_path
  source_code_hash = data.archive_file.chaos.output_base64sha256
  timeout          = 10
  memory_size      = 256

  logging_config {
    log_format = "Text"
    log_group  = resource.aws_cloudwatch_log_group.chaos.name
  }

  environment {
    variables = {
      STATE_TABLE      = resource.aws_dynamodb_table.target_state.name
      CHAOS_LOG_TABLE  = aws_dynamodb_table.chaos_log.name
      EXPERIMENT_START = local.chaos_start
      EXPERIMENT_HOURS = tostring(local.chaos_hours)
      EXPERIMENT_SEED  = tostring(local.chaos_seed)
      PAUSED           = tostring(local.chaos_paused)
      PROBE_REGIONS    = join(",", var.probe_region)
    }
  }
}

resource "aws_lambda_function_event_invoke_config" "chaos" {
  function_name          = resource.aws_lambda_function.chaos.function_name
  maximum_retry_attempts = 0
}

resource "aws_iam_role" "chaos_scheduler" {
  name = "uptime-chaos-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "scheduler.amazonaws.com" }
        Action    = "sts:AssumeRole"
      },
    ]
  })
}

resource "aws_iam_role_policy" "chaos_scheduler" {
  name = "invoke-chaos"
  role = resource.aws_iam_role.chaos_scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.chaos.arn
      },
    ]
  })
}

resource "aws_scheduler_schedule" "chaos" {
  name                = "uptime-chaos-every-minute"
  schedule_expression = "cron(* * * * ? *)"
  start_date          = local.chaos_start
  end_date            = timeadd(local.chaos_start, "${local.chaos_hours}h")

  target {
    arn      = resource.aws_lambda_function.chaos.arn
    role_arn = resource.aws_iam_role.chaos_scheduler.arn

    retry_policy {
      maximum_retry_attempts = 0
    }
  }

  flexible_time_window {
    mode = "OFF"
  }
}

output "chaos_start" {
  value = local.chaos_start
}

output "chaos_end" {
  value = timeadd(local.chaos_start, "${local.chaos_hours}h")
}
