package com.example.raisetimeline.search;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// ユーザー検索の API（機能定義書 FN-08 6 章）。
// /api/users/{username}（プロフィール）とぶつからないよう、/api/users の下には置かない
@RestController
class UserSearchController {

	private final UserSearchService searchService;

	UserSearchController(UserSearchService searchService) {
		this.searchService = searchService;
	}

	@GetMapping("/api/search/users")
	UserSearchResponse search(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) @Nullable String q,
			@RequestParam(required = false) @Nullable String offset) {
		return this.searchService.search(Long.parseLong(jwt.getSubject()), q, offset);
	}

}
