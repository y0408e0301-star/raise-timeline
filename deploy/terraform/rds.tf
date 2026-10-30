# データベース（インフラ設計書 3.2）。プライベートサブネットに置き、Fargate のタスクからだけ接続できる。
# 使わない間は deploy/stop.sh が止める（Terraform では止めない）

resource "aws_db_subnet_group" "main" {
  name       = "rt-db"
  subnet_ids = [for s in aws_subnet.private : s.id]
}

resource "aws_db_instance" "main" {
  identifier     = "rt-db"
  engine         = "postgres"
  engine_version = "17"
  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "raise_timeline"
  username = "raise_timeline"
  # Parameter Store（ssm.tf）にも同じ値を置き、タスクには環境変数 DB_PASSWORD で渡す
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  # 要件定義書 N-7
  backup_retention_period = 7
  # 誤って消したときのために、削除の前にスナップショットを取る
  skip_final_snapshot       = false
  final_snapshot_identifier = "rt-db-final"
  # 誤って RDS を消す apply・destroy を止める。後片付けのときだけ false にする
  deletion_protection = var.rds_deletion_protection
  apply_immediately   = true
}
