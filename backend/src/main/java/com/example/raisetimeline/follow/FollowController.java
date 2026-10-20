package com.example.raisetimeline.follow;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// フォローの API（機能定義書 FN-07 6 章）。{username} は大文字・小文字を区別しない
@RestController
@RequestMapping("/api/users/{username}")
class FollowController {

	private final FollowService followService;

	FollowController(FollowService followService) {
		this.followService = followService;
	}

	@PutMapping("/follow")
	FollowResult follow(@AuthenticationPrincipal Jwt jwt, @PathVariable String username) {
		return this.followService.follow(userId(jwt), username);
	}

	@DeleteMapping("/follow")
	FollowResult unfollow(@AuthenticationPrincipal Jwt jwt, @PathVariable String username) {
		return this.followService.unfollow(userId(jwt), username);
	}

	@GetMapping("/following")
	FollowsResponse following(@AuthenticationPrincipal Jwt jwt, @PathVariable String username,
			@RequestParam(required = false) @Nullable String cursor) {
		return this.followService.following(userId(jwt), username, cursor);
	}

	@GetMapping("/followers")
	FollowsResponse followers(@AuthenticationPrincipal Jwt jwt, @PathVariable String username,
			@RequestParam(required = false) @Nullable String cursor) {
		return this.followService.followers(userId(jwt), username, cursor);
	}

	// JWT の sub にはユーザーの ID（users.id）が入っている（TokenService）
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

}
