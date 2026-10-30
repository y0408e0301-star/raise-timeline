# API のイメージの置き場所。タグはコミット ID（deploy/deploy.sh が push する）で、同じタグの上書きはさせない

resource "aws_ecr_repository" "app" {
  name                 = "rt-app"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the latest 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# 最後に push したイメージを動かす。ECR が空の間は running = true にできない（deploy.sh が先に push する）
data "aws_ecr_image" "app" {
  count           = local.running_count
  repository_name = aws_ecr_repository.app.name
  most_recent     = true
}
