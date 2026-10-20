package com.example.raisetimeline.comment;

import java.util.List;

import org.jspecify.annotations.Nullable;

// コメントの 1 回分（機能定義書 FN-05 6 章）。nextCursor は続きがなければ null
public record CommentsResponse(List<CommentView> items, @Nullable String nextCursor) {
}
