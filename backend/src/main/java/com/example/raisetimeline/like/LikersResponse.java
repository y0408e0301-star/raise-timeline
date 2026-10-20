package com.example.raisetimeline.like;

import java.util.List;

import org.jspecify.annotations.Nullable;

import com.example.raisetimeline.user.UserSummary;

// いいねした人の 1 回分（機能定義書 FN-06 6 章）。nextCursor は続きがなければ null
public record LikersResponse(List<UserSummary> items, @Nullable String nextCursor, long totalCount) {
}
