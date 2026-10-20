package com.example.raisetimeline.comment;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// コメントの API（機能定義書 FN-05 6 章）
@RestController
class CommentController {

	private final CommentService commentService;

	CommentController(CommentService commentService) {
		this.commentService = commentService;
	}

	@GetMapping("/api/posts/{postId}/comments")
	CommentsResponse list(@AuthenticationPrincipal Jwt jwt, @PathVariable long postId,
			@RequestParam(required = false) @Nullable String cursor) {
		return this.commentService.list(userId(jwt), postId, cursor);
	}

	@PostMapping("/api/posts/{postId}/comments")
	@ResponseStatus(HttpStatus.CREATED)
	CommentView create(@AuthenticationPrincipal Jwt jwt, @PathVariable long postId,
			@RequestBody CreateRequest request) {
		return this.commentService.create(userId(jwt), postId, request.body());
	}

	@DeleteMapping("/api/comments/{commentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable long commentId) {
		this.commentService.delete(userId(jwt), commentId);
	}

	// JWT の sub にはユーザーの ID（users.id）が入っている（TokenService）
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	record CreateRequest(@Nullable String body) {
	}

}
