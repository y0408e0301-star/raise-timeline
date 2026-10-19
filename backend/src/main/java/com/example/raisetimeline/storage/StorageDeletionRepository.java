package com.example.raisetimeline.storage;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StorageDeletionRepository extends JpaRepository<StorageDeletion, Long> {

	boolean existsByStorageKey(String storageKey);

}
