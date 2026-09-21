/**
 * Tests for WorkspaceThread.listNonEmpty: sidebar lists only carry threads
 * that contain chats (chat-less pre-created rows open to a blank view).
 */
jest.mock("../../utils/prisma", () => ({
  workspace_threads: {
    findMany: jest.fn(),
  },
  workspace_chats: {
    groupBy: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { WorkspaceThread } = require("../../models/workspaceThread");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WorkspaceThread.listNonEmpty", () => {
  it("returns only threads that have at least one chat", async () => {
    prisma.workspace_threads.findMany.mockResolvedValue([
      { id: 1, slug: "a" },
      { id: 2, slug: "b" },
      { id: 3, slug: "c" },
    ]);
    prisma.workspace_chats.groupBy.mockResolvedValue([
      { thread_id: 1, _count: { thread_id: 2 } },
      { thread_id: 3, _count: { thread_id: 1 } },
    ]);
    const threads = await WorkspaceThread.listNonEmpty({ workspace_id: 7 });
    expect(threads.map((t) => t.id)).toEqual([1, 3]);
    expect(prisma.workspace_chats.groupBy).toHaveBeenCalledWith({
      by: ["thread_id"],
      where: { thread_id: { in: [1, 2, 3] } },
      _count: { thread_id: true },
    });
  });

  it("returns [] without querying chats when there are no threads", async () => {
    prisma.workspace_threads.findMany.mockResolvedValue([]);
    expect(await WorkspaceThread.listNonEmpty({})).toEqual([]);
    expect(prisma.workspace_chats.groupBy).not.toHaveBeenCalled();
  });

  it("returns [] on DB errors instead of throwing", async () => {
    prisma.workspace_threads.findMany.mockRejectedValue(new Error("down"));
    expect(await WorkspaceThread.listNonEmpty({})).toEqual([]);
  });
});
