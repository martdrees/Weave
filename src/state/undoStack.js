//@ts-check
/** Simple snapshot undo/redo for the local track list. */

function MixAppCreateUndoStack(limit) {
  const max = limit || 40;
  let past = [];
  let future = [];

  function cloneTracks(tracks) {
    return (tracks || []).map((t) => ({ ...t }));
  }

  return {
    push(tracks) {
      past.push(cloneTracks(tracks));
      if (past.length > max) past.shift();
      future = [];
    },
    undo(current) {
      if (!past.length) return null;
      future.push(cloneTracks(current));
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(cloneTracks(current));
      return future.pop();
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    clear() {
      past = [];
      future = [];
    },
    exportState() {
      return {
        past: past.map(cloneTracks),
        future: future.map(cloneTracks),
      };
    },
    importState(data) {
      past = Array.isArray(data?.past) ? data.past.map(cloneTracks) : [];
      future = Array.isArray(data?.future) ? data.future.map(cloneTracks) : [];
      if (past.length > max) past = past.slice(past.length - max);
      if (future.length > max) future = future.slice(future.length - max);
    },
  };
}
