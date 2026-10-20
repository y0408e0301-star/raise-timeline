package com.example.raisetimeline.follow;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FollowRepository extends JpaRepository<Follow, Follow.Key> {

	// フォロー数（「フォロー中」タブで M-8 を出すか決める。FN-02 6 章）
	long countByFollowerId(long followerId);

	// userIds のうち、followerId がフォローしている人（ユーザーの行のフォローボタンの状態。機能定義書 3.5 UserSummary）
	@Query("select f.followeeId from Follow f where f.followerId = :followerId and f.followeeId in :userIds")
	List<Long> findFolloweeIds(@Param("followerId") long followerId, @Param("userIds") Collection<Long> userIds);

}
