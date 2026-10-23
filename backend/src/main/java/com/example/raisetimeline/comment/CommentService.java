package com.example.raisetimeline.comment;

import java.time.Clock;
import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.BodyText;
import com.example.raisetimeline.common.Cursors;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserRepository;

// コメント（機能定義書 FN-05）
@Service
class CommentService {

	static final int PAGE_SIZE = 50;

	private final CommentRepository comments;

	private final PostRepository posts;

	private final UserRepository users;

	private final UserIcons icons;

	private final Clock clock;

	CommentService(CommentRepository comments, PostRepository posts, UserRepository users, UserIcons icons,
			Clock clock) {
		this.comments = comments;
		this.posts = posts;
		this.users = users;
		this.icons = icons;
		this.clock = clock;
	}

	// 51 件取って、51 件目があれば続きがある（nextCursor は 50 件目の ID）。
	// ID は新しいコメントほど大きいので、途中でコメントが増えても重複・抜けは出ない（5 章 No.1）
	@Transactional(readOnly = true)
	CommentsResponse list(long userId, long postId, @Nullable String cursor) {
		long after = (cursor == null) ? 0 : Cursors.parseId(cursor);
		requirePost(postId);
		List<Comment> found = this.comments.findAfter(postId, after, Limit.of(PAGE_SIZE + 1));
		List<Comment> page = found.subList(0, Math.min(found.size(), PAGE_SIZE));
		String nextCursor = (found.size() > PAGE_SIZE) ? String.valueOf(page.getLast().getId()) : null;
		return new CommentsResponse(
				page.stream().map((comment) -> CommentView.of(comment, userId, this.icons)).toList(), nextCursor);
	}

	// 本文は投稿と同じ扱いで、トリム後 1〜280 文字（C-2、5 章 No.2）
	@Transactional
	CommentView create(long userId, long postId, @Nullable String rawBody) {
		String body = BodyText.normalize(rawBody);
		if (body.isEmpty() || BodyText.isTooLong(body)) {
			throw new ApiException(ErrorCode.COMMENT_INVALID, "body");
		}
		requirePost(postId);
		User author = this.users.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
		try {
			return CommentView.of(this.comments.save(new Comment(postId, author, body, this.clock.instant())), userId,
					this.icons);
		}
		catch (DataIntegrityViolationException ex) {
			// 確かめた後で投稿が削除された（外部キーの制約に引っかかった）
			throw new ApiException(ErrorCode.POST_NOT_FOUND);
		}
	}

	// 自分のコメントだけを削除できる。投稿者でも、ほかの人のコメントは削除できない（C-5、BR-7）
	@Transactional
	void delete(long userId, long commentId) {
		Comment comment = this.comments.findWithAuthorById(commentId)
			.orElseThrow(() -> new ApiException(ErrorCode.COMMENT_NOT_FOUND));
		if (!comment.isWrittenBy(userId)) {
			throw new ApiException(ErrorCode.FORBIDDEN);
		}
		this.comments.delete(comment);
	}

	private void requirePost(long postId) {
		if (!this.posts.existsById(postId)) {
			throw new ApiException(ErrorCode.POST_NOT_FOUND);
		}
	}

}
