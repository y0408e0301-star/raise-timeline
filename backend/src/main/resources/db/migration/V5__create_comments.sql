-- コメント（データ設計書 4.4）。投稿を削除するとコメントも消える（FN-05 5 章 No.3）
CREATE TABLE comments (
    id         bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id    bigint       NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    user_id    bigint       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       varchar(280) NOT NULL CHECK (body <> ''),
    created_at timestamptz  NOT NULL DEFAULT now()
);

-- コメントの一覧（古い順）と件数（C-3・C-6）。データ設計書 6 章
CREATE INDEX comments_post_id_id_idx ON comments (post_id, id);
