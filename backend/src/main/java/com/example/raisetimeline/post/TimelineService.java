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

// タイムライン（機能定義書 FN-02）
@Service
class TimelineService {

	static final int PAGE_SIZE = 20;

	private final PostRepository posts;

	private final FollowRepository follows;

	private final PostViews views;

	TimelineService(PostRepository posts, FollowRepository follows, PostViews views) {
		this.posts = posts;
		this.follows = follows;
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
		List<Post> page = found.subList(0, Math.min(found.size(), PAGE_SIZE));
		String nextCursor = (found.size() > PAGE_SIZE) ? String.valueOf(page.getLast().getId()) : null;
		Long followingCount = (following && cursor == null) ? this.follows.countByFollowerId(userId) : null;
		return new TimelineResponse(this.views.of(page, userId), nextCursor, followingCount);
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
