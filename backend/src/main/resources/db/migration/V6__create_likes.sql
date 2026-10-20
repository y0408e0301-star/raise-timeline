-- いいね（データ設計書 4.5）。1 人 1 投稿に 1 つ（主キー。L-3、BR-6）。投稿を削除するといいねも消える（FN-06 5 章 No.4）
CREATE TABLE likes (
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    post_id    bigint      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, post_id)
);

-- いいねした人の一覧（新しい順）と件数（L-5・L-6）。データ設計書 6 章
CREATE INDEX likes_post_id_created_at_idx ON likes (post_id, created_at DESC);
