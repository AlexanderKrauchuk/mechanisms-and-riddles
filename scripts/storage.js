const MODULE_ID = "mechanisms-and-riddles";

export class PuzzleStorage {
  /**
   * Возвращает загадки, доступные текущему пользователю.
   * Управление хранилищем разрешено только мастеру.
   */
  static list() {
    this.#requireGM();

    return game.journal
      .filter((entry) => entry.getFlag(MODULE_ID, "puzzle"))
      .map((entry) => ({
        id: entry.id,
        ...foundry.utils.deepClone(entry.getFlag(MODULE_ID, "puzzle"))
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  static get(id) {
    this.#requireGM();

    const entry = game.journal.get(id);
    const puzzle = entry?.getFlag(MODULE_ID, "puzzle");
    if (!puzzle) return null;

    return {
      id: entry.id,
      ...foundry.utils.deepClone(puzzle)
    };
  }

  static async create({ name, type, description = "" }) {
    this.#requireGM();

    const puzzle = {
      schemaVersion: 1,
      type,
      name: name.trim(),
      description: description.trim(),
      hints: [],
      config: {},
      state: {
        solved: false,
        data: {}
      },
      actions: {
        success: [],
        failure: []
      },
      createdAt: new Date().toISOString()
    };

    const [entry] = await JournalEntry.createDocuments([
      {
        name: puzzle.name,
        ownership: { default: 0 },
        flags: {
          [MODULE_ID]: { puzzle }
        }
      }
    ]);

    return { id: entry.id, ...puzzle };
  }

  static async update(id, changes) {
    this.#requireGM();

    const entry = game.journal.get(id);
    const current = entry?.getFlag(MODULE_ID, "puzzle");
    if (!entry || !current) {
      throw new Error("Загадка не найдена.");
    }

    const next = foundry.utils.mergeObject(
      foundry.utils.deepClone(current),
      changes,
      { inplace: false }
    );

    if (typeof next.name !== "string" || !next.name.trim()) {
      throw new Error("У загадки должно быть название.");
    }

    next.name = next.name.trim();

    await entry.update({
      name: next.name,
      [`flags.${MODULE_ID}.puzzle`]: next
    });

    return { id: entry.id, ...next };
  }

  static async reset(id) {
    const puzzle = this.get(id);
    if (!puzzle) throw new Error("Загадка не найдена.");

    return this.update(id, {
      state: {
        solved: false,
        data: {}
      }
    });
  }

  static async delete(id) {
    this.#requireGM();

    const entry = game.journal.get(id);
    if (!entry?.getFlag(MODULE_ID, "puzzle")) {
      throw new Error("Загадка не найдена.");
    }

    await entry.delete();
  }

  static #requireGM() {
    if (!game.user?.isGM) {
      throw new Error("Управлять загадками может только мастер.");
    }
  }
}
