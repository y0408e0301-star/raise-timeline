package com.example.raisetimeline.post;

import java.time.Instant;
import java.util.List;

import org.jspecify.annotations.Nullable;

import com.example.raisetimeline.user.User;

// 投稿を返すときの形（機能定義書 3.5 PostView）
public record PostView(long id, Author author, String body, List<Image> images, long likeCount, long commentCount,
		boolean likedByMe, boolean mine, Instant createdAt, @Nullable Instant editedAt) {

	// いいね（FN-06）は 1-6、コメント（FN-05）は 1-5 で入れる。それまでは 0 件。画像は PostViews が並び順どおりに渡す
	static PostView of(Post post, long viewerId, List<Image> images) {
		return new PostView(post.getId(), Author.of(post.getAuthor()), post.getBody(), images, 0, 0, false,
				post.isWrittenBy(viewerId), post.getCreatedAt(), post.getEditedAt());
	}

	// 投稿者。アイコン（iconUrl）は第 2 版（PF-8〜PF-10）で入れる
	public record Author(String username, String displayName, @Nullable String iconUrl) {

		static Author of(User user) {
			return new Author(user.getUsername(), user.getDisplayName(), null);
		}

	}

	// 画像。url は署名付き URL で、expiresAt を過ぎると使えない（FN-04 I-8）
	public record Image(long id, String url, Instant expiresAt) {
	}

}
