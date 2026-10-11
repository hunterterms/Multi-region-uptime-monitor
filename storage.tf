resource "aws_dynamodb_table" "results" {
  name         = "results"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "targetId"
  range_key    = "minuteRegion"

  attribute {
    name = "targetId"
    type = "S"
  }

  attribute {
    name = "minuteRegion"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "target_state" {
  name         = "flaky-target-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "incidents" {
  name         = "incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "targetId"
  range_key    = "startedAt"

  attribute {
    name = "targetId"
    type = "S"
  }

  attribute {
    name = "startedAt"
    type = "S"
  }
}
