package com.example.raisetimeline.search;

import java.util.List;

import org.jspecify.annotations.Nullable;

import com.example.raisetimeline.user.UserSummary;

// ユーザー検索の 1 回分（機能定義書 FN-08 6 章）。nextOffset は続きがなければ null
public record UserSearchResponse(List<UserSummary> items, @Nullable Integer nextOffset) {
}
