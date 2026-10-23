package com.example.raisetimeline.profile;

import java.time.Instant;

import org.jspecify.annotations.Nullable;

// プロフィール（機能定義書 FN-09 6 章）。件数は表示した時点の値（5 章 No.2）。
// iconUrl はアイコン画像の署名付き URL（15 分）で、設定していなければ null（PF-10）
public record Profile(String username, String displayName, String bio, @Nullable String iconUrl, Instant joinedAt,
		long followingCount, long followerCount, long postCount, boolean followedByMe, boolean me) {
}
