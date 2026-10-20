package com.example.raisetimeline.post;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.example.raisetimeline.comment.CommentRepository;
import com.example.raisetimeline.common.PostCount;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.ImageStorage.SignedUrl;

// 投稿を PostView にする。画像・コメント数は投稿ごとに SQL を出さず、まとめて 1 回ずつで取る（FN-02 5.2）。
// 画像の URL は署名付き URL（15 分）にする（FN-04 5 章 No.4）
@Component
class PostViews {

	private final PostImageRepository images;

	private final CommentRepository comments;

	private final ImageStorage storage;

	PostViews(PostImageRepository images, CommentRepository comments, ImageStorage storage) {
		this.images = images;
		this.comments = comments;
		this.storage = storage;
	}

	PostView of(Post post, long viewerId) {
		return of(List.of(post), viewerId).getFirst();
	}

	List<PostView> of(List<Post> posts, long viewerId) {
		if (posts.isEmpty()) {
			return List.of();
		}
		List<Long> ids = posts.stream().map(Post::getId).toList();
		Map<Long, List<PostView.Image>> imagesByPost = this.images.findByPostIdInOrderByPostIdAscSortOrderAsc(ids)
			.stream()
			.collect(Collectors.groupingBy(PostImage::getPostId, Collectors.mapping(this::image, Collectors.toList())));
		Map<Long, Long> commentCounts = this.comments.countByPostIds(ids)
			.stream()
			.collect(Collectors.toMap(PostCount::postId, PostCount::count));
		return posts.stream()
			.map((post) -> PostView.of(post, viewerId, imagesByPost.getOrDefault(post.getId(), List.of()),
					commentCounts.getOrDefault(post.getId(), 0L)))
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
