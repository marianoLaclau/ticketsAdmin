ALTER TABLE `tickets`
ADD COLUMN `version` integer DEFAULT 1 NOT NULL
CONSTRAINT `tickets_version_positive` CHECK (`version` >= 1);
