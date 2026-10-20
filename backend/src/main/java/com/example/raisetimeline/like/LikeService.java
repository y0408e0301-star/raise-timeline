package com.example.raisetimeline.like;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.jspecify.annotations.Nullable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.common.TimeCursor;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.user.UserSummary;

// いいね（機能定義書 FN-06）
@Service
class LikeService {

	static final int PAGE_SIZE = 20;

	private final LikeRepository likes;

	private final PostRepository posts;

	private final FollowRepository follows;

	private final Clock clock;

	LikeService(LikeRepository likes, PostRepository posts, FollowRepository follows, Clock clock) {
		this.likes = likes;
		this.posts = posts;
		this.follows = follows;
		this.clock = clock;
	}

	// 何回送っても同じ結果になる（冪等。5 章 No.2）。likeCount はほかの人の操作も含めた最新の数
	@Transactional
	LikeResult like(long userId, long postId) {
		requirePost(postId);
		try {
			// PostgreSQL の timestamptz はマイクロ秒までなので、cursor の日時と食い違わないようそろえる
			this.likes.insertIfAbsent(userId, postId, this.clock.instant().truncatedTo(ChronoUnit.MICROS));
		}
		catch (DataIntegrityViolationException ex) {
			// 確かめた後で投稿が削除された（外部キーの制約に引っかかった）
			throw new ApiException(ErrorCode.POST_NOT_FOUND);
		}
		return new LikeResult(true, this.likes.countByPostId(postId));
	}

	@Transactional
	LikeResult unlike(long userId, long postId) {
		requirePost(postId);
		this.likes.deleteByUserIdAndPostId(userId, postId);
		return new LikeResult(false, this.likes.countByPostId(postId));
	}

	// 21 件取って、21 件目があれば続きがある（nextCursor は 20 件目の日時と user_id）。totalCount は G-5 の見出しに使う
	@Transactional(readOnly = true)
	LikersResponse likers(long userId, long postId, @Nullable String cursor) {
		// cursor は「いいねした日時_user_id」
		TimeCursor after = TimeCursor.parse(cursor);
		requirePost(postId);
		List<Liker> found = this.likes.findLikersBefore(postId, after.at(), after.id(), Limit.of(PAGE_SIZE + 1));
		List<Liker> page = found.subList(0, Math.min(found.size(), PAGE_SIZE));
		String nextCursor = (found.size() > PAGE_SIZE) ? cursorOf(page.getLast()) : null;
		Set<Long> followed = new HashSet<>(
				this.follows.findFolloweeIds(userId, page.stream().map((liker) -> liker.user().getId()).toList()));
		List<UserSummary> items = page.stream()
			.map((liker) -> UserSummary.of(liker.user(), userId, followed.contains(liker.user().getId())))
			.toList();
		return new LikersResponse(items, nextCursor, this.likes.countByPostId(postId));
	}

	private static String cursorOf(Liker liker) {
		return TimeCursor.format(liker.likedAt(), liker.user().getId());
	}

	private void requirePost(long postId) {
		if (!this.posts.existsById(postId)) {
			throw new ApiException(ErrorCode.POST_NOT_FOUND);
		}
	}

}
