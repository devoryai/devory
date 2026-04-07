import { state } from "./command-test-state.js";

export const ProgressLocation = { Notification: 15 };
export const QuickPickItemKind = { Separator: -1 };

export class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

export class Selection {
  constructor(anchor, active) {
    this.anchor = anchor;
    this.active = active;
  }
}

export class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

export class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
  }
}

export const window = {
  activeTextEditor: undefined,
  showErrorMessage(message) {
    state.errorMessages.push(message);
    return Promise.resolve(message);
  },
  showInformationMessage(message) {
    state.infoMessages.push(message);
    return Promise.resolve(message);
  },
  showInputBox() {
    return Promise.resolve(state.inputBoxValues.shift());
  },
  showQuickPick() {
    return Promise.resolve(state.quickPickValues.shift());
  },
  withProgress(_options, task) {
    return Promise.resolve(task());
  },
  showTextDocument(doc) {
    state.shownDocuments.push(doc);
    return Promise.resolve({
      selection: null,
      revealRange() {},
    });
  },
};

export const workspace = {
  workspaceFolders: [],
  openTextDocument(filepath) {
    state.openedDocuments.push(filepath);
    return Promise.resolve({ filepath });
  },
};
