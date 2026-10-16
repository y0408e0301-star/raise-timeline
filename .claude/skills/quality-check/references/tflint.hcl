# リポジトリに .tflint.hcl がないときに run-checks.sh が使う既定の設定
# リポジトリに入れるときは、このファイルを Terraform のフォルダに .tflint.hcl として置く

# Terraform の書き方（未使用の変数・型のない変数・バージョンの固定など）
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# AWS（存在しないインスタンスタイプ・AMI の指定ミスなど）
# 最新版：gh api repos/terraform-linters/tflint-ruleset-aws/releases/latest --jq .tag_name
plugin "aws" {
  enabled = true
  version = "0.49.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
