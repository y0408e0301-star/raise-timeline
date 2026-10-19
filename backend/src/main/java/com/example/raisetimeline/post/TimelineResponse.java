package com.example.raisetimeline.post;

import java.util.List;

import org.jspecify.annotations.Nullable;

import com.fasterxml.jackson.annotation.JsonInclude;

// タイムラインの 1 回分（機能定義書 FN-02 6 章）。nextCursor は続きがなければ null。
// followingCount は「フォロー中」の最初の 20 件のときだけ返す（M-8 を出すかどうかを画面で決めるため）
public record TimelineResponse(List<PostView> items, @Nullable String nextCursor,
		@JsonInclude(JsonInclude.Include.NON_NULL) @Nullable Long followingCount) {
}
