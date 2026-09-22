const filesystem = require("./lib.js");

module.exports.FilesystemEditFile = {
  name: "filesystem-edit-file",
  plugin: function () {
    return {
      name: "filesystem-edit-file",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Make line-based edits to a text file. Each edit replaces exact line sequences " +
            "with new content. Returns a git-style diff showing the changes made. " +
            "Use dryRun=true to preview changes without applying them. " +
            "Only works within allowed directories.",
          examples: [
            {
              prompt: "Change the port number from 3000 to 8080 in config.js",
              call: JSON.stringify({
                path: "config.js",
                edits: [{ oldText: "port: 3000", newText: "port: 8080" }],
              }),
            },
            {
              prompt: "Preview what would happen if I renamed the function",
              call: JSON.stringify({
                path: "utils.js",
                edits: [
                  {
                    oldText: "function oldName()",
                    newText: "function newName()",
                  },
                ],
                dryRun: true,
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "The path to the file to edit.",
              },
              edits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    oldText: {
                      type: "string",
                      description: "Text to search for - must match exactly.",
                    },
                    newText: {
                      type: "string",
                      description: "Text to replace with.",
                    },
                  },
                  required: ["oldText", "newText"],
                },
                description: "Array of edit operations to apply.",
              },
              dryRun: {
                type: "boolean",
                default: false,
                description:
                  "If true, preview changes using git-style diff format without applying them.",
              },
            },
            required: ["path", "edits"],
            additionalProperties: false,
          },
          handler: async function ({
            path: filePath = "",
            edits = [],
            dryRun = false,
          }) {
            try {
              this.super.handlerProps.log(
                `Using the filesystem-edit-file tool.`
              );

              if (!Array.isArray(edits) || edits.length === 0) {
                return "Error: At least one edit operation must be provided.";
              }

              // Project-bound chats edit inside their folder too.
              const extraDirs = await filesystem.projectExtraDir(
                this.super.handlerProps
              );
              const allowedExtras = extraDirs ? [extraDirs] : [];
              const validPath = await filesystem.validatePath(
                filePath,
                allowedExtras
              );

              this.super.introspect(
                `${this.caller}: ${dryRun ? "Previewing" : "Applying"} ${edits.length} edit(s) to ${filePath}`
              );

              if (this.super.requestToolApproval && !dryRun) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: { path: filePath, edits, dryRun },
                  description: "Edit a file",
                });

                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message;
                }
              }

              const { result, change } = await filesystem.applyFileEdits(
                validPath,
                edits,
                dryRun,
                allowedExtras
              );

              if (dryRun)
                this.super.introspect(`Preview of changes to ${filePath}:`);
              else {
                this.super.introspect(`Successfully edited ${filePath}`);
                // File-change chip for the chat UI - clicks expand to the diff.
                this.super.socket?.send?.("fileChangeCard", {
                  action: "edit",
                  ...change,
                });
              }

              return result;
            } catch (e) {
              this.super.handlerProps.log(
                `filesystem-edit-file error: ${e.message}`
              );
              this.super.introspect(`Error: ${e.message}`);
              return `Error editing file: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
