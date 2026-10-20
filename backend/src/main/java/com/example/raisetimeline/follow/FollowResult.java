package com.example.raisetimeline.follow;

// フォロー・解除の結果（機能定義書 FN-07 6 章）。followerCount は相手のフォロワー数
public record FollowResult(boolean following, long followerCount) {
}
