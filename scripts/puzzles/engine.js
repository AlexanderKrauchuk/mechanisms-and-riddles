/**
 * Механики загадок.
 *
 * Форматы config:
 *
 * sliding:
 *   { rows: 3, columns: 3 }
 *
 * rings:
 *   { sectors: 8, target: [0, 3, 5] }
 *
 * sequence:
 *   {
 *     symbols: ["луна", "солнце", "ключ"],
 *     solution: ["луна", "ключ"],
 *     failureBehavior: "reset" | "keep-prefix"
 *   }
 *
 * State — только текущее состояние игры.
 * Решение хранится в config и не должно отправляться клиентам игроков.
 */

function assertInteger(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name}: значение должно быть целым числом от ${min} до ${max}.`);
  }
}

function clone(value) {
  return foundry.utils.deepClone(value);
}

export class PuzzleEngine {
  static createInitialState(type, config) {
    switch (type) {
      case "sliding": {
        const { rows, columns } = config;
        assertInteger(rows, "Количество строк", 2, 8);
        assertInteger(columns, "Количество столбцов", 2, 8);

        const size = rows * columns;
        return {
          board: [...Array.from({ length: size - 1 }, (_, i) => i + 1), null],
          moves: 0
        };
      }

      case "rings": {
        const { sectors, target } = config;
        assertInteger(sectors, "Количество секторов", 2, 64);

        if (!Array.isArray(target) || target.length < 1 || target.length > 16) {
          throw new Error("Для колец задайте правильное положение каждого кольца.");
        }

        if (target.some((value) => !Number.isInteger(value) || value < 0 || value >= sectors)) {
          throw new Error("Положение кольца должно быть в диапазоне от 0 до числа секторов минус 1.");
        }

        return {
          positions: target.map(() => 0),
          moves: 0
        };
      }

      case "sequence": {
        const { symbols, solution } = config;

        if (!Array.isArray(symbols) || symbols.length < 2) {
          throw new Error("Для последовательности задайте не менее двух символов.");
        }
        if (!Array.isArray(solution) || solution.length < 1) {
          throw new Error("Правильная последовательность не должна быть пустой.");
        }
        if (solution.some((symbol) => !symbols.includes(symbol))) {
          throw new Error("Все символы решения должны присутствовать в списке символов.");
        }

        return { input: [], solved: false, mistakes: 0 };
      }

      default:
        throw new Error(`Неизвестный тип загадки: ${type}`);
    }
  }

  static applyMove(type, config, state, move) {
    if (!state || typeof state !== "object") {
      throw new Error("Состояние загадки повреждено или отсутствует.");
    }

    switch (type) {
      case "sliding":
        return this.#moveSliding(config, state, move);

      case "rings":
        return this.#moveRing(config, state, move);

      case "sequence":
        return this.#pressSymbol(config, state, move);

      default:
        throw new Error(`Неизвестный тип загадки: ${type}`);
    }
  }

  static isSolved(type, config, state) {
    if (!state) return false;

    switch (type) {
      case "sliding": {
        const size = config.rows * config.columns;
        if (!Array.isArray(state.board) || state.board.length !== size) return false;
        return state.board.every((value, index) =>
          index === size - 1 ? value === null : value === index + 1
        );
      }

      case "rings":
        return Array.isArray(state.positions)
          && Array.isArray(config.target)
          && state.positions.length === config.target.length
          && state.positions.every((position, index) => position === config.target[index]);

      case "sequence":
        return state.solved === true;

      default:
        return false;
    }
  }

  /**
   * Перемешивает пятнашки только легальными ходами от решённого состояния.
   * Поэтому полученная позиция всегда решаема.
   */
  static shuffleSliding(config, { steps = 100 } = {}) {
    const state = this.createInitialState("sliding", config);
    const { rows, columns } = config;
    const size = rows * columns;
    assertInteger(steps, "Число ходов перемешивания", 1, 10000);

    let previousEmpty = -1;

    for (let step = 0; step < steps; step += 1) {
      const empty = state.board.indexOf(null);
      const neighbors = this.#neighbors(empty, rows, columns)
        .filter((index) => index !== previousEmpty);

      const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
      previousEmpty = empty;

      [state.board[empty], state.board[chosen]] =
        [state.board[chosen], state.board[empty]];
    }

    // Не оставляем случайно решённое поле после перемешивания.
    if (this.isSolved("sliding", config, state)) {
      const empty = state.board.indexOf(null);
      const neighbor = this.#neighbors(empty, rows, columns)[0];
      [state.board[empty], state.board[neighbor]] =
        [state.board[neighbor], state.board[empty]];
    }

    state.moves = 0;
    return state;
  }

  static #moveSliding(config, state, move) {
    const { rows, columns } = config;
    const size = rows * columns;
    const board = state.board;

    if (!Array.isArray(board) || board.length !== size) {
      throw new Error("Некорректное состояние поля пятнашек.");
    }

    const index = move?.index;
    if (!Number.isInteger(index) || index < 0 || index >= size) {
      throw new Error("Некорректный ход: выбрана неизвестная плитка.");
    }

    const empty = board.indexOf(null);
    if (empty < 0 || !this.#neighbors(empty, rows, columns).includes(index)) {
      return { state: clone(state), accepted: false, solved: false, reason: "not-adjacent" };
    }

    const next = clone(state);
    [next.board[empty], next.board[index]] = [next.board[index], next.board[empty]];
    next.moves = (next.moves ?? 0) + 1;

    return {
      state: next,
      accepted: true,
      solved: this.isSolved("sliding", config, next)
    };
  }

  static #moveRing(config, state, move) {
    const { sectors, target } = config;
    const ring = move?.ring;
    const direction = move?.direction;

    if (!Number.isInteger(ring) || ring < 0 || ring >= target.length) {
      throw new Error("Некорректный номер кольца.");
    }
    if (direction !== "left" && direction !== "right") {
      throw new Error("Направление вращения должно быть left или right.");
    }
    if (!Array.isArray(state.positions) || state.positions.length !== target.length) {
      throw new Error("Некорректное состояние колец.");
    }

    const next = clone(state);
    const delta = direction === "right" ? 1 : -1;
    next.positions[ring] = (next.positions[ring] + delta + sectors) % sectors;
    next.moves = (next.moves ?? 0) + 1;

    return {
      state: next,
      accepted: true,
      solved: this.isSolved("rings", config, next)
    };
  }

  static #pressSymbol(config, state, move) {
    const { symbols, solution } = config;
    const symbol = move?.symbol;

    if (!symbols.includes(symbol)) {
      throw new Error("Такого символа нет в этой загадке.");
    }

    const next = clone(state);
    if (next.solved) {
      return { state: next, accepted: false, solved: true, reason: "already-solved" };
    }

    const input = [...(next.input ?? []), symbol];
    const prefixMatches = input.every((value, index) => value === solution[index]);

    if (!prefixMatches) {
      next.mistakes = (next.mistakes ?? 0) + 1;

      if (config.failureBehavior === "keep-prefix") {
        // Сохраняем самый длинный суффикс введённого, совпадающий
        // с началом решения. Это позволяет продолжить без полного сброса.
        let retained = [];
        for (let start = 1; start < input.length; start += 1) {
          const suffix = input.slice(start);
          if (suffix.every((value, index) => value === solution[index])) {
            retained = suffix;
          }
        }
        next.input = retained;
      } else {
        // Безопасное поведение по умолчанию — сбросить ввод.
        next.input = [];
      }

      return {
        state: next,
        accepted: false,
        solved: false,
        reason: "wrong-symbol"
      };
    }

    next.input = input;
    next.solved = input.length === solution.length;

    return {
      state: next,
      accepted: true,
      solved: next.solved
    };
  }

  static #neighbors(index, rows, columns) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const result = [];

    if (row > 0) result.push(index - columns);
    if (row < rows - 1) result.push(index + columns);
    if (column > 0) result.push(index - 1);
    if (column < columns - 1) result.push(index + 1);

    return result;
  }
}
