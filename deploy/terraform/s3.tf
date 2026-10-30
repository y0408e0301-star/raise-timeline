# S3 のバケット（インフラ設計書 3.2）。どちらも非公開・SSE-S3

locals {
  account_id = data.aws_caller_identity.current.account_id
  buckets = {
    # 画面（Vite でビルドしたファイル。deploy/deploy.sh が置く）と、止めている間のページ（maintenance/）。CloudFront だけが読む（OAC）
    web = "rt-web-${local.account_id}"
    # 投稿の画像（posts/）とアイコン（icons/）。ブラウザは API が発行した署名付き URL で読む
    images = "rt-images-${local.account_id}"
  }
}

resource "aws_s3_bucket" "web" {
  bucket = local.buckets.web
}

resource "aws_s3_bucket" "images" {
  bucket = local.buckets.images
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each                = { web = aws_s3_bucket.web.id, images = aws_s3_bucket.images.id }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "all" {
  for_each = { web = aws_s3_bucket.web.id, images = aws_s3_bucket.images.id }
  bucket   = each.value

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "all" {
  for_each = { web = aws_s3_bucket.web.id, images = aws_s3_bucket.images.id }
  bucket   = each.value

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 画面のバケットは、この CloudFront からだけ読める
resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.web.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.all]
}

# 止めている間のページ（deploy/maintenance/index.html）
resource "aws_s3_object" "maintenance" {
  bucket        = aws_s3_bucket.web.id
  key           = "maintenance/index.html"
  source        = "${path.module}/../maintenance/index.html"
  etag          = filemd5("${path.module}/../maintenance/index.html")
  content_type  = "text/html; charset=utf-8"
  cache_control = "no-cache"
}
