import type { strings as ZhTW } from './zh-TW';

/**
 * English mirror of `zh-TW.ts`. The `Record<keyof typeof ZhTW, string>` type
 * means TypeScript will fail to compile if a key exists in zh-TW but is missing
 * here (or vice versa — keyof is exact). This is the type-safety guarantee
 * that motivated picking TS over JSON for the dict source format.
 */

export const strings: Record<keyof typeof ZhTW, string> = {
  // header
  'header.step.upload': '① Upload a design screenshot',
  'header.step.layout': '② Draw frames + note each block\'s intent (comment) → generate structure',
  'header.step.structure': '③ Review the structure, hand it off to your dev agent',
  'header.ai.spec.label': 'Generate Spec',
  'header.ai.spec.running': 'Generating…',
  'header.ai.spec.why': 'Build the intent tree + assets prompt in one pass (full spec)',
  'header.ai.spec.gate': 'Draw at least one Frame in Layout first',
  'header.copy.done': 'Copied',
  'header.copy.action': 'Copy path',
  'header.copy.tipDone': 'Copied to clipboard!',
  'header.copy.tipPrefix': 'Copy the latest save path (',
  'header.copy.tipSuffix': ') for the downstream reader skill',
  'header.copy.tipEmpty': 'No saves yet — create one from the Saves menu first',
  'header.ai.busyOther': 'Another AI action is in progress — please wait',
  'header.ai.runningPrefix': 'Claude is running ',
  'header.ai.runningSuffix': '…',
  'header.reset.armedLabel': 'Confirm clear?',
  'header.reset.idleLabel': 'Reset',
  'header.reset.armedTitle': 'Click again to confirm clearing the whole board',
  'header.reset.idleTitle': 'Clear the whole board (no undo — history is wiped too)',
  'header.annotation.on': 'Close help annotations',
  'header.annotation.off': 'Open help annotations — clickable dots appear next to each feature',
  'header.locale.toEn': 'Switch the UI to English',
  'header.locale.toZh': 'Switch the UI back to 繁中',
  'header.terminal.toggle': 'Toggle the claude --print terminal panel (Ctrl+`)',
  'header.structureReady': 'structure ready',

  // canvas
  'canvas.frame.enter': 'Enter Frame mode: drag empty space to draw, Ctrl + drag a frame body to move',
  'canvas.frame.exit': 'Exit Frame mode (back to Hand)',
  'canvas.undo': 'Undo (Ctrl+Z)',
  'canvas.redo': 'Redo (Ctrl+Shift+Z / Ctrl+Y)',
  'canvas.place.hint': 'Click to place',
  'canvas.place.cut': '(cut)',
  'canvas.place.cancel': 'Esc to cancel',
  'canvas.frame.dup': 'Duplicate frame (with children)',
  'canvas.ai.label': 'AI guess',
  'canvas.ai.adopt': 'Adopt',
  'canvas.ai.adoptTitle': 'Adopt as my comment',
  'canvas.ai.dismissTitle': 'Dismiss this guess',

  // saves
  'saves.menuTitle': 'Save / load board snapshots',
  'saves.menu': 'Saves',
  'saves.loaded': 'Loaded',
  'saves.overwriteTitle': 'Overwrite this save with the current board',
  'saves.save': 'Save',
  'saves.namePlaceholder': 'Save name…',
  'saves.saveAs': 'Save as…',
  'saves.empty': 'No saves yet. Name it and press "Save" to keep the current board.',
  'saves.loadPrefix': 'Load "',
  'saves.loadSuffix': '"',
  'saves.load': 'Load',
  'saves.delete': 'Delete this save',
  'saves.modalTitle': 'Save as',
  'saves.modalPlaceholder': 'Enter a save name…',
  'saves.dupPrefix': '"',
  'saves.dupSuffix': '" already exists — pick another name.',
  'saves.cancel': 'Cancel',

  // structure
  'structure.heading': 'Generated Structure',
  'structure.hint': 'AI actions live in the top-right of the header',
  'structure.stale.headline': 'The spec below is out of date with the current Frames',
  'structure.stale.prompt': 'Spec is stale — press header「✨ Generate Spec」to regenerate.',
  'structure.stale.assets': 'Spec is stale — press header「✨ Generate Spec」to regenerate.',
  'structure.edited': 'edited',
  'structure.reset': 'Reset',
  'structure.toggleTitle': 'Toggle: preview (rendered) / source (editable)',
  'structure.source': 'Source',

  // tree
  'tree.expand': 'Expand',
  'tree.collapse': 'Collapse',

  // agent
  'agent.clear': 'Clear agent event log',
  'agent.emptyTop': 'Each press of the ✨ Generate Spec button in the header records a row here.',
  'agent.emptyBottom.prefix': 'Running entries show a spinner; completed ones show ',
  'agent.emptyBottom.suffix': ' + a one-line summary. Live output is in the bottom terminal panel.',
  'agent.footer': 'Live output is in the bottom terminal panel.',

  // terminal
  'terminal.clear': 'Clear terminal output',
  'terminal.close': 'Close terminal panel (Ctrl+`)',

  // installBanner
  'installBanner.msg': ' skill is not installed — Claude can\'t generate structures',
  'installBanner.installing': 'Installing…',
  'installBanner.install': 'Install + retry',
  'installBanner.close': 'Close',

  // annotation
  'annotation.dotLabel': 'help: ',
  'annotation.missing': '(missing help content)',
};
