package com.example.raisetimeline.post;

import java.util.List;

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
import org.springframework.web.multipart.MultipartFile;

// 投稿の API（機能定義書 FN-03 6 章）
@RestController
@RequestMapping("/api/posts")
class PostController {

	private final PostService postService;

	PostController(PostService postService) {
		this.postService = postService;
	}

	// 画像と一緒に送れるよう multipart で受け取る。画像（images）は 0〜4 個で、選んだ順に送る（FN-04 6 章）
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	PostView create(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) @Nullable String body,
			@RequestParam(required = false) @Nullable List<MultipartFile> images) {
		return this.postService.create(userId(jwt), body, (images == null) ? List.of() : images);
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
