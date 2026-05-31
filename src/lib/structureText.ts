import type { StructureNode } from '../types';

/**
 * Render the intent structure as the MARKDOWN prompt handed to the build agent.
 * Split into TWO parts:
 *
 *   1. 結構 — the hierarchy by FRAME NAME drawn as an ASCII tree, wrapped in a
 *      markdown code fence so a markdown viewer preserves the tree shape.
 *   2. 節點說明 — per node: **name** — type, with the confirmed comment as a
 *      nested bullet — plain markdown.
 *
 * Auto-derived from the tree, so what the user confirms is exactly what the
 * agent receives (no drift).
 *
 * Example:
 *   ## 結構
 *
 *   ```
 *   Login Widge
 *   ├─ Login Button
 *   └─ Forget Password Link
 *   ```
 *
 *   ## 節點說明
 *
 *   - **Login Widge** — Row (flex · space-between)
 *     - 整列為登入動作列…
 *   - **Login Button** — Button (primary CTA)
 *     - 主要 CTA：送出登入…
 */
export function treeToConsole(root: StructureNode | null): string {
  if (!root) return '';
  const treeLines: string[] = [];
  const detailLines: string[] = [];

  // Part 1: ASCII tree (rendered inside a code fence → monospace, shape kept).
  function walkTree(node: StructureNode, prefix: string, isLast: boolean, isRoot: boolean) {
    const connector = isRoot ? '' : isLast ? '└─ ' : '├─ ';
    treeLines.push(`${prefix}${connector}${node.label}`);
    const childPrefix = prefix + (isRoot ? '' : isLast ? '   ' : '│  ');
    const kids = node.children ?? [];
    kids.forEach((child, i) => walkTree(child, childPrefix, i === kids.length - 1, false));
  }

  // Part 2: per-node detail as a markdown list (**name** — type, comment nested).
  function walkDetail(node: StructureNode) {
    const type = node.type?.trim();
    detailLines.push(`- **${node.label}**${type ? ` — ${type}` : ''}`);
    if (node.comment?.trim()) {
      detailLines.push(`  - ${node.comment.trim()}`);
    }
    (node.children ?? []).forEach(walkDetail);
  }

  walkTree(root, '', true, true);
  walkDetail(root);

  return [
    `## 結構\n\n\`\`\`\n${treeLines.join('\n')}\n\`\`\``,
    `## 節點說明\n\n${detailLines.join('\n')}`,
  ].join('\n\n');
}
