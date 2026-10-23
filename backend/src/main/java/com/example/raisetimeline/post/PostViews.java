package com.example.raisetimeline.post;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.example.raisetimeline.comment.CommentRepository;
import com.example.raisetimeline.common.PostCount;
import com.example.raisetimeline.like.LikeRepository;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.ImageStorage.SignedUrl;
import com.example.raisetimeline.user.UserIcons;

// 投稿を PostView にする。画像・いいね・コメント数は投稿ごとに SQL を出さず、まとめて 1 回ずつで取る（FN-02 5.2）。
// 画像の URL は署名付き URL（15 分）にする（FN-04 5 章 No.4）
@Component
class PostViews {

	private final PostImageRepository images;

	private final CommentRepository comments;

	private final LikeRepository likes;

	private final ImageStorage storage;

	private final UserIcons icons;

	PostViews(PostImageRepository images, CommentRepository comments, LikeRepository likes, ImageStorage storage,
			UserIcons icons) {
		this.images = images;
		this.comments = comments;
		this.likes = likes;
		this.storage = storage;
		this.icons = icons;
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
		Map<Long, Long> commentCounts = countMap(this.comments.countByPostIds(ids));
		Map<Long, Long> likeCounts = countMap(this.likes.countByPostIds(ids));
		Set<Long> liked = Set.copyOf(this.likes.findLikedPostIds(viewerId, ids));
		return posts.stream().map((post) -> {
			long id = post.getId();
			PostView.Counts counts = new PostView.Counts(likeCounts.getOrDefault(id, 0L),
					commentCounts.getOrDefault(id, 0L), liked.contains(id));
			return PostView.of(post, viewerId, imagesByPost.getOrDefault(id, List.of()), counts, this.icons);
		}).toList();
	}

	private static Map<Long, Long> countMap(List<PostCount> counts) {
		return counts.stream().collect(Collectors.toMap(PostCount::postId, PostCount::count));
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
