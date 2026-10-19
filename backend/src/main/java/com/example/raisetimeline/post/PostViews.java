package com.example.raisetimeline.post;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.ImageStorage.SignedUrl;

// 投稿を PostView にする。画像は投稿ごとに SQL を出さず、まとめて 1 回で取る（FN-02 5.2）。
// 画像の URL は署名付き URL（15 分）にする（FN-04 5 章 No.4）
@Component
class PostViews {

	private final PostImageRepository images;

	private final ImageStorage storage;

	PostViews(PostImageRepository images, ImageStorage storage) {
		this.images = images;
		this.storage = storage;
	}

	PostView of(Post post, long viewerId) {
		return of(List.of(post), viewerId).getFirst();
	}

	List<PostView> of(List<Post> posts, long viewerId) {
		if (posts.isEmpty()) {
			return List.of();
		}
		Map<Long, List<PostView.Image>> imagesByPost = this.images
			.findByPostIdInOrderByPostIdAscSortOrderAsc(posts.stream().map(Post::getId).toList())
			.stream()
			.collect(Collectors.groupingBy(PostImage::getPostId, Collectors.mapping(this::image, Collectors.toList())));
		return posts.stream()
			.map((post) -> PostView.of(post, viewerId, imagesByPost.getOrDefault(post.getId(), List.of())))
			.toList();
	}

	// URL の取り直し（POST /api/images/urls）。削除された画像の ID は結果に入れない（FN-04 6 章）
	List<PostView.Image> images(Collection<Long> imageIds) {
		return this.images.findAllById(imageIds).stream().map(this::image).toList();
	}

	private PostView.Image image(PostImage image) {
		SignedUrl url = this.storage.signedUrl(image.getStorageKey());
		return new PostView.Image(image.getId(), url.url(), url.expiresAt());
	}

}
