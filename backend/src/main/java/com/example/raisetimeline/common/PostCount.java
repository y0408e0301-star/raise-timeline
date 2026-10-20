package com.example.raisetimeline.common;

// 投稿ごとの件数（コメント数・いいね数）。一覧に出す投稿の分を 1 回の SQL でまとめて数えるときに使う（FN-02 5.2）
public record PostCount(long postId, long count) {
}
