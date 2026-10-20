package com.example.raisetimeline.comment;

import java.time.Instant;

import com.example.raisetimeline.post.PostView;

// コメントを返すときの形（機能定義書 FN-05 6 章）。author は投稿の author と同じ形（機能定義書 3.5）
public record CommentView(long id, PostView.Author author, String body, boolean mine, Instant createdAt) {

	static CommentView of(Comment comment, long viewerId) {
		return new CommentView(comment.getId(), PostView.Author.of(comment.getAuthor()), comment.getBody(),
				comment.isWrittenBy(viewerId), comment.getCreatedAt());
	}

}
