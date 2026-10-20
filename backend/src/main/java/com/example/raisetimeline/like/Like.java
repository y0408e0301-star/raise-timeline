package com.example.raisetimeline.like;

import java.io.Serializable;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

// いいね（データ設計書 4.5）。追加は LikeRepository.insertIfAbsent で行い、この形では保存しない
@Entity
@Table(name = "likes")
@IdClass(Like.Key.class)
public class Like {

	@Id
	@Column(updatable = false)
	private long userId;

	@Id
	@Column(updatable = false)
	private long postId;

	@Column(nullable = false, updatable = false)
	private Instant createdAt;

	protected Like() {
		this.createdAt = Instant.EPOCH;
	}

	public long getUserId() {
		return this.userId;
	}

	public long getPostId() {
		return this.postId;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	// 主キー（user_id, post_id）
	public record Key(long userId, long postId) implements Serializable {

		public Key() {
			this(0, 0);
		}

	}

}
