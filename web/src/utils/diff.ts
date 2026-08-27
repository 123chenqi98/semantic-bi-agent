// 纯 TS 实现的轻量 Diff 工具（无第三方依赖）
// - computeLineDiff:      行级 LCS (最长公共子序列)，生成左右配对行 diff ops
// - computeWordDiff:     两行/两字符串做 token/字符级 LCS，生成 inline diff ops
// - SQL Token 化:        把 SQL 关键字/字符串/标识符/数字拆成 token

export type DiffOp = 'equal' | 'insert' | 'delete' | 'replace-l' | 'replace-r' | 'empty';

export interface LineDiffRow {
  op: DiffOp;
  left?: string;
  right?: string;
  leftLineNo?: number;
  rightLineNo?: number;
  // 如果是 replace-l/r，保存对应的另一侧 token diff（用于内联高亮）
  pairDiff?: InlineDiffOp[];
}

export interface InlineDiffOp {
  op: 'equal' | 'delete' | 'insert';
  text: string;
}

// ==================== 1. 行级 LCS Diff ====================

export function computeLineDiff(leftRaw: string, rightRaw: string): LineDiffRow[] {
  const A = normalizeLines(leftRaw);
  const B = normalizeLines(rightRaw);
  const ops = lcsDiff(A, B);
  const rows: LineDiffRow[] = [];
  let i = 0, j = 0;
  let leftLn = 1, rightLn = 1;
  while (i < ops.length) {
    const op = ops[i];
    if (op === 'equal') {
      rows.push({
        op: 'equal', left: A[i], right: B[j],
        leftLineNo: leftLn++, rightLineNo: rightLn++,
      });
      i++; j++;
    } else if (op === 'delete') {
      // 尝试匹配后面是否有 insert → 合并为 replace 对
      const deletes: string[] = [A[i]];
      const delsStart = i;
      i++;
      while (i < ops.length && ops[i] === 'delete') { deletes.push(A[i]); i++; }
      const inserts: string[] = [];
      while (i < ops.length && ops[i] === 'insert') { inserts.push(B[i - deletes.length + inserts.length]); i++; }
      if (inserts.length > 0) {
        // replace 配对：1:1 / N:M 展开成多对
        const n = Math.max(deletes.length, inserts.length);
        const delLn0 = leftLn;
        const insLn0 = rightLn;
        for (let k = 0; k < n; k++) {
          const d = deletes[k];
          const r = inserts[k];
          // 取对应的 1:1 做 word-level diff（如果两边都存在）
          let pairDiff: InlineDiffOp[] | undefined;
          if (d !== undefined && r !== undefined) pairDiff = computeWordDiff(d, r);
          if (d !== undefined) {
            rows.push({
              op: 'replace-l', left: d, leftLineNo: leftLn++,
              pairDiff: pairDiff?.filter(p => p.op === 'delete' || p.op === 'equal'),
            });
          } else {
            rows.push({ op: 'empty', rightLineNo: undefined });
          }
          if (r !== undefined) {
            rows.push({
              op: 'replace-r', right: r, rightLineNo: rightLn++,
              pairDiff: pairDiff?.filter(p => p.op === 'insert' || p.op === 'equal'),
            });
          }
          // 用 unused (keep TS unused-vars 警告安全)
          void delsStart; void delLn0; void insLn0;
        }
      } else {
        for (const d of deletes) {
          rows.push({ op: 'delete', left: d, leftLineNo: leftLn++ });
        }
      }
    } else if (op === 'insert') {
      // 前面的 delete 已处理了 delete+insert 配对的情况；这里只剩下纯 insert
      const inserts: string[] = [B[j]];
      i++; j++;
      while (i < ops.length && ops[i] === 'insert') { inserts.push(B[j]); i++; j++; }
      for (const r of inserts) {
        rows.push({ op: 'insert', right: r, rightLineNo: rightLn++ });
      }
    } else {
      // 理论不会到这里
      i++;
    }
  }
  return rows;
}

function normalizeLines(s: string | undefined | null): string[] {
  if (!s) return [];
  return s.replace(/\r\n/g, '\n').replace(/\s+$/g, '').split('\n');
}

// 返回 LCS 基础上的操作序列：位置对齐，长度 = len(A)+len(B) 没那么大；
// 经典简化：在 DP 回溯上生成 ops（与输入行长度一致时可）
// 我们输出一个与 (A,B) 对应的扁平 diffOp 序列按"处理顺序"逐个返回：
//   i 对应 A[i] / j 对应 B[j]
function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length;
  // 正常化空格做对比：行两端空白不敏感，行内多空格压缩
  const normA = a.map(normLine);
  const normB = b.map(normLine);
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (normA[i] === normB[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  // ops 与遍历顺序同步：每个操作对应 A[i] 或 B[j] 中的"一个元素处理结果"
  // 但数组没法对 1:1 混合，我们按 "i + j" 索引展开为 flat：
  //   如果 equal → push 'equal' 表示 A[i]==B[j]
  //   如果 delete → push 'delete' 表示删除 A[i]
  //   如果 insert → push 'insert' 表示插入 B[j]
  // 长度最大为 n+m。注意 computeLineDiff 上面读取时按这个逻辑：op[k]=equal 同时消费 i,j
  while (i < n && j < m) {
    if (normA[i] === normB[j]) { ops.push('equal'); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push('delete'); i++; }
    else { ops.push('insert'); j++; }
  }
  while (i < n) { ops.push('delete'); i++; }
  while (j < m) { ops.push('insert'); j++; }
  return ops;
}

function normLine(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

// ==================== 2. 行内/字符级 Diff ====================

export function computeWordDiff(a: string, b: string): InlineDiffOp[] {
  // Step 1: 粗粒度 Token 切分（SQL 关键字/标识符/字符串/数字/标点/空白）
  const ta = tokenize(a || '');
  const tb = tokenize(b || '');
  const ops: InlineDiffOp[] = [];
  const dp: number[][] = Array.from({ length: ta.length + 1 }, () => new Array(tb.length + 1).fill(0));
  for (let i = ta.length - 1; i >= 0; i--) {
    for (let j = tb.length - 1; j >= 0; j--) {
      if (ta[i] === tb[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0, j = 0;
  const push = (op: InlineDiffOp['op'], txt: string) => {
    if (!txt) return;
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += txt;
    else ops.push({ op, text: txt });
  };
  while (i < ta.length && j < tb.length) {
    if (ta[i] === tb[j]) { push('equal', ta[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('delete', ta[i]); i++; }
    else { push('insert', tb[j]); j++; }
  }
  while (i < ta.length) { push('delete', ta[i]); i++; }
  while (j < tb.length) { push('insert', tb[j]); j++; }
  return ops;
}

// SQL Token 切分：关键字/标识符/字符串/数字/操作符/空白。切分只用于 diff 对齐，不做语法正确性。
function tokenize(s: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // 空白
    if (c === ' ' || c === '\t') {
      let j = i;
      while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++;
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }
    // 单引号字符串
    if (c === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "'" && s[j + 1] === "'") { j += 2; continue; }
        if (s[j] === "'") { j++; break; }
        j++;
      }
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }
    // 标识符/关键字 (a-zA-Z_)
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }
    // 数字
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }
    // 双字符运算符
    const two = s.substr(i, 2);
    if (two === '>=' || two === '<=' || two === '<>' || two === '!=' || two === '||' || two === '::') {
      tokens.push(two); i += 2; continue;
    }
    // 单字符
    tokens.push(c);
    i++;
  }
  return tokens;
}

// 统计差异摘要
export function summarizeDiff(rows: LineDiffRow[]) {
  let inserts = 0, deletes = 0, replaces = 0, equals = 0;
  for (const r of rows) {
    if (r.op === 'equal') equals++;
    else if (r.op === 'insert') inserts++;
    else if (r.op === 'delete') deletes++;
    else if (r.op === 'replace-l' || r.op === 'replace-r') replaces++;
  }
  // replace-l 和 replace-r 是成对出现的，除以 2
  replaces = Math.floor(replaces / 2);
  return { inserts, deletes, replaces, equals, totalOps: inserts + deletes + replaces };
}
