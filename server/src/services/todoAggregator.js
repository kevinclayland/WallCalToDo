import { getCachedTasks as getCachedMicrosoftTasks } from './todoService.js';
import { getCachedTasks as getCachedGoogleTasks } from './googleTasksService.js';

// Both providers' getCachedTasks() already sort internally (completed
// last, then due date) -- merging just needs to fold the two
// already-sorted arrays under the same comparator, not re-derive it.
// Kept in one place because it now has two callers (ws/hub.js's initial
// connect snapshot and poller.js's post-poll/cleanup broadcasts) that
// both need the exact same merged view -- duplicating this logic in both
// would only take one of them getting edited later for the two to
// quietly drift apart.
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.due || '').localeCompare(b.due || '');
  });
}

export function getMergedTasks() {
  return sortTasks([...getCachedMicrosoftTasks(), ...getCachedGoogleTasks()]);
}
