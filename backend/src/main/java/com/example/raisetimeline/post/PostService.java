package com.example.raisetimeline.post;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.example.raisetimeline.common.ApiException;
import com.example.raisetimeline.common.BodyText;
import com.example.raisetimeline.common.ErrorCode;
import com.example.raisetimeline.storage.ImageFormat;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.StorageDeleter;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserRepository;

// 投稿・詳細・編集・削除（機能定義書 FN-03）と、投稿に添える画像（FN-04）
@Service
class PostService {

	private static final Logger log = LoggerFactory.getLogger(PostService.class);

	static final int IMAGES_MAX = 4;

	// 1 枚 5MB まで（FN-04 4 章）
	static final long IMAGE_BYTES_MAX = 5L * 1024 * 1024;

	private final PostRepository posts;

	private final PostImageRepository images;

	private final UserRepository users;

	private final PostViews views;

	private final ImageStorage storage;

	private final StorageDeleter deleter;

	private final TransactionTemplate transaction;

	private final Clock clock;

	PostService(PostRepository posts, PostImageRepository images, UserRepository users, PostViews views,
			ImageStorage storage, StorageDeleter deleter, TransactionTemplate transaction, Clock clock) {
		this.posts = posts;
		this.images = images;
		this.users = users;
		this.views = views;
		this.storage = storage;
		this.deleter = deleter;
		this.transaction = transaction;
		this.clock = clock;
	}

	// 画像を S3 に置いてから、投稿と画像の行を 1 つのトランザクションで保存する。
	// どこかで失敗したら全部やめる（データ設計書 BR-4）。S3 との通信の間はデータベースのトランザクションを開かない
	PostView create(long userId, @Nullable String rawBody, List<MultipartFile> files) {
		List<Upload> uploads = validImages(files);
		String body = validBody(rawBody, uploads.size());
		User author = this.users.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
		List<String> keys = put(uploads);
		boolean saved = false;
		try {
			Post post = this.transaction.execute((status) -> {
				Post created = this.posts.save(new Post(author, body, this.clock.instant()));
				for (int i = 0; i < uploads.size(); i++) {
					Upload upload = uploads.get(i);
					this.images.save(new PostImage(created.getId(), keys.get(i), upload.format().contentType(),
							upload.data().length, i));
				}
				return created;
			});
			saved = true;
			return this.views.of(post, userId);
		}
		finally {
			// データベースへの保存に失敗したら、S3 に置いた画像を消す
			if (!saved) {
				this.deleter.deleteOrRecord(keys);
			}
		}
	}

	@Transactional(readOnly = true)
	PostView get(long userId, long postId) {
		return this.views.of(find(postId), userId);
	}

	// 本文だけを変える。画像・投稿日時・並び順は変えない（FN-03 5 章 No.5）。画像があれば本文は 0 文字でもよい（BR-2）
	@Transactional
	PostView edit(long userId, long postId, @Nullable String rawBody) {
		Post post = findOwn(userId, postId);
		post.edit(validBody(rawBody, (int) this.images.countByPostId(postId)), this.clock.instant());
		return this.views.of(post, userId);
	}

	// 先にデータベースから消し（画像・コメント・いいねは ON DELETE CASCADE で一緒に消える。FN-03 5 章 No.3）、
	// その後で S3 のファイルを消す。消せなかったファイルは記録して後で消す（データ設計書 BR-5）
	void delete(long userId, long postId) {
		List<String> keys = this.transaction.execute((status) -> {
			Post post = findOwn(userId, postId);
			List<String> found = this.images.findByPostIdOrderBySortOrderAsc(postId)
				.stream()
				.map(PostImage::getStorageKey)
				.toList();
			this.posts.delete(post);
			return found;
		});
		this.deleter.deleteOrRecord(keys);
	}

	private Post find(long postId) {
		return this.posts.findWithAuthorById(postId).orElseThrow(() -> new ApiException(ErrorCode.POST_NOT_FOUND));
	}

	// ない投稿は 404、他人の投稿は 403（BR-7）
	private Post findOwn(long userId, long postId) {
		Post post = find(postId);
		if (!post.isWrittenBy(userId)) {
			throw new ApiException(ErrorCode.FORBIDDEN);
		}
		return post;
	}

	// 枚数 → 大きさ → 形式の順に確かめる（FN-04 4 章）。形式はファイルの先頭のバイトで決め、拡張子・Content-Type は見ない
	private static List<Upload> validImages(List<MultipartFile> files) {
		if (files.size() > IMAGES_MAX) {
			throw new ApiException(ErrorCode.TOO_MANY_IMAGES, "images");
		}
		List<Upload> uploads = new ArrayList<>();
		for (MultipartFile file : files) {
			if (file.getSize() > IMAGE_BYTES_MAX) {
				throw new ApiException(ErrorCode.IMAGE_TOO_LARGE, "images");
			}
			byte[] data = bytes(file);
			ImageFormat format = ImageFormat.detect(data)
				.orElseThrow(() -> new ApiException(ErrorCode.IMAGE_TYPE_INVALID, "images"));
			uploads.add(new Upload(format, data));
		}
		return uploads;
	}

	// 途中で失敗したら、それまでに置いた画像を消して IMAGE_UPLOAD_FAILED（FN-04 3.1）
	private List<String> put(List<Upload> uploads) {
		List<String> keys = new ArrayList<>();
		try {
			for (Upload upload : uploads) {
				String key = ImageStorage.newKey("posts", upload.format());
				this.storage.put(key, upload.format(), upload.data());
				keys.add(key);
			}
			return keys;
		}
		catch (RuntimeException ex) {
			log.error("画像を S3 に置けませんでした", ex);
			this.deleter.deleteOrRecord(keys);
			throw new ApiException(ErrorCode.IMAGE_UPLOAD_FAILED);
		}
	}

	private static byte[] bytes(MultipartFile file) {
		try {
			return file.getBytes();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	// 改行を LF にそろえ、前後の空白を取り除いて 0〜280 文字（コードポイント）。画像がなければ 1 文字以上（W-2・W-3、BR-2）
	private static String validBody(@Nullable String rawBody, int imageCount) {
		String body = BodyText.normalize(rawBody);
		if (BodyText.isTooLong(body)) {
			throw new ApiException(ErrorCode.BODY_TOO_LONG, "body");
		}
		if (body.isEmpty() && imageCount == 0) {
			throw new ApiException(ErrorCode.POST_EMPTY, "body");
		}
		return body;
	}

	private record Upload(ImageFormat format, byte[] data) {
	}

}
