-- A send that timed out or broke after the message began to go out may or may not have been delivered. It is recorded as 'unknown', never as 'failed'.
ALTER TABLE message_log DROP CONSTRAINT message_log_status_check;
ALTER TABLE message_log ADD CONSTRAINT message_log_status_check CHECK(status IN ('sent_to_provider','failed','blocked','unknown'));
