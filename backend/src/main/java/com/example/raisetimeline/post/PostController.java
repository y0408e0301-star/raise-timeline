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

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

// 投稿の API（機能定義書 FN-03 6 章）
@Tag(name = "FN-03 投稿")
@RestController
@RequestMapping("/api/posts")
class PostController {

	private final PostService postService;

	PostController(PostService postService) {
		this.postService = postService;
	}

	// 画像と一緒に送れるよう multipart で受け取る。画像（images）は 0〜4 個で、選んだ順に送る（FN-04 6 章）
	@Operation(operationId = "createPost", summary = "投稿する",
			description = "本文（改行を LF にそろえ、前後の空白を除いて 280 文字まで）と画像（0〜4 枚。1 枚 5MB まで、JPEG・PNG・GIF・WebP）。本文と画像のどちらかは必要")
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	PostView create(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) @Nullable String body,
			@RequestParam(required = false) @Nullable List<MultipartFile> images) {
		return this.postService.create(userId(jwt), body, (images == null) ? List.of() : images);
	}

	@Operation(operationId = "getPost", summary = "投稿の詳細")
	@GetMapping("/{id}")
	PostView get(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return this.postService.get(userId(jwt), id);
	}

	@Operation(operationId = "editPost", summary = "投稿の本文を編集する", description = "自分の投稿だけ。画像は変えられない")
	@PatchMapping("/{id}")
	PostView edit(@AuthenticationPrincipal Jwt jwt, @PathVariable long id, @RequestBody EditRequest request) {
		return this.postService.edit(userId(jwt), id, request.body());
	}

	@Operation(operationId = "deletePost", summary = "投稿を削除する", description = "自分の投稿だけ。画像・コメント・いいねも消える")
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		this.postService.delete(userId(jwt), id);
	}

	// JWT の sub にはユーザーの ID（users.id）が入っている（TokenService）
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	// 仕様書（OpenAPI）では record の名前が型の名前になるので、ProfileController の EditRequest と分ける
	@Schema(name = "EditPostRequest")
	record EditRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED,
			description = "改行を LF にそろえ、前後の空白を除いて 280 文字まで（W-2）") @Nullable String body) {
	}

}
