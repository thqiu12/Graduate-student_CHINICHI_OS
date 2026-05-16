-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('draft', 'pending', 'change_pending', 'active', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(20),
    "wechat_openid" VARCHAR(100),
    "email" VARCHAR(100),
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" INTEGER NOT NULL,
    "subject_id" INTEGER,
    "campus_id" INTEGER,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "campuses" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "code" VARCHAR(20) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "campus_id" INTEGER,
    "subject_id" INTEGER,
    "entry_date" DATE,
    "target_year" VARCHAR(20),
    "target_season" VARCHAR(30),
    "jlpt_level" VARCHAR(10),
    "jlpt_score" INTEGER,
    "undergrad_major" VARCHAR(100),
    "undergrad_gpa" DECIMAL(3,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_teacher" (
    "id" SERIAL NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "changed_by" UUID,
    "change_reason" TEXT,

    CONSTRAINT "student_teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_plans" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "period_code" VARCHAR(20) NOT NULL,
    "stage_name" VARCHAR(100) NOT NULL,
    "goal" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "plan_status" NOT NULL DEFAULT 'draft',
    "change_reason" TEXT,
    "previous_plan_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "confirmed_at" TIMESTAMPTZ,
    "confirmed_by" UUID,

    CONSTRAINT "period_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_plan_tasks" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "due_date" DATE,
    "due_time" VARCHAR(10),
    "priority" VARCHAR(10) NOT NULL DEFAULT '中',
    "repeat_type" VARCHAR(20) NOT NULL DEFAULT 'once',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "done_at" TIMESTAMPTZ,
    "done_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_plan_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_confirmations" (
    "id" SERIAL NOT NULL,
    "plan_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "actor_id" UUID NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" BIGSERIAL NOT NULL,
    "student_id" UUID,
    "actor_id" UUID,
    "actor_name" VARCHAR(50),
    "action_type" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" VARCHAR(100),
    "detail" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_tags" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),

    CONSTRAINT "risk_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_risk_tags" (
    "id" SERIAL NOT NULL,
    "student_id" UUID NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "tagged_by" UUID NOT NULL,
    "tagged_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ,
    "removed_by" UUID,
    "remove_reason" TEXT,

    CONSTRAINT "student_risk_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_schools" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "university_name" VARCHAR(200) NOT NULL,
    "department" VARCHAR(200),
    "rank" INTEGER,
    "professor_name" VARCHAR(100),
    "professor_url" TEXT,
    "exam_types" TEXT[],
    "application_start" DATE,
    "application_end" DATE,
    "exam_date" DATE,
    "result_date" DATE,
    "result" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_progress_nodes" (
    "id" SERIAL NOT NULL,
    "school_id" UUID NOT NULL,
    "node_code" VARCHAR(50) NOT NULL,
    "node_name" VARCHAR(100) NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ,
    "done_by" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "school_progress_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inno_tracking" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'not_started',
    "contact_count" INTEGER NOT NULL DEFAULT 0,
    "last_contact_at" DATE,
    "confirmed_at" DATE,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inno_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inno_contacts" (
    "id" SERIAL NOT NULL,
    "tracking_id" UUID NOT NULL,
    "method" VARCHAR(30),
    "contact_date" DATE,
    "summary" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inno_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_records" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "coached_at" DATE NOT NULL,
    "form" VARCHAR(20),
    "school_ids" UUID[],
    "content" TEXT NOT NULL,
    "next_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_todos" (
    "id" SERIAL NOT NULL,
    "coaching_id" UUID NOT NULL,
    "task_id" UUID,
    "title" TEXT NOT NULL,
    "due_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "file_type" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "oss_key" TEXT NOT NULL,
    "file_size" BIGINT,
    "mime_type" VARCHAR(100),
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT,
    "related_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" SERIAL NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ,
    "error_msg" TEXT,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_wechat_openid_key" ON "users"("wechat_openid");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE INDEX "idx_students_campus" ON "students"("campus_id");

-- CreateIndex
CREATE INDEX "idx_students_subject" ON "students"("subject_id");

-- CreateIndex
CREATE INDEX "idx_period_plans_student" ON "period_plans"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "period_plans_student_id_period_code_version_key" ON "period_plans"("student_id", "period_code", "version");

-- CreateIndex
CREATE INDEX "idx_tasks_plan" ON "period_plan_tasks"("plan_id", "status");

-- CreateIndex
CREATE INDEX "idx_tasks_due" ON "period_plan_tasks"("due_date");

-- CreateIndex
CREATE INDEX "idx_op_logs_student" ON "operation_logs"("student_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "risk_tags_code_key" ON "risk_tags"("code");

-- CreateIndex
CREATE INDEX "idx_risk_tags_student" ON "student_risk_tags"("student_id");

-- CreateIndex
CREATE INDEX "idx_school_student" ON "target_schools"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "inno_tracking_school_id_key" ON "inno_tracking"("school_id");

-- CreateIndex
CREATE INDEX "idx_coaching_student" ON "coaching_records"("student_id", "coached_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_user" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_teacher" ADD CONSTRAINT "student_teacher_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_teacher" ADD CONSTRAINT "student_teacher_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_teacher" ADD CONSTRAINT "student_teacher_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_plans" ADD CONSTRAINT "period_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_plans" ADD CONSTRAINT "period_plans_previous_plan_id_fkey" FOREIGN KEY ("previous_plan_id") REFERENCES "period_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_plans" ADD CONSTRAINT "period_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_plans" ADD CONSTRAINT "period_plans_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_plan_tasks" ADD CONSTRAINT "period_plan_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "period_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_confirmations" ADD CONSTRAINT "plan_confirmations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "period_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_confirmations" ADD CONSTRAINT "plan_confirmations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_risk_tags" ADD CONSTRAINT "student_risk_tags_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_risk_tags" ADD CONSTRAINT "student_risk_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "risk_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_risk_tags" ADD CONSTRAINT "student_risk_tags_tagged_by_fkey" FOREIGN KEY ("tagged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_risk_tags" ADD CONSTRAINT "student_risk_tags_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_schools" ADD CONSTRAINT "target_schools_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_progress_nodes" ADD CONSTRAINT "school_progress_nodes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "target_schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_progress_nodes" ADD CONSTRAINT "school_progress_nodes_done_by_fkey" FOREIGN KEY ("done_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inno_tracking" ADD CONSTRAINT "inno_tracking_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "target_schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inno_contacts" ADD CONSTRAINT "inno_contacts_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "inno_tracking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inno_contacts" ADD CONSTRAINT "inno_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_records" ADD CONSTRAINT "coaching_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_records" ADD CONSTRAINT "coaching_records_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_todos" ADD CONSTRAINT "coaching_todos_coaching_id_fkey" FOREIGN KEY ("coaching_id") REFERENCES "coaching_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_todos" ADD CONSTRAINT "coaching_todos_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "period_plan_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
