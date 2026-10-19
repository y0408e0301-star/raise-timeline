package com.example.raisetimeline.post;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// タイムラインの API（機能定義書 FN-02 6 章）
@RestController
class TimelineController {

	private final TimelineService timelineService;

	TimelineController(TimelineService timelineService) {
		this.timelineService = timelineService;
	}

	// tab がない・正しくないときも TAB_INVALID にしたいので、必須にせずサービスで確かめる
	@GetMapping("/api/timeline")
	TimelineResponse read(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) @Nullable String tab,
			@RequestParam(required = false) @Nullable String cursor) {
		return this.timelineService.read(Long.parseLong(jwt.getSubject()), tab, cursor);
	}

}
