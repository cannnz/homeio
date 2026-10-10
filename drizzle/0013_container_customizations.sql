CREATE TABLE IF NOT EXISTS "container_customizations" (
	"container_name" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"icon_url" text,
	"dashboard_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
