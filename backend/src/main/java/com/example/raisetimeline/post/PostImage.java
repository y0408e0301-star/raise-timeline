package com.example.raisetimeline.post;

import org.jspecify.annotations.Nullable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// 投稿の画像（データ設計書 4.3）。投稿を削除すると、外部キーの ON DELETE CASCADE で行も消える
@Entity
@Table(name = "post_images")
public class PostImage {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private @Nullable Long id;

	@Column(nullable = false, updatable = false)
	private long postId;

	@Column(nullable = false, updatable = false)
	private String storageKey;

	@Column(nullable = false, updatable = false)
	private String contentType;

	@Column(nullable = false, updatable = false)
	private int byteSize;

	// 利用者が選んだ順に 0〜3（FN-04 5 章 No.5）
	@Column(nullable = false, updatable = false)
	private short sortOrder;

	protected PostImage() {
		this(0, "", "", 0, 0);
	}

	PostImage(long postId, String storageKey, String contentType, int byteSize, int sortOrder) {
		this.postId = postId;
		this.storageKey = storageKey;
		this.contentType = contentType;
		this.byteSize = byteSize;
		this.sortOrder = (short) sortOrder;
	}

	public long getId() {
		if (this.id == null) {
			throw new IllegalStateException("まだ保存していない画像です");
		}
		return this.id;
	}

	public long getPostId() {
		return this.postId;
	}

	public String getStorageKey() {
		return this.storageKey;
	}

	public String getContentType() {
		return this.contentType;
	}

	public int getByteSize() {
		return this.byteSize;
	}

	public int getSortOrder() {
		return this.sortOrder;
	}

}
