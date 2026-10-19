package com.example.raisetimeline.follow;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FollowRepository extends JpaRepository<Follow, Follow.Key> {

	// フォロー数（「フォロー中」タブで M-8 を出すか決める。FN-02 6 章）
	long countByFollowerId(long followerId);

}
