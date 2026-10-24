package com.example.raisetimeline.storage;

import java.time.Clock;
import java.util.Collection;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// S3 のファイルを消す。消せなかったものは storage_deletions に記録し、1 日 1 回消し直す（データ設計書 BR-5・BR-10）。
// データベースの行は先に消してあるので、ここで失敗しても利用者にはエラーを返さない
@Component
public class StorageDeleter {

	private static final Logger log = LoggerFactory.getLogger(StorageDeleter.class);

	private final ImageStorage storage;

	private final StorageDeletionRepository deletions;

	private final Clock clock;

	StorageDeleter(ImageStorage storage, StorageDeletionRepository deletions, Clock clock) {
		this.storage = storage;
		this.deletions = deletions;
		this.clock = clock;
	}

	public void deleteOrRecord(Collection<String> keys) {
		for (String key : keys) {
			try {
				this.storage.delete(key);
			}
			catch (RuntimeException ex) {
				log.atWarn().addKeyValue("storage.key", key).setCause(ex).log("S3 のファイル {} を消せなかったので、あとで消し直します", key);
				if (!this.deletions.existsByStorageKey(key)) {
					this.deletions.save(new StorageDeletion(key, this.clock.instant()));
				}
			}
		}
	}

	// 毎日 4:30（日本時間）。リフレッシュトークンの削除（4:00）と重ならないようにする
	@Scheduled(cron = "0 30 4 * * *", zone = "Asia/Tokyo")
	public void retry() {
		int deleted = 0;
		for (StorageDeletion deletion : this.deletions.findAll()) {
			try {
				this.storage.delete(deletion.getStorageKey());
				this.deletions.delete(deletion);
				deleted++;
			}
			catch (RuntimeException ex) {
				log.atWarn()
					.addKeyValue("storage.key", deletion.getStorageKey())
					.setCause(ex)
					.log("S3 のファイル {} をまた消せませんでした", deletion.getStorageKey());
			}
		}
		log.atInfo().addKeyValue("deleted.count", deleted).log("S3 から消せていなかったファイルを {} 件消しました", deleted);
	}

}
