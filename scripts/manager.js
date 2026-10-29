import { PuzzleStorage } from "./storage.js";

const TYPES = {
  sliding: "Пятнашки",
  rings: "Поворотные кольца",
  sequence: "Последовательность символов"
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showPrompt({ title, label, value = "" }) {
  return new Promise((resolve) => {
    const content = `
      <form>
        <div class="form-group">
          <label>${escapeHTML(label)}</label>
          <input name="value" type="text" value="${escapeHTML(value)}" autofocus>
        </div>
      </form>`;

    new Dialog({
      title,
      content,
      buttons: {
        save: {
          label: "Сохранить",
          callback: (html) => resolve(html.find('[name="value"]').val()?.trim() ?? null)
        },
        cancel: {
          label: "Отмена",
          callback: () => resolve(null)
        }
      },
      default: "save",
      close: () => resolve(null)
    }).render(true);
  });
}

function showTypePicker() {
  return new Promise((resolve) => {
    const options = Object.entries(TYPES)
      .map(([value, label]) =>
        `<option value="${value}">${escapeHTML(label)}</option>`
      )
      .join("");

    new Dialog({
      title: "Тип загадки",
      content: `<form><div class="form-group">
        <label>Тип</label><select name="type">${options}</select>
      </div></form>`,
      buttons: {
        create: {
          label: "Продолжить",
          callback: (html) => resolve(html.find('[name="type"]').val())
        },
        cancel: { label: "Отмена", callback: () => resolve(null) }
      },
      default: "create",
      close: () => resolve(null)
    }).render(true);
  });
}

export class PuzzleManager {
  static async open() {
    if (!game.user?.isGM) {
      ui.notifications.warn("Панель управления доступна только мастеру.");
      return;
    }

    const puzzles = PuzzleStorage.list();
    const rows = puzzles.length
      ? puzzles.map((puzzle) => `
          <li data-id="${escapeHTML(puzzle.id)}">
            <strong>${escapeHTML(puzzle.name)}</strong>
            <span> — ${escapeHTML(TYPES[puzzle.type] ?? puzzle.type)}</span>
            <div class="form-group">
              <button type="button" data-action="edit">Редактировать</button>
              <button type="button" data-action="reset">Сбросить</button>
              <button type="button" data-action="delete">Удалить</button>
            </div>
          </li>`).join("")
      : "<li>Загадок пока нет.</li>";

    new Dialog({
      title: "Механизмы и загадки",
      content: `<ol class="mechanisms-riddles-list">${rows}</ol>`,
      buttons: {
        create: {
          label: "Создать загадку",
          callback: () => void this.#create()
        },
        close: { label: "Закрыть" }
      },
      render: (html) => this.#bindList(html)
    }).render(true);
  }

  static #bindList(html) {
    html.on("click", "[data-action]", async (event) => {
      const button = event.currentTarget;
      const row = button.closest("[data-id]");
      const id = row?.dataset.id;
      if (!id) return;

      try {
        switch (button.dataset.action) {
          case "edit":
            await this.#edit(id);
            break;
          case "reset":
            await PuzzleStorage.reset(id);
            ui.notifications.info("Состояние загадки сброшено.");
            break;
          case "delete":
            await this.#delete(id);
            break;
        }
      } catch (error) {
        console.error("mechanisms-and-riddles | Ошибка управления:", error);
        ui.notifications.error(error.message ?? "Не удалось выполнить действие.");
      }
    });
  }

  static async #create() {
    const type = await showTypePicker();
    if (!type) return;

    const name = await showPrompt({
      title: "Новая загадка",
      label: "Название"
    });
    if (!name) return;

    const description = await showPrompt({
      title: "Описание загадки",
      label: "Описание"
    });
    if (description === null) return;

    await PuzzleStorage.create({ name, type, description });
    ui.notifications.info(`Создана загадка «${name}».`);
    this.open();
  }

  static async #edit(id) {
    const puzzle = PuzzleStorage.get(id);
    if (!puzzle) throw new Error("Загадка не найдена.");

    const name = await showPrompt({
      title: "Редактировать загадку",
      label: "Название",
      value: puzzle.name
    });
    if (!name) return;

    const description = await showPrompt({
      title: "Описание загадки",
      label: "Описание",
      value: puzzle.description
    });
    if (description === null) return;

    await PuzzleStorage.update(id, { name, description });
    ui.notifications.info("Загадка обновлена.");
    this.open();
  }

  static async #delete(id) {
    const puzzle = PuzzleStorage.get(id);
    if (!puzzle) throw new Error("Загадка не найдена.");

    const confirmed = await Dialog.confirm({
      title: "Удалить загадку?",
      content: `<p>Удалить «${escapeHTML(puzzle.name)}»? Это действие нельзя отменить.</p>`
    });

    if (!confirmed) return;

    await PuzzleStorage.delete(id);
    ui.notifications.info("Загадка удалена.");
    this.open();
  }
}
