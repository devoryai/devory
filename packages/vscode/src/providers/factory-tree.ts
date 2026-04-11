/**
 * packages/vscode/src/providers/factory-tree.ts
 *
 * VS Code TreeDataProvider for the Devory Factory sidebar view.
 * Shows three sections:
 *   Doctrine — files from <factoryRoot>/doctrine/
 *   Skills   — dirs from <factoryRoot>/skills/ that contain SKILL.md
 *   Agents   — .md files from <factoryRoot>/agents/ (excluding agents.yaml)
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// ── Tree item types ──────────────────────────────────────────────────────────

type FactoryTreeItem = GroupItem | DoctrineFileItem | SkillItem | AgentItem | PlaceholderItem;

class GroupItem extends vscode.TreeItem {
  constructor(
    public readonly groupId: "doctrine" | "skills" | "agents",
    label: string,
    count: number
  ) {
    super(
      `${label}  (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    this.contextValue = `devoryGroup.${groupId}`;
    this.iconPath = new vscode.ThemeIcon(
      groupId === "doctrine" ? "law" : groupId === "agents" ? "robot" : "library"
    );
  }
}

class PlaceholderItem extends vscode.TreeItem {
  constructor(label: string, commandId: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "placeholder";
    this.iconPath = new vscode.ThemeIcon("add", new vscode.ThemeColor("descriptionForeground"));
    this.command = {
      command: commandId,
      title: label,
    };
  }
}

class DoctrineFileItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    filename: string
  ) {
    super(filename, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "devoryDoctrineFile";
    this.tooltip = filePath;
    this.iconPath = new vscode.ThemeIcon("book");
    this.command = {
      command: "vscode.open",
      title: "Open Doctrine File",
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

class SkillItem extends vscode.TreeItem {
  constructor(
    public readonly skillMdPath: string,
    skillName: string
  ) {
    super(skillName, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "devorySkill";
    this.tooltip = skillMdPath;
    this.iconPath = new vscode.ThemeIcon("circuit-board");
    this.command = {
      command: "vscode.open",
      title: "Open Skill",
      arguments: [vscode.Uri.file(skillMdPath)],
    };
  }
}

class AgentItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    agentName: string
  ) {
    super(agentName, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "devoryAgent";
    this.tooltip = filePath;
    this.iconPath = new vscode.ThemeIcon("robot");
    this.command = {
      command: "vscode.open",
      title: "Open Agent",
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export class FactoryTreeProvider implements vscode.TreeDataProvider<FactoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FactoryTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private factoryRoot: string) {}

  setFactoryRoot(factoryRoot: string): void {
    this.factoryRoot = factoryRoot;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FactoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FactoryTreeItem): Thenable<FactoryTreeItem[]> {
    if (!this.factoryRoot) return Promise.resolve([]);

    if (!element) {
      return Promise.resolve([
        new GroupItem("doctrine", "Doctrine", this.listDoctrineFiles().length),
        new GroupItem("skills", "Skills", this.listSkills().length),
        new GroupItem("agents", "Agents", this.listAgents().length),
      ]);
    }

    if (element instanceof GroupItem) {
      if (element.groupId === "doctrine") {
        const files = this.listDoctrineFiles();
        if (files.length === 0) {
          return Promise.resolve([new PlaceholderItem("Initialize defaults →", "devory.initWorkspace")]);
        }
        return Promise.resolve(files.map((f) => new DoctrineFileItem(f, path.basename(f))));
      }
      if (element.groupId === "skills") {
        const skills = this.listSkills();
        if (skills.length === 0) {
          return Promise.resolve([new PlaceholderItem("Initialize defaults →", "devory.initWorkspace")]);
        }
        return Promise.resolve(skills.map(({ name, mdPath }) => new SkillItem(mdPath, name)));
      }
      if (element.groupId === "agents") {
        const agents = this.listAgents();
        if (agents.length === 0) {
          return Promise.resolve([new PlaceholderItem("Create agent →", "devory.agentCreate")]);
        }
        return Promise.resolve(
          agents.map(({ name, filePath }) => new AgentItem(filePath, name))
        );
      }
    }

    return Promise.resolve([]);
  }

  private listDoctrineFiles(): string[] {
    const doctrineDir = path.join(this.factoryRoot, "doctrine");
    if (!fs.existsSync(doctrineDir)) return [];
    try {
      return fs
        .readdirSync(doctrineDir)
        .filter((f) => f.endsWith(".md") && !fs.statSync(path.join(doctrineDir, f)).isDirectory())
        .sort()
        .map((f) => path.join(doctrineDir, f));
    } catch {
      return [];
    }
  }

  private listAgents(): Array<{ name: string; filePath: string }> {
    const agentsDir = path.join(this.factoryRoot, "agents");
    if (!fs.existsSync(agentsDir)) return [];
    try {
      return fs
        .readdirSync(agentsDir)
        .filter((f) => {
          if (!f.endsWith(".md")) return false;
          const fullPath = path.join(agentsDir, f);
          return fs.statSync(fullPath).isFile();
        })
        .sort()
        .map((f) => ({
          name: f.replace(/\.md$/, ""),
          filePath: path.join(agentsDir, f),
        }));
    } catch {
      return [];
    }
  }

  private listSkills(): Array<{ name: string; mdPath: string }> {
    const skillsDir = path.join(this.factoryRoot, "skills");
    if (!fs.existsSync(skillsDir)) return [];
    try {
      return fs
        .readdirSync(skillsDir)
        .filter((entry) => {
          const skillMd = path.join(skillsDir, entry, "SKILL.md");
          return fs.existsSync(skillMd);
        })
        .sort()
        .map((entry) => ({
          name: entry,
          mdPath: path.join(skillsDir, entry, "SKILL.md"),
        }));
    } catch {
      return [];
    }
  }
}
