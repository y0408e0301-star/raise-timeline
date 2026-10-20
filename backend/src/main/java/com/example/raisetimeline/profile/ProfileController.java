package com.example.raisetimeline.profile;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

// プロフィールの API（機能定義書 FN-09 6 章）。その人の投稿の一覧は TimelineController
@RestController
class ProfileController {

	private final ProfileService profileService;

	ProfileController(ProfileService profileService) {
		this.profileService = profileService;
	}

	@GetMapping("/api/users/{username}")
	Profile read(@AuthenticationPrincipal Jwt jwt, @PathVariable String username) {
		return this.profileService.read(Long.parseLong(jwt.getSubject()), username);
	}

}
