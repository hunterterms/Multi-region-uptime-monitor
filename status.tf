resource "aws_iam_role" "status_api" {
  assume_role_policy = local.lambda_assume_role
  name               = "uptime-status-api-lambda"
}

resource "aws_iam_role_policy_attachment" "status_api_logs" {
  role       = aws_iam_role.status_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "status_api" {
  name = "read-results-and-incidents"
  role = resource.aws_iam_role.status_api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "dynamodb:Query"
        Resource = [aws_dynamodb_table.results.arn, aws_dynamodb_table.incidents.arn]
      },
    ]
  })
}

data "archive_file" "status_api" {
  type        = "zip"
  output_path = "${path.module}/build/status.zip"
  source_file = "${path.module}/functions/dist/status/handler.js"
}

resource "aws_cloudwatch_log_group" "status_api" {
  name              = "/aws/lambda/uptime-status-api"
  retention_in_days = 14
}

resource "aws_lambda_function" "status_api" {
  function_name    = "uptime-status-api"
  role             = resource.aws_iam_role.status_api.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.status_api.output_path
  source_code_hash = data.archive_file.status_api.output_base64sha256
  timeout          = 10
  memory_size      = 256

  logging_config {
    log_format = "Text"
    log_group  = resource.aws_cloudwatch_log_group.status_api.name
  }

  environment {
    variables = {
      RESULTS_TABLE   = resource.aws_dynamodb_table.results.name
      TARGET_ID       = "flaky-target"
      INCIDENTS_TABLE = resource.aws_dynamodb_table.incidents.name
      PROBE_REGIONS   = join(",", var.probe_region)
    }
  }
}

//public HTTPS address
resource "aws_apigatewayv2_api" "status" {
  name          = "status-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["http://localhost:3000"]
    allow_methods = ["GET"]
  }
}

//what it leads to: the status lambda func.
resource "aws_apigatewayv2_integration" "status" {
  api_id                 = resource.aws_apigatewayv2_api.status.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = resource.aws_lambda_function.status_api.invoke_arn
  payload_format_version = "2.0"
}

//what requests go there: GET /api/status
resource "aws_apigatewayv2_route" "status" {
  api_id    = resource.aws_apigatewayv2_api.status.id
  route_key = "GET /api/status"
  target    = "integrations/${aws_apigatewayv2_integration.status.id}"
}

//the published version
resource "aws_apigatewayv2_stage" "default" {
  api_id      = resource.aws_apigatewayv2_api.status.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 5
    throttling_rate_limit  = 1
  }
}

//allows API Gateway to invole the func.
resource "aws_lambda_permission" "status_api" {
  function_name = resource.aws_lambda_function.status_api.function_name
  action        = "lambda:InvokeFunction"
  principal     = "apigateway.amazonaws.com"
  statement_id  = "AllowApiGatewayInvoke"
  source_arn    = "${aws_apigatewayv2_api.status.execution_arn}/*/*"
}

output "status_api_url" {
  value = "${aws_apigatewayv2_api.status.api_endpoint}/api/status"
}

output "status_api_base" {
  value = aws_apigatewayv2_api.status.api_endpoint
}
