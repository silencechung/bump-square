export type AssetType = 'icon' | 'text' | 'line' | 'shape' | 'image' | 'component';

export interface Asset {
  id: string;
  type: AssetType;
  label: string;
  imageUrl: string;      // base64 or blob URL of cropped element
  x: number;            // original position in source image
  y: number;
  width: number;
  height: number;
  comment?: string;
}

export interface Square {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  assets: string[];     // Asset IDs placed inside
  comment?: string;     // the user's own intent note (editable)
  aiNote?: string;      // agent's inferred role — read-only in the UI, shown
                        // distinctly from `comment` so the two act as a
                        // double-confirmation (agent proposes ⟷ user confirms)
}

export interface StructureNode {
  id: string;
  label: string;
  type: string;
  comment?: string;     // the confirmed intent carried from the frame — the
                        // "why", so the structure is shape + intent, not just shape
  children?: StructureNode[];
  squareId?: string;
}

export type WorkflowStep = 'upload' | 'layout' | 'structure';

/**
 * A UI → agent signal. The browser pushes one of these when the user wants
 * Claude to act on the current board (e.g. infer roles for new frames). The
 * agent watches the SSE stream, picks up pending requests, acts, then resolves
 * them. `kind` is open-ended so new agent actions can reuse the same channel.
 */
export interface AgentRequest {
  id: string;
  kind: 'review' | string;
  note?: string;            // optional freeform context from the user
  status: 'pending' | 'done';
  createdAt: number;
}
