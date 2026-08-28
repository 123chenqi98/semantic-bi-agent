import { useMemo, useState, type ReactNode, type ReactElement } from 'react';
import { GitCompare, ChevronDown, ChevronRight, Minus, Plus, ArrowRightLeft } from 'lucide-react';
import {
  computeLineDiff, summarizeDiff, type LineDiffRow, type InlineDiffOp,
} from '../../utils/diff';

interface SQLDiffProps {
  baselineSql: string;
  optimizedSql: string;
  title?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}

const GLOBAL_STYLES = `
.sv-sql {
  white-space: pre;
  font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.7;
  tab-size: 2;
  letter-spacing: 0;
}
.sv-gutter {
  user-select: none;
  color: #B0B5BD;
  font-size: 11px;
  background: #FAFBFC;
  border-right: 1px solid #F1F2F3;
  text-align: right;
  font-family: var(--font-mono);
  padding: 0 8px;
}
.sv-bg-equal { background: transparent; }
.sv-bg-del { background: #FFF1F0; }
.sv-bg-ins { background: #F0FDF4; }
.sv-bg-repL { background: #FFF5EE; }
.sv-bg-repR { background: #F2FBF4; }
.sv-ch-del { background: #FECACA; color: #991B1B; border-radius: 3px; padding: 0 2px; }
.sv-ch-ins { background: #BBF7D0; color: #14532D; border-radius: 3px; padding: 0 2px; }
.sv-ch-eq  { color: inherit; }
.sv-kw  { color: #6D39C7; font-weight: 500; }
.sv-str { color: #047857; }
.sv-num { color: #B45309; }
.sv-fn  { color: #B758ED; }
.sv-com { color: #898B8F; font-style: italic; }
`;

const SQL_KEYWORDS = new Set((
  'SELECT,FROM,WHERE,GROUP BY,ORDER BY,LEFT JOIN,INNER JOIN,RIGHT JOIN,FULL JOIN,OUTER JOIN,JOIN,ON,AS,' +
  'AND,OR,NOT,NULL,IS,BETWEEN,IN,LIKE,ILIKE,DISTINCT,CASE,WHEN,THEN,ELSE,END,UNION,ALL,EXISTS,HAVING,' +
  'LIMIT,OFFSET,ASC,DESC,INSERT,INTO,VALUES,UPDATE,SET,DELETE,WITH,RECURSIVE,WINDOW,OVER,PARTITION,ROWS,' +
  'RANGE,UNBOUNDED,PRECEDING,FOLLOWING,CURRENT ROW,FILTER,CAST,COALESCE,NULLIF,TRUE,FALSE,DATE,DATETIME,' +
  'STRFTIME,DATE_TRUNC,ROUND,SUM,COUNT,AVG,MAX,MIN,SQRT,ABS,LAG,LEAD,FIRST_VALUE,LAST_VALUE,RANK,DENSE_RANK,' +
  'ROW_NUMBER,USING,RETURNING'
).split(','));

const SQL_FUNCS = new Set([
  'SUM','COUNT','AVG','MAX','MIN','ROUND','COALESCE','NULLIF','CAST','STRFTIME',
  'DATE','DATETIME','LAG','LEAD','RANK','ROW_NUMBER','DENSE_RANK','FIRST_VALUE','LAST_VALUE',
  'SQRT','ABS','IFNULL','MINUS','DATE_TRUNC',
]);

/** 纯字符串级正则 SQL 语法上色，不做 parse，快速轻量 */
function syntaxHighlightTokens(s: string, ops: InlineDiffOp[] | undefined, side: 'L' | 'R'): ReactNode {
  void side;
  // 优先用 diff ops：equal 段做语法高亮，delete/insert 用 diff 色+再叠加语法
  if (ops && ops.length > 0) {
    return ops.map((op, i) => (
      <span key={i} className={op.op === 'delete' ? 'sv-ch-del' : op.op === 'insert' ? 'sv-ch-ins' : 'sv-ch-eq'}>
        {syntaxHighlightString(op.text)}
      </span>
    ));
  }
  return syntaxHighlightString(s);
}

function syntaxHighlightString(s: string): ReactNode {
  const out: ReactElement[] = [];
  const re = /--[^\n]*|'[^']*(?:''[^']*)*'|"[^"]*"|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*(?=\s*\()|[A-Za-z_][A-Za-z0-9_]*|[\s\S]/g;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(s)) !== null) {
    const t = m[0];
    if (/^--/.test(t)) out.push(<span key={key++} className="sv-com">{t}</span>);
    else if (/^['"]/.test(t)) out.push(<span key={key++} className="sv-str">{t}</span>);
    else if (/^[\d.]+$/.test(t)) out.push(<span key={key++} className="sv-num">{t}</span>);
    else if (t.length > 1 && SQL_FUNCS.has(t.toUpperCase()) || SQL_FUNCS.has(t))
      out.push(<span key={key++} className="sv-fn">{t}</span>);
    else if (SQL_KEYWORDS.has(t.toUpperCase()) || SQL_KEYWORDS.has(t))
      out.push(<span key={key++} className="sv-kw">{t}</span>);
    else if (/\s/.test(t) && t.length > 0) out.push(<span key={key++}>{t}</span>);
    else out.push(<span key={key++} style={{ color: '#252931' }}>{t}</span>);
  }
  return out;
}

export default function SQLDiff({ baselineSql, optimizedSql, title, compact, defaultOpen }: SQLDiffProps) {
  const rows: LineDiffRow[] = useMemo(
    () => computeLineDiff(baselineSql || '', optimizedSql || ''),
    [baselineSql, optimizedSql],
  );
  const stat = useMemo(() => summarizeDiff(rows), [rows]);
  const [open, setOpen] = useState(defaultOpen ?? true);

  const hasDiff = stat.totalOps > 0;
  const headerTitle = title ?? '基线 vs 语义优化 SQL 差异对比';

  return (
    <div
      className="w-full"
      style={{
        border: '1px solid #ECEDF1',
        borderRadius: 4,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      <div
        className="flex items-center justify-between w-full"
        style={{ padding: compact ? '8px 12px' : '12px 16px', background: '#FBFCFD', borderBottom: '1px solid #F1F2F3' }}
      >
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 text-left"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <GitCompare size={14} style={{ color: '#B758ED' }} />
          <span style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 500, color: '#252931' }}>{headerTitle}</span>
          {hasDiff ? (
            <div className="flex items-center gap-1.5">
              {stat.deletes > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px]"
                  style={{ padding: '2px 7px', borderRadius: 999, background: '#FEE2E2', color: '#991B1B' }}>
                  <Minus size={10} />{stat.deletes + stat.replaces}
                </span>
              )}
              {stat.inserts > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px]"
                  style={{ padding: '2px 7px', borderRadius: 999, background: '#DCFCE7', color: '#14532D' }}>
                  <Plus size={10} />{stat.inserts + stat.replaces}
                </span>
              )}
              {stat.replaces > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px]"
                  style={{ padding: '2px 7px', borderRadius: 999, background: '#FFE8D6', color: '#9A3412' }}>
                  <ArrowRightLeft size={10} />{stat.replaces} 处修改
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px]" style={{ padding: '2px 7px', borderRadius: 999, background: '#F1F2F3', color: '#565960' }}>
              完全一致
            </span>
          )}
        </button>
        {open ? (
          <ChevronDown size={14} style={{ color: '#898B8F' }} />
        ) : (
          <ChevronRight size={14} style={{ color: '#898B8F' }} />
        )}
      </div>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'minmax(0,1fr) 1px minmax(0,1fr)', minWidth: 640 }}
          >
            {/* 左栏表头 */}
            <div className="flex items-center gap-2" style={{ padding: '8px 12px', background: '#FDF2F2', borderBottom: '1px solid #F1F2F3' }}>
              <span className="w-1.5 h-1.5 rounded-sm" style={{ background: '#EF4444' }} />
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#991B1B' }}>基线 SQL</span>
              <span className="text-[11px]" style={{ color: '#898B8F', marginLeft: 'auto' }}>对照组 · 纯 DDL Prompt</span>
            </div>
            <div style={{ borderBottom: '1px solid #F1F2F3' }} />
            <div className="flex items-center gap-2" style={{ padding: '8px 12px', background: '#F1FBF3', borderBottom: '1px solid #F1F2F3' }}>
              <span className="w-1.5 h-1.5 rounded-sm" style={{ background: '#22C55E' }} />
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#14532D' }}>语义层优化 SQL</span>
              <span className="text-[11px]" style={{ color: '#898B8F', marginLeft: 'auto' }}>实验组 · 注入语义约束</span>
            </div>

            {rows.map((r, idx) => (
              <DiffRowView key={idx} row={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DiffRowView({ row }: { row: LineDiffRow }) {
  // 每一行：左 gutter + code | 中 gutter 20px | 右 gutter + code
  const rowClass = (() => {
    switch (row.op) {
      case 'equal': return 'sv-bg-equal';
      case 'delete': return 'sv-bg-del';
      case 'insert': return 'sv-bg-ins';
      case 'replace-l': return 'sv-bg-repL';
      case 'replace-r': return 'sv-bg-repR';
      case 'empty': return 'sv-bg-equal';
    }
  })();
  const prefixIcon = (() => {
    switch (row.op) {
      case 'delete': return <Minus size={12} style={{ color: '#EF4444', flexShrink: 0 }} />;
      case 'insert': return <Plus size={12} style={{ color: '#22C55E', flexShrink: 0 }} />;
      case 'replace-l': return <span style={{ width: 12, color: '#EA580C', fontWeight: 700, fontSize: 11, lineHeight: 1, textAlign: 'center' }}>−</span>;
      case 'replace-r': return <span style={{ width: 12, color: '#16A34A', fontWeight: 700, fontSize: 11, lineHeight: 1, textAlign: 'center' }}>+</span>;
      default: return <span style={{ width: 12, display: 'inline-block' }} />;
    }
  })();

  const leftHas = row.left !== undefined;
  const rightHas = row.right !== undefined;

  const renderLeft = (
    <div className={`flex items-stretch ${rowClass}`} style={{ borderBottom: '1px solid #F8F9FB', minHeight: 24, overflow: 'hidden', minWidth: 0 }}>
      <div className="flex items-center justify-center" style={{ width: 20, flexShrink: 0, color: '#B0B5BD' }}>
        {row.op !== 'insert' && row.op !== 'replace-r' ? prefixIcon : <span style={{ width: 12 }} />}
      </div>
      <div className="sv-gutter" style={{ width: 40, flexShrink: 0 }}>
        {row.leftLineNo !== undefined ? row.leftLineNo : ''}
      </div>
      <div className="sv-sql" style={{ flex: 1, minWidth: 0, padding: '0 12px', overflow: 'hidden' }}>
        {leftHas
          ? syntaxHighlightTokens(row.left ?? '', row.op === 'replace-l' ? row.pairDiff : undefined, 'L')
          : '\u00a0'}
      </div>
    </div>
  );

  const renderMiddle = (
    <div style={{
      borderLeft: '1px solid #F1F2F3',
      width: 1, flexShrink: 0,
      background: '#F1F2F3',
      borderBottom: '1px solid #F8F9FB',
    }} />
  );

  const renderRight = (
    <div className={`flex items-stretch ${rowClass}`} style={{ borderBottom: '1px solid #F8F9FB', minHeight: 24, overflow: 'hidden', minWidth: 0 }}>
      <div className="flex items-center justify-center" style={{ width: 20, flexShrink: 0, color: '#B0B5BD' }}>
        {row.op !== 'delete' && row.op !== 'replace-l' ? (row.op === 'equal' ? <span style={{ width: 12 }} /> : prefixIcon) : <span style={{ width: 12 }} />}
      </div>
      <div className="sv-gutter" style={{ width: 40, flexShrink: 0 }}>
        {row.rightLineNo !== undefined ? row.rightLineNo : ''}
      </div>
      <div className="sv-sql" style={{ flex: 1, minWidth: 0, padding: '0 12px', overflow: 'hidden' }}>
        {rightHas
          ? syntaxHighlightTokens(row.right ?? '', row.op === 'replace-r' ? row.pairDiff : undefined, 'R')
          : '\u00a0'}
      </div>
    </div>
  );

  const emptyCell = (
    <div style={{ borderBottom: '1px solid #F8F9FB', minHeight: 24, background: 'transparent' }} />
  );

  const showLeft = row.op === 'equal' || row.op === 'replace-l' || row.op === 'delete' || row.op === 'empty';
  const showRight = row.op === 'equal' || row.op === 'replace-r' || row.op === 'insert' || row.op === 'empty';

  return (
    <>
      {showLeft ? (leftHas ? renderLeft : emptyCell) : emptyCell}
      {renderMiddle}
      {showRight ? (rightHas ? renderRight : emptyCell) : emptyCell}
    </>
  );
}
