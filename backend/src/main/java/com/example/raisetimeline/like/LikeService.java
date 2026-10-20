package com.example.raisetimeline.like;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.jspecify.annotations.Nullable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.user.UserSummary;

// いいね（機能定義書 FN-06）
@Service
class LikeService {

	static final int PAGE_SIZE = 20;

	// 最初の 20 件を読むときの cursor の代わり。どのいいねよりも後の日時
	private static final Instant LATEST = Instant.parse("9999-12-31T00:00:00Z");

	// 「いいねした日時（エポックからのマイクロ秒）_user_id」
	private static final Pattern CURSOR = Pattern.compile("([0-9]{1,18})_([0-9]{1,18})");

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
		Instant likedAt = LATEST;
		long before = Long.MAX_VALUE;
		if (cursor != null) {
			Matcher matcher = CURSOR.matcher(cursor);
			if (!matcher.matches()) {
				throw new ApiException(ErrorCode.CURSOR_INVALID, "cursor");
			}
			likedAt = Instant.EPOCH.plus(Long.parseLong(matcher.group(1)), ChronoUnit.MICROS);
			before = Long.parseLong(matcher.group(2));
		}
		requirePost(postId);
		List<Liker> found = this.likes.findLikersBefore(postId, likedAt, before, Limit.of(PAGE_SIZE + 1));
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
		return ChronoUnit.MICROS.between(Instant.EPOCH, liker.likedAt()) + "_" + liker.user().getId();
	}

	private void requirePost(long postId) {
		if (!this.posts.existsById(postId)) {
			throw new ApiException(ErrorCode.POST_NOT_FOUND);
		}
	}

}
