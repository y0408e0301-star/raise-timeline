package com.example.raisetimeline.post;

import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.Cursors;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.user.UserRepository;

// タイムライン（機能定義書 FN-02）
@Service
class TimelineService {

	static final int PAGE_SIZE = 20;

	private final PostRepository posts;

	private final FollowRepository follows;

	private final UserRepository users;

	private final PostViews views;

	TimelineService(PostRepository posts, FollowRepository follows, UserRepository users, PostViews views) {
		this.posts = posts;
		this.follows = follows;
		this.users = users;
		this.views = views;
	}

	// 21 件取って、21 件目があれば続きがある（nextCursor は 20 件目の ID）。
	// ID は新しい投稿ほど大きいので、途中で投稿が増えても重複・抜けは出ない（T-7）
	@Transactional(readOnly = true)
	TimelineResponse read(long userId, @Nullable String tab, @Nullable String cursor) {
		boolean following = isFollowing(tab);
		long before = (cursor == null) ? Long.MAX_VALUE : Cursors.parseId(cursor);
		Limit limit = Limit.of(PAGE_SIZE + 1);
		List<Post> found = following ? this.posts.findFollowingBefore(userId, before, limit)
				: this.posts.findAllBefore(before, limit);
		Long followingCount = (following && cursor == null) ? this.follows.countByFollowerId(userId) : null;
		return page(found, userId, followingCount);
	}

	// username の投稿（G-6 の投稿の一覧。PF-2）。読み込み方はタイムラインと同じ
	@Transactional(readOnly = true)
	TimelineResponse byUser(long viewerId, String username, @Nullable String cursor) {
		long before = (cursor == null) ? Long.MAX_VALUE : Cursors.parseId(cursor);
		long authorId = this.users.findByUsername(username)
			.orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND))
			.getId();
		return page(this.posts.findByAuthorBefore(authorId, before, Limit.of(PAGE_SIZE + 1)), viewerId, null);
	}

	private TimelineResponse page(List<Post> found, long viewerId, @Nullable Long followingCount) {
		List<Post> page = found.subList(0, Math.min(found.size(), PAGE_SIZE));
		String nextCursor = (found.size() > PAGE_SIZE) ? String.valueOf(page.getLast().getId()) : null;
		return new TimelineResponse(this.views.of(page, viewerId), nextCursor, followingCount);
	}

	private static boolean isFollowing(@Nullable String tab) {
		if ("following".equals(tab)) {
			return true;
		}
		if ("all".equals(tab)) {
			return false;
		}
		throw new ApiException(ErrorCode.TAB_INVALID, "tab");
	}

}
