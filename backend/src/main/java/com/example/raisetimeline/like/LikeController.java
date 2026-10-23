package com.example.raisetimeline.like;

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

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

// いいねの API（機能定義書 FN-06 6 章）
@Tag(name = "FN-06 いいね")
@RestController
@RequestMapping("/api/posts/{postId}")
class LikeController {

	private final LikeService likeService;

	LikeController(LikeService likeService) {
		this.likeService = likeService;
	}

	@Operation(summary = "いいねする", description = "何回送っても同じ結果になる")
	@PutMapping("/like")
	LikeResult like(@AuthenticationPrincipal Jwt jwt, @PathVariable long postId) {
		return this.likeService.like(userId(jwt), postId);
	}

	@Operation(summary = "いいねを取り消す", description = "何回送っても同じ結果になる")
	@DeleteMapping("/like")
	LikeResult unlike(@AuthenticationPrincipal Jwt jwt, @PathVariable long postId) {
		return this.likeService.unlike(userId(jwt), postId);
	}

	@Operation(summary = "いいねした人の一覧", description = "新しくいいねした順に 20 件ずつ")
	@GetMapping("/likes")
	LikersResponse likers(@AuthenticationPrincipal Jwt jwt, @PathVariable long postId,
			@RequestParam(required = false) @Nullable String cursor) {
		return this.likeService.likers(userId(jwt), postId, cursor);
	}

	// JWT の sub にはユーザーの ID（users.id）が入っている（TokenService）
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

}
