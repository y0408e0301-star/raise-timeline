-- ユーザー検索の部分一致（FN-08 S-4、データ設計書 6 章・8 章）。
-- LIKE '%…%' でも全件を調べずに済むよう、ユーザー ID と表示名（小文字にしたもの）に pg_trgm の GIN 索引を張る。
-- 索引が効くのは 3 文字以上の検索語。pg_trgm は PostgreSQL に付いている拡張で、RDS でも使える
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX users_username_trgm_idx ON users USING gin (lower(username) gin_trgm_ops);
CREATE INDEX users_display_name_trgm_idx ON users USING gin (lower(display_name) gin_trgm_ops);
