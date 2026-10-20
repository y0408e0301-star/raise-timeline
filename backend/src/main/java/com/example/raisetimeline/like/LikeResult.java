package com.example.raisetimeline.like;

// いいね・取り消しの結果（機能定義書 FN-06 6 章）
public record LikeResult(boolean liked, long likeCount) {
}
