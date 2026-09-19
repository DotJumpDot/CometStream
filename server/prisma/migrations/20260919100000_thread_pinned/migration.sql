-- CometStream: threads can be pinned to the sidebar's Pinned section.
ALTER TABLE "workspace_threads" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
