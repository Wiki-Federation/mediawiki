-- Add column for storing actor and comment
ALTER TABLE /*_*/cu_changes
	ADD COLUMN cuc_actor bigint unsigned NOT NULL DEFAULT 0 AFTER cuc_user_text,
	ADD COLUMN cuc_comment_id bigint unsigned NOT NULL DEFAULT 0 AFTER cuc_comment;

CREATE INDEX /*i*/cuc_actor_ip_time ON /*_*/cu_changes (cuc_actor, cuc_ip, cuc_timestamp);
