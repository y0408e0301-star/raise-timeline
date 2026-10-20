package com.example.raisetimeline.follow;

import java.time.Instant;

import com.example.raisetimeline.user.User;

// G-8 の 1 行：フォロー中・フォロワーの相手と、フォローした日時
public record FollowedUser(User user, Instant followedAt) {
}
