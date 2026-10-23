package com.example.raisetimeline.user;

import org.jspecify.annotations.Nullable;

// ユーザーの行（G-5・G-8・G-9）に出すユーザー（機能定義書 3.5 UserSummary）
public record UserSummary(String username, String displayName, String bioFirstLine, @Nullable String iconUrl,
		boolean followedByMe, boolean me) {

	public static UserSummary of(User user, long viewerId, boolean followedByMe, UserIcons icons) {
		return new UserSummary(user.getUsername(), user.getDisplayName(), user.getBio().lines().findFirst().orElse(""),
				icons.url(user), followedByMe, user.getId() == viewerId);
	}

}
