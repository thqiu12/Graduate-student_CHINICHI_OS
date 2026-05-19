-- 文书批注反馈表
CREATE TABLE "file_feedbacks" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "resolved_by" UUID,
    CONSTRAINT "file_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "file_feedbacks_file_id_status_idx" ON "file_feedbacks"("file_id", "status");
CREATE INDEX "file_feedbacks_version_id_idx" ON "file_feedbacks"("version_id");

ALTER TABLE "file_feedbacks"
    ADD CONSTRAINT "file_feedbacks_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "file_versions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "file_feedbacks"
    ADD CONSTRAINT "file_feedbacks_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "file_feedbacks"
    ADD CONSTRAINT "file_feedbacks_resolved_by_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
