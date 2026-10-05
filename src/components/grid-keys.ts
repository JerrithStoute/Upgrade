/**
 * Spreadsheet-style arrow keys for an editable table: put onKeyDown={moveByArrow} on
 * the <table>. Cells are text boxes, dropdowns and buttons marked data-cell.
 */

const CELL = "input:not([type=checkbox]):not([type=radio]):not([disabled]), select:not([disabled]), textarea, button[data-cell]";

/** The row above / below, across the divisions (each division is its own table body). */
function nextRow(row: Element, up: boolean): Element | null {
  const sib = up ? row.previousElementSibling : row.nextElementSibling;
  if (sib) return sib;
  let body = up ? row.parentElement?.previousElementSibling : row.parentElement?.nextElementSibling;
  while (body && body.tagName !== "TBODY") body = up ? body.previousElementSibling : body.nextElementSibling;
  return body ? (up ? body.lastElementChild : body.firstElementChild) : null;
}

/**
 * Up / down: the same column in the next row that has a cell there. Left / right: the
 * next cell in the row — in a text box only once the cursor is at its start / end
 * (or everything is selected, as when you just arrived). Dropdowns move too.
 */
export function moveByArrow(e: React.KeyboardEvent<HTMLTableElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const key = e.key;
  if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight") return;
  const el = e.target as HTMLElement;
  if (!el.matches?.(CELL)) return;
  const td = el.closest("td");
  const tr = td?.parentElement as HTMLTableRowElement | null | undefined;
  if (!td || !tr || tr.closest("table") !== e.currentTarget) return;
  const sideways = key === "ArrowLeft" || key === "ArrowRight";
  if (sideways && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    const len = el.value.length;
    const a = el.selectionStart ?? 0;
    const b = el.selectionEnd ?? 0;
    const all = a === 0 && b === len;
    if (!all && (key === "ArrowLeft" ? b !== 0 : a !== len)) return;
  }
  const inRow = (row: Element, c: Element) => c.closest("tr") === row;
  let target: HTMLElement | null = null;
  if (sideways) {
    const cells = Array.from(tr.querySelectorAll<HTMLElement>(CELL)).filter((c) => inRow(tr, c));
    target = cells[cells.indexOf(el) + (key === "ArrowLeft" ? -1 : 1)] ?? null;
  } else {
    // Same column — and in a cell holding two (price / unit), the same one of the two.
    const col = td.cellIndex;
    const nth = Array.from(td.querySelectorAll(CELL)).indexOf(el);
    for (let row = nextRow(tr, key === "ArrowUp"); row; row = nextRow(row, key === "ArrowUp")) {
      const hits = Array.from((row as HTMLTableRowElement).cells?.[col]?.querySelectorAll<HTMLElement>(CELL) ?? []).filter((c) => inRow(row, c));
      if (hits.length) {
        target = hits[nth] ?? hits[0];
        break;
      }
    }
  }
  if (!target) return;
  e.preventDefault();
  target.focus();
  // Everything selected, so typing replaces it and the next arrow moves on (again once the cell has re-drawn).
  if (target instanceof HTMLInputElement) {
    const input = target;
    input.select();
    setTimeout(() => document.activeElement === input && input.select(), 0);
  }
}
