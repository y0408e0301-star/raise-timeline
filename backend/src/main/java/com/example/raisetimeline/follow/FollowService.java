package com.example.raisetimeline.follow;

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
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserRepository;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserSummary;

// フォロー（機能定義書 FN-07）
@Service
class FollowService {

	static final int PAGE_SIZE = 20;

	private final FollowRepository follows;

	private final UserRepository users;

	private final UserIcons icons;

	private final Clock clock;

	FollowService(FollowRepository follows, UserRepository users, UserIcons icons, Clock clock) {
		this.follows = follows;
		this.users = users;
		this.icons = icons;
		this.clock = clock;
	}

	// 何回送っても同じ結果になる（冪等。5 章 No.2）。followerCount はほかの人の操作も含めた最新の数
	@Transactional
	FollowResult follow(long userId, String username) {
		User target = requireUser(username);
		if (target.getId() == userId) {
			throw new ApiException(ErrorCode.CANNOT_FOLLOW_SELF);
		}
		try {
			// PostgreSQL の timestamptz はマイクロ秒までなので、cursor の日時と食い違わないようそろえる
			this.follows.insertIfAbsent(userId, target.getId(), this.clock.instant().truncatedTo(ChronoUnit.MICROS));
		}
		catch (DataIntegrityViolationException ex) {
			// 確かめた後で相手が消えた（外部キーの制約に引っかかった）
			throw new ApiException(ErrorCode.USER_NOT_FOUND);
		}
		return new FollowResult(true, this.follows.countByFolloweeId(target.getId()));
	}

	@Transactional
	FollowResult unfollow(long userId, String username) {
		User target = requireUser(username);
		this.follows.deleteByFollowerIdAndFolloweeId(userId, target.getId());
		return new FollowResult(false, this.follows.countByFolloweeId(target.getId()));
	}

	// username がフォローしている人。cursor は「フォローした日時_相手の ID」
	@Transactional(readOnly = true)
	FollowsResponse following(long viewerId, String username, @Nullable String cursor) {
		TimeCursor after = TimeCursor.parse(cursor);
		long userId = requireUser(username).getId();
		return page(viewerId,
				this.follows.findFollowingBefore(userId, after.at(), after.id(), Limit.of(PAGE_SIZE + 1)));
	}

	// username をフォローしている人
	@Transactional(readOnly = true)
	FollowsResponse followers(long viewerId, String username, @Nullable String cursor) {
		TimeCursor after = TimeCursor.parse(cursor);
		long userId = requireUser(username).getId();
		return page(viewerId,
				this.follows.findFollowersBefore(userId, after.at(), after.id(), Limit.of(PAGE_SIZE + 1)));
	}

	// 21 件取って、21 件目があれば続きがある（nextCursor は 20 件目の日時と相手の ID）。
	// 見ている人（viewerId）がフォローしているかは、20 件分を 1 回でまとめて取る
	private FollowsResponse page(long viewerId, List<FollowedUser> found) {
		List<FollowedUser> page = found.subList(0, Math.min(found.size(), PAGE_SIZE));
		String nextCursor = (found.size() > PAGE_SIZE)
				? TimeCursor.format(page.getLast().followedAt(), page.getLast().user().getId()) : null;
		Set<Long> followed = new HashSet<>(
				this.follows.findFolloweeIds(viewerId, page.stream().map((row) -> row.user().getId()).toList()));
		List<UserSummary> items = page.stream()
			.map((row) -> UserSummary.of(row.user(), viewerId, followed.contains(row.user().getId()), this.icons))
			.toList();
		return new FollowsResponse(items, nextCursor);
	}

	private User requireUser(String username) {
		return this.users.findByUsername(username).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
	}

}
