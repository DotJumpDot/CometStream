-- CometStream: user-defined OpenAI-compatible LLM providers (Manage models UI)
-- and the per-workspace chat reasoning preference.
CREATE TABLE "custom_llm_providers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key" TEXT,
    "models_json" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "custom_llm_providers_name_key" UNIQUE ("name")
);

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "chat_reasoning_effort" TEXT;
