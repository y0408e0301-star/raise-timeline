-- 性能テスト（開発計画書 3-8、基本設計書 2.4）のデータ。要件定義書 11.1 の測定の条件の量を入れる：
-- ユーザー 1,000 人・投稿 1 万件・コメント 3 万件・いいね 5 万件、測るユーザー（perf_0001〜perf_0050）は自分以外の 999 人をフォロー。
-- ユーザー ID はすべて「perf_」で始まり、パスワードは perf-pass1。前回のデータは消してから入れ直すので、何回流しても同じになる。
-- 表は API（Flyway）が作るので、先に API を起動しておく。psql の変数 image_bytes に、画像 1 枚の大きさ（バイト）を渡す
-- （画像のファイルは frontend/perf/cli.ts が作って S3 に置く）。手で流すときは README「性能テスト」の手順で
BEGIN;

-- 投稿・画像の行・コメント・いいね・フォロー・リフレッシュトークンは ON DELETE CASCADE で一緒に消える。
-- LIKE だと「_」が 1 文字の記号になるので、先頭の 5 文字で比べる
DELETE FROM users WHERE left(username, 5) = 'perf_';

-- 乱数の種を決め、毎回同じデータにする（結果の表は出さない）
SELECT setseed(0.42) \g /dev/null

-- ユーザー 1,000 人。パスワードの BCrypt のハッシュは 1 つを使い回す（1,000 回計算すると遅いため）
INSERT INTO users (username, display_name, password_hash, bio, created_at, updated_at)
SELECT format('perf_%s', lpad(n::text, 4, '0')),
       format('性能テスト %s', lpad(n::text, 4, '0')),
       '$2a$10$j6OIEMdIr/obCW25DF61ielNl3OX54GuohvdC5mKRKGqrUNe846fa',
       '性能テスト用のユーザーです。',
       now() - interval '120 days',
       now() - interval '120 days'
FROM generate_series(1, 1000) AS n;

CREATE TEMP TABLE perf_users ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY username)::int AS n
FROM users WHERE left(username, 5) = 'perf_';

-- 測るユーザー（1〜50 番）は自分以外の全員をフォロー（11.1 の「フォロー 1,000 人」。全員で 1,000 人なので 999 人）。
-- ほかの人は、ランダムに 20 人をフォロー
INSERT INTO follows (follower_id, followee_id)
SELECT a.id, b.id FROM perf_users a JOIN perf_users b ON a.id <> b.id WHERE a.n <= 50;

INSERT INTO follows (follower_id, followee_id)
SELECT a.id, b.id
FROM perf_users a
CROSS JOIN LATERAL (SELECT id FROM perf_users b WHERE b.id <> a.id ORDER BY random() LIMIT 20) b
WHERE a.n > 50;

-- 投稿 1 万件。投稿した人はランダム、日時は 13 分おき（約 90 日分）。古い順に入れて、ID の順と日時の順をそろえる。
-- 本文の長さは 20〜280 文字くらいにばらつかせる
INSERT INTO posts (user_id, body, created_at)
SELECT u.id,
       left(format('性能テストの投稿 %s です。', g.g) || repeat('タイムラインの表示の速さを測るための文章。', g.len), 280),
       now() - (10001 - g.g) * interval '13 minutes'
FROM (SELECT g, 1 + floor(random() * 1000)::int AS un, floor(random() * 14)::int AS len
      FROM generate_series(1, 10000) AS g) g
JOIN perf_users u ON u.n = g.un
ORDER BY g.g;

CREATE TEMP TABLE perf_posts ON COMMIT DROP AS
SELECT p.id, p.created_at, row_number() OVER (ORDER BY p.id)::int AS n
FROM posts p JOIN perf_users u ON u.id = p.user_id;

-- 新しい 1,000 件のうち 10 件に 1 件（100 件）に、画像を 1 枚ずつ付ける（S3 の posts/perf-001.png〜perf-100.png）
INSERT INTO post_images (post_id, storage_key, content_type, byte_size, sort_order)
SELECT p.id, format('posts/perf-%s.png', lpad(((10000 - p.n) / 10 + 1)::text, 3, '0')), 'image/png', :image_bytes, 0
FROM perf_posts p
WHERE p.n > 9000 AND (10000 - p.n) % 10 = 0;

-- コメント 3 万件。投稿と書いた人はランダム、日時は投稿の 1 日以内（今より後にはしない）
INSERT INTO comments (post_id, user_id, body, created_at)
SELECT p.id, u.id, format('性能テストのコメント %s', c.g), least(now(), p.created_at + c.delay * interval '1 day')
FROM (SELECT g, 1 + floor(random() * 10000)::int AS pn, 1 + floor(random() * 1000)::int AS un, random() AS delay
      FROM generate_series(1, 30000) AS g) c
JOIN perf_posts p ON p.n = c.pn
JOIN perf_users u ON u.n = c.un;

-- いいね 5 万件。1 人 1 投稿に 1 つなので、重なりを除いて 5 万件にする
INSERT INTO likes (user_id, post_id, created_at)
SELECT u.id, p.id, least(now(), p.created_at + interval '1 hour')
FROM (SELECT DISTINCT 1 + floor(random() * 1000)::int AS un, 1 + floor(random() * 10000)::int AS pn
      FROM generate_series(1, 55000)) l
JOIN perf_users u ON u.n = l.un
JOIN perf_posts p ON p.n = l.pn
LIMIT 50000;

COMMIT;

-- 入れた量で、検索の計画（索引を使うか）を立て直させる
ANALYZE users, follows, posts, post_images, comments, likes;

SELECT (SELECT count(*) FROM users WHERE left(username, 5) = 'perf_') AS users,
       (SELECT count(*) FROM posts p JOIN users u ON u.id = p.user_id WHERE left(u.username, 5) = 'perf_') AS posts,
       (SELECT count(*) FROM comments c JOIN users u ON u.id = c.user_id WHERE left(u.username, 5) = 'perf_') AS comments,
       (SELECT count(*) FROM likes l JOIN users u ON u.id = l.user_id WHERE left(u.username, 5) = 'perf_') AS likes,
       (SELECT count(*) FROM follows f JOIN users u ON u.id = f.follower_id
        WHERE left(u.username, 5) = 'perf_' AND u.username <= 'perf_0050') AS measured_follows;
