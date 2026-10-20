package com.example.raisetimeline.profile;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.follow.Follow;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserRepository;

// プロフィールの表示（機能定義書 FN-09 第 1 版）
@Service
class ProfileService {

	private final UserRepository users;

	private final FollowRepository follows;

	private final PostRepository posts;

	ProfileService(UserRepository users, FollowRepository follows, PostRepository posts) {
		this.users = users;
		this.follows = follows;
		this.posts = posts;
	}

	// {username} は大文字・小文字を区別しない。返すユーザー ID は登録したときの書き方（5 章 No.1）。
	// 件数はその都度数える（データ設計書 方針 1）
	@Transactional(readOnly = true)
	Profile read(long viewerId, String username) {
		User user = this.users.findByUsername(username).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND));
		long id = user.getId();
		boolean me = id == viewerId;
		boolean followedByMe = !me && this.follows.existsById(new Follow.Key(viewerId, id));
		return new Profile(user.getUsername(), user.getDisplayName(), user.getBio(), null, user.getCreatedAt(),
				this.follows.countByFollowerId(id), this.follows.countByFolloweeId(id), this.posts.countByAuthorId(id),
				followedByMe, me);
	}

}
