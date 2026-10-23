package com.example.raisetimeline.search;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

// ユーザー検索の API（機能定義書 FN-08 6 章）。
// /api/users/{username}（プロフィール）とぶつからないよう、/api/users の下には置かない
@Tag(name = "FN-08 ユーザー検索")
@RestController
class UserSearchController {

	private final UserSearchService searchService;

	UserSearchController(UserSearchService searchService) {
		this.searchService = searchService;
	}

	@Operation(operationId = "searchUsers", summary = "ユーザーを探す", description = "ユーザー ID か表示名の部分一致。20 件ずつ、1000 件まで")
	@GetMapping("/api/search/users")
	UserSearchResponse search(@AuthenticationPrincipal Jwt jwt,
			@Parameter(required = true,
					description = "前後の空白を除いて 1〜30 文字") @RequestParam(required = false) @Nullable String q,
			@Parameter(description = "続きを読むときに、前の結果の nextOffset を入れる") @RequestParam(
					required = false) @Nullable String offset) {
		return this.searchService.search(Long.parseLong(jwt.getSubject()), q, offset);
	}

}
