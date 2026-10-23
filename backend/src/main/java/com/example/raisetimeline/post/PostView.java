package com.example.raisetimeline.post;

import java.time.Instant;
import java.util.List;

import org.jspecify.annotations.Nullable;

import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;

// 投稿を返すときの形（機能定義書 3.5 PostView）
public record PostView(long id, Author author, String body, List<Image> images, long likeCount, long commentCount,
		boolean likedByMe, boolean mine, Instant createdAt, @Nullable Instant editedAt) {

	// 画像（並び順どおり）・いいね数・コメント数・自分がいいねしたかは、PostViews が一覧の分をまとめて取って渡す
	static PostView of(Post post, long viewerId, List<Image> images, Counts counts, UserIcons icons) {
		return new PostView(post.getId(), Author.of(post.getAuthor(), icons), post.getBody(), images,
				counts.likeCount(), counts.commentCount(), counts.likedByMe(), post.isWrittenBy(viewerId),
				post.getCreatedAt(), post.getEditedAt());
	}

	record Counts(long likeCount, long commentCount, boolean likedByMe) {
	}

	// 投稿者・コメントした人（機能定義書 3.5）
	public record Author(String username, String displayName, @Nullable String iconUrl) {

		public static Author of(User user, UserIcons icons) {
			return new Author(user.getUsername(), user.getDisplayName(), icons.url(user));
		}

	}

	// 画像。url は署名付き URL で、expiresAt を過ぎると使えない（FN-04 I-8）
	public record Image(long id, String url, Instant expiresAt) {
	}

}
