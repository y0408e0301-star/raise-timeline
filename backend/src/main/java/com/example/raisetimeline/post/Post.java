package com.example.raisetimeline.post;

import java.time.Instant;

import org.jspecify.annotations.Nullable;

import com.example.raisetimeline.user.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

// 投稿（データ設計書 4.2）
@Entity
@Table(name = "posts")
public class Post {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private @Nullable Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false, updatable = false)
	private User author;

	@Column(nullable = false)
	private String body;

	// 編集しても変えない（FN-03 5 章 No.5）
	@Column(nullable = false, updatable = false)
	private Instant createdAt;

	private @Nullable Instant editedAt;

	protected Post() {
		this(new User("", "", "", Instant.EPOCH), "", Instant.EPOCH);
	}

	public Post(User author, String body, Instant now) {
		this.author = author;
		this.body = body;
		this.createdAt = now;
	}

	// 本文と編集日時だけを変える（W-9・W-11）
	public void edit(String body, Instant now) {
		this.body = body;
		this.editedAt = now;
	}

	public boolean isWrittenBy(long userId) {
		return this.author.getId() == userId;
	}

	public long getId() {
		if (this.id == null) {
			throw new IllegalStateException("まだ保存していない投稿です");
		}
		return this.id;
	}

	public User getAuthor() {
		return this.author;
	}

	public String getBody() {
		return this.body;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public @Nullable Instant getEditedAt() {
		return this.editedAt;
	}

}
