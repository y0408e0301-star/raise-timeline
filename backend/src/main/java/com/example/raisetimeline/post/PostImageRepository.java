package com.example.raisetimeline.post;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PostImageRepository extends JpaRepository<PostImage, Long> {

	// 一覧に出す投稿の画像を 1 回でまとめて取る（N+1 を作らない。FN-02 5.2）
	List<PostImage> findByPostIdInOrderByPostIdAscSortOrderAsc(Collection<Long> postIds);

	List<PostImage> findByPostIdOrderBySortOrderAsc(long postId);

	long countByPostId(long postId);

}
