let currentView = 'calendar';

export function getCurrentView() {
  return currentView;
}

export function setView(view) {
  if (view !== 'calendar' && view !== 'todo') {
    throw new Error(`Invalid view: ${view}`);
  }
  currentView = view;
  return currentView;
}

export function toggleView() {
  currentView = currentView === 'calendar' ? 'todo' : 'calendar';
  return currentView;
}
