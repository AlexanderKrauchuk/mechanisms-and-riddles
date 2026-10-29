const MODULE_ID = "mechanisms-and-riddles";

/**
 * Выполняет список настроенных действий на клиенте мастера.
 *
 * Форматы:
 * { type: "chat", content: "Текст для чата" }
 * { type: "tile", uuid: "Scene.<sceneId>.Tile.<tileId>", visible: false }
 * { type: "sound", src: "sounds/puzzle-solved.ogg", volume: 0.8 }
 * { type: "macro", uuid: "Macro.<macroId>" }
 */
export class PuzzleActions {
  static async run(actions, context = {}) {
    if (!game.user?.isGM) {
      throw new Error("Действия загадки может выполнять только мастер.");
    }

    if (!Array.isArray(actions)) {
      throw new Error("Список действий должен быть массивом.");
    }

    const results = [];

    for (const action of actions) {
      try {
        results.push({
          action,
          ok: true,
          result: await this.#runOne(action, context)
        });
      } catch (error) {
        console.error(`${MODULE_ID} | Ошибка действия:`, action, error);
        results.push({
          action,
          ok: false,
          error: error.message ?? String(error)
        });
      }
    }

    return results;
  }

  static async #runOne(action, context) {
    if (!action || typeof action !== "object") {
      throw new Error("Некорректное описание действия.");
    }

    switch (action.type) {
      case "chat":
        return this.#chat(action, context);

      case "tile":
        return this.#tile(action);

      case "sound":
        return this.#sound(action);

      case "macro":
        return this.#macro(action, context);

      default:
        throw new Error(`Неизвестный тип действия: ${action.type}`);
    }
  }

  static async #chat(action, context) {
    const content = this.#renderText(action.content, context);
    if (!content.trim()) throw new Error("Сообщение для чата пустое.");

    return ChatMessage.create({
      content: foundry.utils.escapeHTML(content),
      speaker: ChatMessage.getSpeaker()
    });
  }

  static async #tile(action) {
    if (typeof action.uuid !== "string") {
      throw new Error("Для действия с плиткой требуется UUID.");
    }
    if (typeof action.visible !== "boolean") {
      throw new Error("Для плитки укажите visible: true или false.");
    }

    const document = await fromUuid(action.uuid);
    if (!(document instanceof TileDocument)) {
      throw new Error("Указанный UUID не относится к плитке.");
    }

    await document.update({ hidden: !action.visible });
    return { uuid: document.uuid, visible: action.visible };
  }

  static #sound(action) {
    if (typeof action.src !== "string" || !action.src.trim()) {
      throw new Error("Для звука требуется путь к аудиофайлу.");
    }

    const volume = Number(action.volume ?? 0.8);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new Error("Громкость должна быть числом от 0 до 1.");
    }

    // broadcast=true передаёт звук другим клиентам через штатный API Foundry.
    AudioHelper.play(
      {
        src: action.src,
        volume,
        autoplay: true,
        loop: false
      },
      true
    );

    return { src: action.src };
  }

  static async #macro(action, context) {
    const enabled = game.settings.get(MODULE_ID, "allowMacroActions");
    if (!enabled) {
      throw new Error(
        "Вызов макросов отключён. Включите его в настройках модуля, только если доверяете настроенным макросам."
      );
    }

    if (typeof action.uuid !== "string") {
      throw new Error("Для вызова макроса требуется UUID.");
    }

    const macro = await fromUuid(action.uuid);
    if (!(macro instanceof Macro)) {
      throw new Error("Указанный UUID не относится к макросу.");
    }

    // Макросы могут выполнять произвольный код. UUID макроса должен
    // быть задан и проверен мастером; данные игрока в аргументы не передаём.
    return macro.execute({
      puzzleId: context.puzzleId ?? null,
      puzzleName: context.puzzleName ?? null,
      outcome: context.outcome ?? null
    });
  }

  static #renderText(template, context) {
    if (typeof template !== "string") return "";

    // Не интерполируем произвольные значения или HTML из данных игрока.
    return template
      .replaceAll("{puzzleName}", String(context.puzzleName ?? ""))
      .replaceAll("{outcome}", String(context.outcome ?? ""));
  }
}
