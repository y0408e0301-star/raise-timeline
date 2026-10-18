-- 投稿（データ設計書 4.2）。本文が空でよいか（画像があるか。BR-2）は API で確かめる
CREATE TABLE posts (
    id         bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       varchar(280) NOT NULL DEFAULT '',
    created_at timestamptz  NOT NULL DEFAULT now(),
    edited_at  timestamptz
);

-- プロフィールの投稿一覧（PF-2）と「フォロー中」タブ（T-1）。データ設計書 6 章
CREATE INDEX posts_user_id_id_idx ON posts (user_id, id DESC);
