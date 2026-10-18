package com.example.raisetimeline.post;

import java.time.Clock;
import java.util.regex.Pattern;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserRepository;

// 投稿・詳細・編集・削除（機能定義書 FN-03）
@Service
class PostService {

	static final int BODY_MAX = 280;

	private static final Pattern NEWLINE = Pattern.compile("\\r\\n?");

	private final PostRepository posts;

	private final UserRepository users;

	private final Clock clock;

	PostService(PostRepository posts, UserRepository users, Clock clock) {
		this.posts = posts;
		this.users = users;
		this.clock = clock;
	}

	@Transactional
	PostView create(long userId, @Nullable String rawBody) {
		// 画像（FN-04）は 1-3 で受け取る。それまでは画像は 0 枚
		String body = validBody(rawBody, 0);
		User author = this.users.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
		Post post = this.posts.save(new Post(author, body, this.clock.instant()));
		return PostView.of(post, userId);
	}

	@Transactional(readOnly = true)
	PostView get(long userId, long postId) {
		return PostView.of(find(postId), userId);
	}

	// 本文だけを変える。投稿日時と並び順は変えない（FN-03 5 章 No.5）
	@Transactional
	PostView edit(long userId, long postId, @Nullable String rawBody) {
		Post post = findOwn(userId, postId);
		post.edit(validBody(rawBody, 0), this.clock.instant());
		return PostView.of(post, userId);
	}

	// 画像・コメント・いいねは外部キーの ON DELETE CASCADE で一緒に消える（FN-03 5 章 No.3）
	@Transactional
	void delete(long userId, long postId) {
		this.posts.delete(findOwn(userId, postId));
	}

	private Post find(long postId) {
		return this.posts.findWithAuthorById(postId).orElseThrow(() -> new ApiException(ErrorCode.POST_NOT_FOUND));
	}

	// ない投稿は 404、他人の投稿は 403（BR-7）
	private Post findOwn(long userId, long postId) {
		Post post = find(postId);
		if (!post.isWrittenBy(userId)) {
			throw new ApiException(ErrorCode.FORBIDDEN);
		}
		return post;
	}

	// 改行を LF にそろえ、前後の空白を取り除いて 0〜280 文字（コードポイント）。画像がなければ 1 文字以上（W-2・W-3、BR-2）。
	// ブラウザは multipart で送るときに改行を CRLF に変えるので、そのまま数えると画面より改行 1 つにつき 1 文字多くなる
	private static String validBody(@Nullable String rawBody, int imageCount) {
		String body = (rawBody == null) ? "" : NEWLINE.matcher(rawBody).replaceAll("\n").strip();
		if (body.codePointCount(0, body.length()) > BODY_MAX) {
			throw new ApiException(ErrorCode.BODY_TOO_LONG, "body");
		}
		if (body.isEmpty() && imageCount == 0) {
			throw new ApiException(ErrorCode.POST_EMPTY, "body");
		}
		return body;
	}

}
