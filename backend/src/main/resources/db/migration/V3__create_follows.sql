-- フォロー（データ設計書 4.6）。自分自身はフォローできない（F-3）。フォローする操作（FN-07）は開発計画書 1-7 で作る
CREATE TABLE follows (
    follower_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    followee_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);

-- フォロワーの一覧と件数（F-6）。データ設計書 6 章
CREATE INDEX follows_followee_id_created_at_idx ON follows (followee_id, created_at DESC);
