package com.example.raisetimeline.like;

import java.time.Instant;

import com.example.raisetimeline.user.User;

// いいねした人と、いいねした日時（G-5 の 1 行）
public record Liker(User user, Instant likedAt) {
}
