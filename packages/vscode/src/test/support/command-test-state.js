export const state = {
  inputBoxValues: [],
  quickPickValues: [],
  directTarget: null,
  activeEditorTask: null,
  taskCreateResult: { ok: true, openedInEditor: false, filePath: "/workspace/tasks/backlog/factory-1.md" },
  taskMoveResult: { ok: true, message: "moved" },
  taskPromoteResult: { ok: true, message: "promoted" },
  taskRequeueResult: { ok: true, message: "requeued" },
  taskReviewResult: { ok: true, message: "reviewed" },
  runStartResult: { ok: true, message: "factory run completed", stdout: "", stderr: "" },
  taskLists: new Map(),
  allTasks: {
    backlog: [],
    ready: [],
    doing: [],
    review: [],
    blocked: [],
    archived: [],
    done: [],
  },
  createCalls: [],
  moveCalls: [],
  promoteCalls: [],
  requeueCalls: [],
  reviewCalls: [],
  runStartCalls: [],
  openedDocuments: [],
  shownDocuments: [],
  infoMessages: [],
  errorMessages: [],
  outputLines: [],
  outputChunks: [],
  outputShown: 0,
  outputCleared: 0,
};

export function resetState() {
  state.inputBoxValues = [];
  state.quickPickValues = [];
  state.directTarget = null;
  state.activeEditorTask = null;
  state.taskCreateResult = { ok: true, openedInEditor: false, filePath: "/workspace/tasks/backlog/factory-1.md" };
  state.taskMoveResult = { ok: true, message: "moved" };
  state.taskPromoteResult = { ok: true, message: "promoted" };
  state.taskRequeueResult = { ok: true, message: "requeued" };
  state.taskReviewResult = { ok: true, message: "reviewed" };
  state.runStartResult = { ok: true, message: "factory run completed", stdout: "", stderr: "" };
  state.taskLists = new Map();
  state.allTasks = {
    backlog: [],
    ready: [],
    doing: [],
    review: [],
    blocked: [],
    archived: [],
    done: [],
  };
  state.createCalls = [];
  state.moveCalls = [];
  state.promoteCalls = [];
  state.requeueCalls = [];
  state.reviewCalls = [];
  state.runStartCalls = [];
  state.openedDocuments = [];
  state.shownDocuments = [];
  state.infoMessages = [];
  state.errorMessages = [];
  state.outputLines = [];
  state.outputChunks = [];
  state.outputShown = 0;
  state.outputCleared = 0;
}
