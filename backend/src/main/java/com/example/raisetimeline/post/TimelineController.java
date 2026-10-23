package com.example.raisetimeline.post;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

// タイムラインの API（機能定義書 FN-02 6 章）と、プロフィールの投稿の一覧（FN-09 6 章）。
// 仕様書（OpenAPI）では機能ごとに分けるので、タグはクラスではなく API ごとに付ける
@RestController
class TimelineController {

	private final TimelineService timelineService;

	TimelineController(TimelineService timelineService) {
		this.timelineService = timelineService;
	}

	// tab がない・正しくないときも TAB_INVALID にしたいので、必須にせずサービスで確かめる
	@Operation(operationId = "readTimeline", summary = "タイムライン", tags = "FN-02 タイムライン",
			description = "新しい順に 20 件ずつ。続きは nextCursor を cursor に入れて読む")
	@GetMapping("/api/timeline")
	TimelineResponse read(@AuthenticationPrincipal Jwt jwt,
			@Parameter(required = true, schema = @Schema(allowableValues = { "following", "all" })) @RequestParam(
					required = false) @Nullable String tab,
			@RequestParam(required = false) @Nullable String cursor) {
		return this.timelineService.read(Long.parseLong(jwt.getSubject()), tab, cursor);
	}

	// {username} は大文字・小文字を区別しない。返す形と読み込み方はタイムラインと同じ（PF-2）
	@Operation(operationId = "listUserPosts", summary = "その人の投稿の一覧", tags = "FN-09 プロフィール")
	@GetMapping("/api/users/{username}/posts")
	TimelineResponse byUser(@AuthenticationPrincipal Jwt jwt, @PathVariable String username,
			@RequestParam(required = false) @Nullable String cursor) {
		return this.timelineService.byUser(Long.parseLong(jwt.getSubject()), username, cursor);
	}

}
