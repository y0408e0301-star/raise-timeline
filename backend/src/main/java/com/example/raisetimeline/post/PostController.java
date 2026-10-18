package com.example.raisetimeline.post;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// 投稿の API（機能定義書 FN-03 6 章）
@RestController
@RequestMapping("/api/posts")
class PostController {

	private final PostService postService;

	PostController(PostService postService) {
		this.postService = postService;
	}

	// 画像と一緒に送れるよう multipart で受け取る。画像（images）は 1-3 で受け取る
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	PostView create(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) @Nullable String body) {
		return this.postService.create(userId(jwt), body);
	}

	@GetMapping("/{id}")
	PostView get(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return this.postService.get(userId(jwt), id);
	}

	@PatchMapping("/{id}")
	PostView edit(@AuthenticationPrincipal Jwt jwt, @PathVariable long id, @RequestBody EditRequest request) {
		return this.postService.edit(userId(jwt), id, request.body());
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		this.postService.delete(userId(jwt), id);
	}

	// JWT の sub にはユーザーの ID（users.id）が入っている（TokenService）
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	record EditRequest(@Nullable String body) {
	}

}
