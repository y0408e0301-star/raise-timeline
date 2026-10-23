package com.example.raisetimeline.profile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
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
import com.example.raisetimeline.follow.Follow;
import com.example.raisetimeline.follow.FollowRepository;
import com.example.raisetimeline.post.PostRepository;
import com.example.raisetimeline.storage.ImageFormat;
import com.example.raisetimeline.storage.ImageStorage;
import com.example.raisetimeline.storage.StorageDeleter;
import com.example.raisetimeline.user.DisplayNames;
import com.example.raisetimeline.user.User;
import com.example.raisetimeline.user.UserIcons;
import com.example.raisetimeline.user.UserRepository;

// プロフィールの表示（機能定義書 FN-09 第 1 版）と編集（第 2 版。表示名・自己紹介・アイコン画像）
@Service
class ProfileService {

	private static final Logger log = LoggerFactory.getLogger(ProfileService.class);

	// 自己紹介の上限（コードポイントで数える。PF-6）
	static final int BIO_MAX = 160;

	// アイコン画像は 5MB まで（FN-09 4 章）
	static final long ICON_BYTES_MAX = 5L * 1024 * 1024;

	private final UserRepository users;

	private final FollowRepository follows;

	private final PostRepository posts;

	private final UserIcons icons;

	private final ImageStorage storage;

	private final StorageDeleter deleter;

	private final TransactionTemplate transaction;

	private final Clock clock;

	ProfileService(UserRepository users, FollowRepository follows, PostRepository posts, UserIcons icons,
			ImageStorage storage, StorageDeleter deleter, TransactionTemplate transaction, Clock clock) {
		this.users = users;
		this.follows = follows;
		this.posts = posts;
		this.icons = icons;
		this.storage = storage;
		this.deleter = deleter;
		this.transaction = transaction;
		this.clock = clock;
	}

	// {username} は大文字・小文字を区別しない。返すユーザー ID は登録したときの書き方（5 章 No.1）。
	// 件数はその都度数える（データ設計書 方針 1）
	@Transactional(readOnly = true)
	Profile read(long viewerId, String username) {
		return profile(viewerId,
				this.users.findByUsername(username).orElseThrow(() -> new ApiException(ErrorCode.USER_NOT_FOUND)));
	}

	// 自分の表示名と自己紹介を変える（PF-5・PF-6）。URL にユーザー ID を入れないので、ほかの人のものは変えられない（6 章）
	@Transactional
	Profile edit(long userId, @Nullable String rawDisplayName, @Nullable String rawBio) {
		String displayName = DisplayNames.valid(rawDisplayName);
		String bio = validBio(rawBio);
		User user = me(userId);
		user.editProfile(displayName, bio, this.clock.instant());
		return profile(userId, user);
	}

	// 新しいアイコンを S3 に置いてから users.icon_key を変え、その後で前のアイコンを消す（3.1、データ設計書 BR-10）。
	// S3 との通信の間はデータベースのトランザクションを開かない
	Profile changeIcon(long userId, @Nullable MultipartFile file) {
		Upload upload = validIcon(file);
		String key = ImageStorage.newKey("icons", upload.format());
		try {
			this.storage.put(key, upload.format(), upload.data());
		}
		catch (RuntimeException ex) {
			log.error("アイコンを S3 に置けませんでした", ex);
			throw new ApiException(ErrorCode.ICON_UPLOAD_FAILED);
		}
		@Nullable String previous;
		boolean saved = false;
		try {
			previous = this.transaction
				.execute((status) -> this.lockedMe(userId).changeIcon(key, this.clock.instant()));
			saved = true;
		}
		finally {
			// icon_key を変えられなかったら、置いた画像を消す
			if (!saved) {
				this.deleter.deleteOrRecord(List.of(key));
			}
		}
		deleteIfPresent(previous);
		return readMe(userId);
	}

	// icon_key を空にしてから、S3 の前のアイコンを消す（PF-9、BR-10）
	void removeIcon(long userId) {
		@Nullable String previous = this.transaction
			.execute((status) -> this.lockedMe(userId).changeIcon(null, this.clock.instant()));
		deleteIfPresent(previous);
	}

	private Profile readMe(long userId) {
		return this.transaction.execute((status) -> profile(userId, me(userId)));
	}

	private Profile profile(long viewerId, User user) {
		long id = user.getId();
		boolean me = id == viewerId;
		boolean followedByMe = !me && this.follows.existsById(new Follow.Key(viewerId, id));
		return new Profile(user.getUsername(), user.getDisplayName(), user.getBio(), this.icons.url(user),
				user.getCreatedAt(), this.follows.countByFollowerId(id), this.follows.countByFolloweeId(id),
				this.posts.countByAuthorId(id), followedByMe, me);
	}

	// JWT は正しいがユーザーがいない（運用で消した）ときは、ログインしていないものとして扱う
	private User me(long userId) {
		return this.users.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
	}

	// 同時にアイコンを差し替えても、前のアイコンを消し忘れないよう行をロックする
	private User lockedMe(long userId) {
		return this.users.findByIdForUpdate(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
	}

	private void deleteIfPresent(@Nullable String key) {
		if (key != null) {
			this.deleter.deleteOrRecord(List.of(key));
		}
	}

	// 改行を LF にそろえ、前後の空白を取り除いて 0〜160 文字（コードポイント）。途中の改行はそのまま残す（4 章）
	private static String validBio(@Nullable String rawBio) {
		String bio = BodyText.normalize(rawBio);
		if (bio.codePointCount(0, bio.length()) > BIO_MAX) {
			throw new ApiException(ErrorCode.BIO_TOO_LONG, "bio");
		}
		return bio;
	}

	// 大きさ → 形式の順に確かめる。形式はファイルの先頭のバイトで決め、GIF は使えない（4 章）
	private static Upload validIcon(@Nullable MultipartFile file) {
		if (file != null && file.getSize() > ICON_BYTES_MAX) {
			throw new ApiException(ErrorCode.ICON_TOO_LARGE, "icon");
		}
		byte[] data = bytes(file);
		ImageFormat format = ImageFormat.detect(data)
			.filter((detected) -> detected != ImageFormat.GIF)
			.orElseThrow(() -> new ApiException(ErrorCode.ICON_TYPE_INVALID, "icon"));
		return new Upload(format, data);
	}

	private static byte[] bytes(@Nullable MultipartFile file) {
		if (file == null) {
			return new byte[0];
		}
		try {
			return file.getBytes();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	private record Upload(ImageFormat format, byte[] data) {
	}

}
