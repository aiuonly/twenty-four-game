const { test } = require('node:test');
const assert = require('node:assert/strict');
const { F, solve, generatePuzzle, LEVELS } = require('../solver.js');

function evaluate(expr) {
  const js = expr.replace(/×/g, '*').replace(/÷/g, '/');
  return Function('"use strict"; return (' + js + ');')();
}

function numbersIn(expr) {
  return (expr.match(/\d+/g) || []).map(Number).sort((a, b) => a - b);
}

test('分数运算正确且能整除归约', () => {
  assert.equal(F.str(F.make(8, 3)), '8/3');
  assert.equal(F.str(F.make(8, 4)), '2');
  assert.equal(F.str(F.make(-4, -2)), '2');
  assert.equal(F.str(F.add(F.make(8, 3), F.make(2, 3))), '10/3');
  assert.equal(F.str(F.mul(F.make(1, 3), F.make(3, 1))), '1');
  assert.equal(F.str(F.sub(F.make(3), F.make(9))), '-6');
  assert.equal(F.div(F.make(1), F.make(0)), null);
  assert.ok(F.eq(F.make(48, 2), F.make(24)));
  assert.ok(F.is24(F.make(-24, -1)));
});

test('已知题目：有解 / 无解', () => {
  assert.equal(solve([1, 1, 1, 1]), null);
  assert.ok(solve([6, 6, 6, 6]));
  assert.ok(solve([3, 3, 8, 8]));
  assert.ok(solve([1, 2, 3, 4]));
  assert.ok(solve([5, 5, 5, 1]));
  assert.ok(solve([8, 8, 3, 3]));
});

test('找到的表达式确实等于 24，且每个数字只用一次', () => {
  const puzzles = [
    [3, 3, 8, 8],
    [5, 5, 5, 1],
    [1, 3, 4, 6],
    [2, 7, 8, 9],
    [4, 4, 10, 10],
    [13, 12, 11, 10],
  ];
  for (const nums of puzzles) {
    const expr = solve(nums);
    assert.ok(expr, `无解：${nums.join(',')}`);
    assert.ok(Math.abs(evaluate(expr) - 24) < 1e-9, `${expr} != 24`);
    assert.deepEqual(numbersIn(expr), [...nums].sort((a, b) => a - b));
  }
});

test('限制运算符：5 5 5 1 必须用到除法', () => {
  assert.equal(solve([5, 5, 5, 1], ['+', '-', '×']), null);
  assert.ok(solve([5, 5, 5, 1], ['+', '-', '×', '÷']));
});

test('简单模式的约束：不用除法、中间结果不为负', () => {
  assert.equal(solve([1, 1, 1, 1], ['+', '-', '×'], { noNegative: true }), null);
  const expr = solve([6, 6, 6, 6], ['+', '-', '×'], { noNegative: true });
  assert.ok(expr);
  assert.equal(evaluate(expr), 24);
});

for (const level of Object.keys(LEVELS)) {
  test(`生成 ${LEVELS[level].name} 难度题目：数字范围、有解、表达式正确`, () => {
    for (let i = 0; i < 40; i++) {
      const { nums, solution } = generatePuzzle(level);
      assert.equal(nums.length, 4);
      for (const n of nums) {
        assert.ok(
          Number.isInteger(n) && n >= LEVELS[level].min && n <= LEVELS[level].max,
          `${level} 数字超范围：${n}`
        );
      }
      assert.ok(Math.abs(evaluate(solution) - 24) < 1e-9, `${solution} != 24`);
      assert.deepEqual(numbersIn(solution), [...nums].sort((a, b) => a - b));

      if (level === 'easy') {
        assert.ok(!solution.includes('÷'), '简单难度不应出现除法');
        assert.ok(solve(nums, LEVELS.easy.ops, { noNegative: true }), '简单题应有非负解法');
      }
    }
  });
}
