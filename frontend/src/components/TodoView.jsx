import { useLayoutEffect, useRef } from 'react';
import WeatherWidget from './WeatherWidget.jsx';
import { formatClock, formatShortDate } from '../utils/date.js';

// Same shrink-to-fit floor/ceiling DayAgenda.jsx uses for the today view --
// matching them means a packed to-do list and a packed agenda shrink by
// the same rule instead of feeling like two different behaviors.
const TODO_FONT_MAX = 22;
const TODO_FONT_MIN = 12;

// Data shape: [{ id, title, completed, due, importance }]
//
// Checkboxes are purely a visual read/not-read indicator of each item's
// real completion state — there's no touch input on this display to
// toggle them.
export default function TodoView({ tasks, privacyMode, weather, settings }) {
  const listRef = useRef(null);
  const tasksSignature = tasks.map((task) => `${task.id}:${task.completed}`).join(',');

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Binary-search the largest font-size in [MIN, MAX] whose natural
    // content height still fits without scrolling -- identical approach
    // to DayAgenda.jsx's own search, just against .todo-list instead of
    // .agenda__list. Checkbox size and the due-date line are both sized
    // in em off --todo-font-size (see base.css), so the whole row scales
    // together instead of the icon/text/due-date drifting out of
    // proportion with each other.
    let lo = TODO_FONT_MIN;
    let hi = TODO_FONT_MAX;
    let best = TODO_FONT_MIN;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      list.style.setProperty('--todo-font-size', `${mid}px`);
      if (list.scrollHeight <= list.clientHeight + 0.5) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    list.style.setProperty('--todo-font-size', `${best}px`);
    // Re-runs whenever the task list's identity/completion actually
    // changes -- a plain `[tasks]` dependency would also fire on every
    // reference change with the same content, same reasoning as
    // DayAgenda's eventsSignature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksSignature]);

  return (
    <section className="todo">
      <h2 className="todo__heading">To Do</h2>
      {privacyMode ? (
        <p className="view__empty">Privacy mode activated</p>
      ) : tasks.length === 0 ? (
        <p className="view__empty">Nothing on the list.</p>
      ) : (
        <ul className="todo-list" ref={listRef}>
          {tasks.map((task) => {
            const due = task.due ? new Date(task.due) : null;
            return (
              <li key={task.id} className={`todo-list__item${task.completed ? ' is-completed' : ''}`}>
                <span className="todo-list__checkbox" aria-hidden="true">
                  {task.completed ? (
                    // viewBox has a 1-unit margin on every side (-1 -1 20 20,
                    // not 0 0 18 18) even though the path's own coordinates
                    // still only span 0-18 -- the path's flat edges touch 0
                    // and 18 exactly, which is also the old viewBox's own
                    // clip boundary, so a device that rounds sub-pixel
                    // anti-aliased coverage the wrong way there can shave a
                    // hairline off that edge (a "chopped" look on some
                    // screens/scale factors but not others). The extra
                    // margin gives that anti-aliasing somewhere to bleed
                    // into instead of getting clipped.
                    <svg viewBox="-1 -1 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M16 0C17.1046 0 18 0.895431 18 2V16C18 17.1046 17.1046 18 16 18H2C0.895431 18 8.05332e-09 17.1046 0 16V2C0 0.895431 0.895431 8.05319e-09 2 0H16ZM7 9.89258L4.40039 7.29297L2.29297 9.40039L7 14.1074L15.707 5.40039L13.5996 3.29297L7 9.89258Z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    // Same margin reasoning as above -- the rect's own stroke
                    // is centered on its path, so its outer edge sits exactly
                    // at 0/18 too (x=1, strokeWidth=2 -> outer edge at 0).
                    <svg viewBox="-1 -1 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="1" y="1" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </span>
                <span className="todo-list__body">
                  <span className="todo-list__title">{task.title}</span>
                  {due && (
                    <span className="todo-list__due">
                      {formatShortDate(due)} • {formatClock(due)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {/* Unlike the legend, this shows even in privacy mode -- the outside
          temperature doesn't reveal anything about the calendar or to-do
          list, which is what that mode is actually hiding. Real flex
          sibling here too (see .weather in base.css), same reasoning as
          the legend: .todo-list/.view__empty (flex: 1) shrink to leave
          it real room instead of the two overlapping. */}
      <WeatherWidget weather={weather} settings={settings} />
    </section>
  );
}
