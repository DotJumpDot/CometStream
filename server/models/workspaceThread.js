const prisma = require("../utils/prisma");
const slugifyModule = require("slugify");
const { v4: uuidv4 } = require("uuid");
const truncate = require("truncate");

const WorkspaceThread = {
  defaultName: "Thread",
  writable: ["name"],

  /**
   * The default Slugify module requires some additional mapping to prevent downstream issues
   * if the user is able to define a slug externally. We have to block non-escapable URL chars
   * so that is the slug is rendered it doesn't break the URL or UI when visited.
   * @param  {...any} args - slugify args for npm package.
   * @returns {string}
   */
  slugify: function (...args) {
    slugifyModule.extend({
      "+": " plus ",
      "!": " bang ",
      "@": " at ",
      "*": " splat ",
      ".": " dot ",
      ":": "",
      "~": "",
      "(": "",
      ")": "",
      "'": "",
      '"': "",
      "|": "",
    });
    return slugifyModule(...args);
  },

  new: async function (workspace, userId = null, data = {}) {
    try {
      const thread = await prisma.workspace_threads.create({
        data: {
          name: data.name ? String(data.name) : this.defaultName,
          slug: data.slug
            ? this.slugify(data.slug, { lowercase: true })
            : uuidv4(),
          user_id: userId ? Number(userId) : null,
          workspace_id: workspace.id,
        },
      });

      return { thread, message: null };
    } catch (error) {
      console.error(error.message);
      return { thread: null, message: error.message };
    }
  },

  update: async function (prevThread = null, data = {}) {
    if (!prevThread) throw new Error("No thread id provided for update");

    const validData = {};
    Object.entries(data).forEach(([key, value]) => {
      if (!this.writable.includes(key)) return;
      validData[key] = value;
    });

    if (Object.keys(validData).length === 0)
      return { thread: prevThread, message: "No valid fields to update!" };

    try {
      const thread = await prisma.workspace_threads.update({
        where: { id: prevThread.id },
        data: validData,
      });
      return { thread, message: null };
    } catch (error) {
      console.error(error.message);
      return { thread: null, message: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const thread = await prisma.workspace_threads.findFirst({
        where: clause,
      });

      return thread || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  delete: async function (clause = {}) {
    try {
      const { WorkspaceChats } = require("./workspaceChats");
      // thread_id has no FK relation so chats don't cascade-delete with the thread.
      const threads = await prisma.workspace_threads.findMany({
        where: clause,
        select: { id: true },
      });
      if (threads.length > 0)
        await WorkspaceChats.delete({
          thread_id: { in: threads.map((thread) => thread.id) },
        });

      await prisma.workspace_threads.deleteMany({
        where: clause,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = null,
    include = null
  ) {
    try {
      const results = await prisma.workspace_threads.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
        ...(include !== null ? { include } : {}),
      });
      return results;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  /**
   * Threads that actually contain chats, for sidebar-style lists. Thread
   * rows are pre-created before the first message, so aborted/failed runs
   * leave chat-less "Thread" rows behind - opening one shows a blank
   * greeting view, which reads as a broken conversation. Filtering here
   * keeps the list to conversations with something to show; the thread
   * route itself still loads a filtered thread fine (it just renders empty).
   * @param {object} [clause] - where clause for the thread lookup
   * @returns {Array} Threads with at least one chat each.
   */
  listNonEmpty: async function (clause = {}) {
    try {
      const threads = await prisma.workspace_threads.findMany({
        where: clause,
      });
      if (threads.length === 0) return [];
      const counts = await prisma.workspace_chats.groupBy({
        by: ["thread_id"],
        where: { thread_id: { in: threads.map((thread) => thread.id) } },
        _count: { thread_id: true },
      });
      const withChats = new Set(
        counts
          .filter((count) => count.thread_id != null)
          .map((count) => count.thread_id)
      );
      return threads.filter((thread) => withChats.has(thread.id));
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  migrateToMultiUser: async function (adminUserId) {
    try {
      await prisma.workspace_threads.updateMany({
        where: { user_id: null },
        data: { user_id: adminUserId },
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  /**
   * Pin or unpin a thread within a workspace. Pinned threads surface in the
   * sidebar's Pinned section across all workspaces.
   * @param {object} workspace - The workspace the thread belongs to
   * @param {string} threadSlug - Slug of the thread to (un)pin
   * @param {boolean} pinned - New pinned state
   * @returns {Promise<boolean>} Whether the update succeeded
   */
  setPinned: async function (
    workspace = {},
    threadSlug = null,
    pinned = false
  ) {
    try {
      await prisma.workspace_threads.updateMany({
        where: { workspace_id: workspace.id, slug: String(threadSlug) },
        data: { pinned: !!pinned },
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  /**
   * All pinned threads across workspaces, newest activity first.
   * @returns {Promise<Array>} Thread rows with their workspace slug/name
   */
  pinned: async function () {
    try {
      return await prisma.workspace_threads.findMany({
        where: { pinned: true },
        include: { workspace: { select: { slug: true, name: true } } },
        orderBy: { lastUpdatedAt: "desc" },
        take: 20,
      });
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  // Will fire on first message (included or not) for a thread and rename the thread based on the prompt.
  autoRenameThread: async function ({
    workspace = null,
    thread = null,
    user = null,
    prompt = null,
    onRename = null,
  }) {
    if (!workspace || !thread || !prompt) return false;
    if (thread.name !== this.defaultName) return false; // don't rename if already named.

    const { WorkspaceChats } = require("./workspaceChats");
    const chatCount = await WorkspaceChats.count({
      workspaceId: workspace.id,
      user_id: user?.id || null,
      thread_id: thread.id,
    });
    if (chatCount !== 1) return { renamed: false, thread };
    const { thread: updatedThread } = await this.update(thread, {
      name: truncate(prompt, 22),
    });

    onRename?.(updatedThread);
    return true;
  },
};

module.exports = { WorkspaceThread };
