package com.example.raisetimeline.user;

import org.jspecify.annotations.Nullable;

// ユーザーの行（G-5・G-8・G-9）に出すユーザー（機能定義書 3.5 UserSummary）。
// アイコン（iconUrl）は第 2 版（PF-8〜PF-10）で入れる
public record UserSummary(String username, String displayName, String bioFirstLine, @Nullable String iconUrl,
		boolean followedByMe, boolean me) {

	public static UserSummary of(User user, long viewerId, boolean followedByMe) {
		return new UserSummary(user.getUsername(), user.getDisplayName(), user.getBio().lines().findFirst().orElse(""),
				null, followedByMe, user.getId() == viewerId);
	}

}
