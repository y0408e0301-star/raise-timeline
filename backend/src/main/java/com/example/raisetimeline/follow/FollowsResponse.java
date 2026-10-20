package com.example.raisetimeline.follow;

import java.util.List;

import org.jspecify.annotations.Nullable;

import com.example.raisetimeline.user.UserSummary;

// フォロー中・フォロワーの 1 回分（機能定義書 FN-07 6 章）。nextCursor は続きがなければ null
public record FollowsResponse(List<UserSummary> items, @Nullable String nextCursor) {
}
