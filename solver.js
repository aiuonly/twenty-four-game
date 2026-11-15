/*
 * 24 点求解器（纯逻辑，无 DOM 依赖）
 * 浏览器中挂载到 window.Game24；Node 中通过 module.exports 使用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game24 = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  // 用分数表示，避免浮点误差
  const F = {
    make(n, d = 1) {
      if (d === 0) return null;
      if (d < 0) {
        n = -n;
        d = -d;
      }
      const g = gcd(n, d);
      return { n: n / g, d: d / g };
    },
    add(a, b) {
      return F.make(a.n * b.d + b.n * a.d, a.d * b.d);
    },
    sub(a, b) {
      return F.make(a.n * b.d - b.n * a.d, a.d * b.d);
    },
    mul(a, b) {
      return F.make(a.n * b.n, a.d * b.d);
    },
    div(a, b) {
      return b.n === 0 ? null : F.make(a.n * b.d, a.d * b.n);
    },
    eq(a, b) {
      return a.n * b.d === b.n * a.d;
    },
    is24(a) {
      return a.n === 24 * a.d;
    },
    str(a) {
      return a.d === 1 ? String(a.n) : a.n + '/' + a.d;
    },
  };

  const OP_FNS = {
    '+': F.add,
    '-': F.sub,
    '×': F.mul,
    '÷': F.div,
  };

  const ALL_OPS = ['+', '-', '×', '÷'];

  const LEVELS = {
    easy: { name: '简单', min: 1, max: 9, ops: ['+', '-', '×'], noNegative: true },
    medium: { name: '中等', min: 1, max: 10, ops: ALL_OPS, noNegative: false },
    hard: { name: '困难', min: 1, max: 13, ops: ALL_OPS, noNegative: false },
  };

  /**
   * 搜索一种凑出 24 的方法。
   * @param {number[]} numbers 四张牌的数字
   * @param {string[]} ops 允许使用的运算符
   * @param {{noNegative?: boolean}} options 是否禁止中间结果为负数
   * @returns {string|null} 表达式，或 null 表示无解
   */
  function solve(numbers, ops = ALL_OPS, options = {}) {
    const noNegative = !!options.noNegative;
    const start = numbers.map((n) => ({
      v: F.make(n),
      expr: String(n),
      simple: true,
    }));
    let found = null;

    function search(items) {
      if (found) return;
      if (items.length === 1) {
        if (F.is24(items[0].v)) found = items[0].expr;
        return;
      }

      for (let i = 0; i < items.length; i++) {
        for (let j = 0; j < items.length; j++) {
          if (i === j) continue;
          const a = items[i];
          const b = items[j];

          for (const op of ops) {
            // 加法和乘法满足交换律，避免重复搜索
            if ((op === '+' || op === '×') && i > j) continue;

            const v = OP_FNS[op](a.v, b.v);
            if (!v) continue;
            if (noNegative && v.n < 0) continue;

            const rest = [];
            for (let k = 0; k < items.length; k++) {
              if (k !== i && k !== j) rest.push(items[k]);
            }
            rest.push({
              v,
              expr:
                (a.simple ? a.expr : '(' + a.expr + ')') +
                op +
                (b.simple ? b.expr : '(' + b.expr + ')'),
              simple: false,
            });

            search(rest);
            if (found) return;
          }
        }
      }
    }

    search(start);
    return found;
  }

  /**
   * 随机生成一道一定有解的题。
   * @param {'easy'|'medium'|'hard'} level
   * @returns {{nums: number[], solution: string}}
   */
  function generatePuzzle(level) {
    const cfg = LEVELS[level] || LEVELS.easy;

    for (let attempt = 0; attempt < 400; attempt++) {
      const nums = [];
      for (let i = 0; i < 4; i++) {
        nums.push(cfg.min + Math.floor(Math.random() * (cfg.max - cfg.min + 1)));
      }
      const solution = solve(nums, cfg.ops, { noNegative: cfg.noNegative });
      if (solution) return { nums, solution };
    }

    // 理论上几乎不会走到这里，兜底给一道简单的题
    return { nums: [6, 6, 6, 6], solution: '6+6+6+6' };
  }

  return { F, OP_FNS, ALL_OPS, LEVELS, solve, generatePuzzle };
});
