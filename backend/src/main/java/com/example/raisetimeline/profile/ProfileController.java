package com.example.raisetimeline.profile;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

// プロフィールの API（機能定義書 FN-09 6 章）。その人の投稿の一覧は TimelineController。
// 自分のプロフィールを変える API は URL にユーザー ID を入れない（/api/me）。ほかの人のものを変えられないようにするため
@Tag(name = "FN-09 プロフィール")
@RestController
class ProfileController {

	private final ProfileService profileService;

	ProfileController(ProfileService profileService) {
		this.profileService = profileService;
	}

	@Operation(operationId = "readProfile", summary = "プロフィール")
	@GetMapping("/api/users/{username}")
	Profile read(@AuthenticationPrincipal Jwt jwt, @PathVariable String username) {
		return this.profileService.read(userId(jwt), username);
	}

	@Operation(operationId = "editProfile", summary = "自分の表示名と自己紹介を変える")
	@PatchMapping("/api/me/profile")
	Profile edit(@AuthenticationPrincipal Jwt jwt, @RequestBody EditRequest request) {
		return this.profileService.edit(userId(jwt), request.displayName(), request.bio());
	}

	// アイコン画像（icon）は 1 個。形式はファイルの中身で確かめる（4 章）
	@Operation(summary = "アイコン画像を差し替える", description = "1 枚。5MB まで、JPEG・PNG・WebP")
	@PutMapping(path = "/api/me/icon", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	Profile changeIcon(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) @Nullable MultipartFile icon) {
		return this.profileService.changeIcon(userId(jwt), icon);
	}

	@Operation(summary = "アイコン画像を外す")
	@DeleteMapping("/api/me/icon")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeIcon(@AuthenticationPrincipal Jwt jwt) {
		this.profileService.removeIcon(userId(jwt));
	}

	// JWT の sub にはユーザーの ID（users.id）が入っている（TokenService）
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	// 仕様書（OpenAPI）では record の名前が型の名前になるので、PostController の EditRequest と分ける
	@Schema(name = "EditProfileRequest")
	record EditRequest(
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED,
					description = "前後の空白を除いて 1〜30 文字（PF-6）") @Nullable String displayName,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED,
					description = "改行を LF にそろえ、前後の空白を除いて 160 文字まで。空でもよい（PF-7）") @Nullable String bio) {
	}

}
