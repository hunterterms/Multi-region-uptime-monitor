resource "aws_iam_role" "probe" {
  name               = "uptime-probe-lambda"
  assume_role_policy = local.lambda_assume_role
}

resource "aws_iam_role_policy_attachment" "probe" {
  role       = aws_iam_role.probe.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "probe_write_state" {
  name = "write-results"
  role = aws_iam_role.probe.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "dynamodb:PutItem"
      Resource = aws_dynamodb_table.results.arn
    }]
  })
}

//packages the lambda function code
data "archive_file" "probe" {
  type        = "zip"
  source_file = "${path.module}/functions/dist/probe/handler.js"
  output_path = "${path.module}/build/probe.zip"
}

resource "aws_cloudwatch_log_group" "probe" {
  for_each          = toset(var.probe_region)
  region            = each.key
  name              = "/aws/lambda/uptime-probe"
  retention_in_days = 14
}

resource "aws_lambda_function" "probe" {
  for_each         = toset(var.probe_region)
  region           = each.key
  function_name    = "uptime-probe"
  role             = aws_iam_role.probe.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.probe.output_path
  source_code_hash = data.archive_file.probe.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      RESULTS_TABLE        = resource.aws_dynamodb_table.results.name
      RESULTS_TABLE_REGION = var.home_region
      TARGET_ID            = "flaky-target"
      TARGET_URL           = resource.aws_lambda_function_url.target.function_url
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = resource.aws_cloudwatch_log_group.probe[each.key].name
  }
}

resource "aws_lambda_function_event_invoke_config" "probe" {
  for_each               = toset(var.probe_region)
  region                 = each.key
  function_name          = resource.aws_lambda_function.probe[each.key].function_name
  maximum_retry_attempts = 0
}

resource "aws_iam_role" "scheduler" {
  name = "uptime-probe-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke_probe" {
  name = "invoke-probe"
  role = resource.aws_iam_role.scheduler.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "lambda:InvokeFunction"
      Resource = concat([for fn in aws_lambda_function.probe : fn.arn],
      [aws_lambda_function.evaluator.arn])
    }]
  })
}

resource "aws_scheduler_schedule" "probe" {
  for_each            = toset(var.probe_region)
  region              = each.key
  name                = "uptime-probe-every-minute"
  schedule_expression = "cron(* * * * ? *)"

  target {
    arn      = resource.aws_lambda_function.probe[each.key].arn
    role_arn = resource.aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 0
    }
  }

  flexible_time_window {
    mode = "OFF"
  }
}

moved {
  from = resource.aws_cloudwatch_log_group.probe
  to   = resource.aws_cloudwatch_log_group.probe["ap-south-1"]
}

moved {
  from = resource.aws_lambda_function.probe
  to   = resource.aws_lambda_function.probe["ap-south-1"]
}

moved {
  from = resource.aws_lambda_function_event_invoke_config.probe
  to   = resource.aws_lambda_function_event_invoke_config.probe["ap-south-1"]
}

moved {
  from = resource.aws_scheduler_schedule.probe
  to   = resource.aws_scheduler_schedule.probe["ap-south-1"]
}
