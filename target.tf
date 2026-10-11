resource "aws_iam_role" "target" {
  name               = "uptime-target-lambda"
  assume_role_policy = local.lambda_assume_role
}

resource "aws_iam_role_policy_attachment" "target_logs" {
  role       = aws_iam_role.target.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "target_read_state" {
  name = "read-fault-state"
  role = aws_iam_role.target.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "dynamodb:GetItem"
      Resource = aws_dynamodb_table.target_state.arn
    }]
  })
}

data "archive_file" "target" {
  type        = "zip"
  source_file = "${path.module}/functions/dist/target/handler.js"
  output_path = "${path.module}/build/target.zip"
}

resource "aws_cloudwatch_log_group" "target" {
  name              = "/aws/lambda/uptime-target"
  retention_in_days = 14
}

resource "aws_lambda_function" "target" {
  function_name    = "uptime-target"
  role             = aws_iam_role.target.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.target.output_path
  source_code_hash = data.archive_file.target.output_base64sha256
  timeout          = 15

  environment {
    variables = {
      "STATE_TABLE" = resource.aws_dynamodb_table.target_state.name
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = resource.aws_cloudwatch_log_group.target.name
  }
}

resource "aws_lambda_function_url" "target" {
  function_name      = resource.aws_lambda_function.target.function_name
  authorization_type = "NONE"
}
