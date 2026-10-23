package com.example.raisetimeline.post;

import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.ErrorCode;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

// 画像の URL の取り直し（機能定義書 FN-04 6 章、I-8）。画像はログインしている人なら誰でも見られる（8 章）
@Tag(name = "FN-04 画像")
@RestController
class ImageController {

	static final int IDS_MAX = 50;

	private final PostViews views;

	ImageController(PostViews views) {
		this.views = views;
	}

	// 削除された画像の ID は、エラーにせず結果に入れない
	@Operation(summary = "画像の署名付き URL を取り直す", description = "削除された画像は結果に入らない")
	@PostMapping("/api/images/urls")
	@Transactional(readOnly = true)
	UrlsResponse urls(@RequestBody UrlsRequest request) {
		List<Long> ids = request.imageIds();
		if (ids == null || ids.size() > IDS_MAX) {
			throw new ApiException(ErrorCode.BAD_REQUEST, "imageIds");
		}
		return new UrlsResponse(this.views.images(ids));
	}

	record UrlsRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED,
			description = "画像の ID。50 個まで") @Nullable List<Long> imageIds) {
	}

	record UrlsResponse(List<PostView.Image> items) {
	}

}
