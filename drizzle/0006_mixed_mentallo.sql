ALTER TABLE `crm_records` ADD `created_at` text;
--> statement-breakpoint
UPDATE crm_records SET created_at=(
  SELECT MIN(created_at) FROM crm_audit
  WHERE record_id=crm_records.id
    AND (before_value IS NULL OR operation='cadastrar')
    AND operation<>'duplicidade-observacao'
) WHERE created_at IS NULL;
--> statement-breakpoint
UPDATE crm_records SET created_at=(
  SELECT MIN(proof.value) FROM crm_duplicate_reviews, json_each(json_extract(crm_duplicate_reviews.payload,'$.recordCreatedAt')) AS proof
  WHERE proof.key=crm_records.id AND proof.type='text'
) WHERE created_at IS NULL;
--> statement-breakpoint
UPDATE crm_records SET created_at=updated_at WHERE created_at IS NULL AND version=1;
--> statement-breakpoint
CREATE TRIGGER crm_records_creation_on_insert AFTER INSERT ON crm_records
WHEN NEW.created_at IS NULL
BEGIN
  UPDATE crm_records SET created_at=NEW.updated_at WHERE id=NEW.id;
END;
