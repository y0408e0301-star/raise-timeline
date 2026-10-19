-- 投稿の画像（データ設計書 4.3）。ファイルは S3 に置き、ここには置き場所（キー）だけを持つ（P-2）
CREATE TABLE post_images (
    id           bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id      bigint       NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    storage_key  varchar(100) NOT NULL UNIQUE,
    content_type varchar(20)  NOT NULL,
    byte_size    integer      NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
    sort_order   smallint     NOT NULL CHECK (sort_order BETWEEN 0 AND 3),
    -- 投稿ごとの並び順は重ならない。投稿の画像をまとめて読むときの索引にもなる（FN-02 5.2）
    UNIQUE (post_id, sort_order)
);

-- S3 から消せなかったファイル（データ設計書 4.8、BR-5・BR-10）。1 日 1 回消し直し、消せたら行を消す
CREATE TABLE storage_deletions (
    id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    storage_key varchar(100) NOT NULL UNIQUE,
    created_at  timestamptz  NOT NULL DEFAULT now()
);
