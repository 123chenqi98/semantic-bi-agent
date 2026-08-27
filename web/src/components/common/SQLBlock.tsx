import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface SQLBlockProps {
  sql: string;
  label?: string;
  variant?: 'experiment' | 'baseline';
  defaultOpen?: boolean;
}

const KEYWORDS = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|AS|DISTINCT|CASE|WHEN|THEN|ELSE|END|WITH|UNION|ALL|EXISTS|HAVING|OVER|PARTITION)\b/g;
const FUNCTIONS = /\b(COUNT|SUM|AVG|MIN|MAX|ROUND|strftime|date|NULLIF|COALESCE|CAST|CONCAT|SUBSTR|TRIM|UPPER|LOWER|LENGTH)\b/g;

function highlightSQL(sql: string): React.ReactNode[] {
  const lines = sql.split('\n');

  return lines.map((line, lineIdx) => {
    const parts: React.ReactNode[] = [];
    const commentMatch = line.match(/--.*$/);
    let beforeComment = line;
    let comment = '';
    if (commentMatch && commentMatch.index !== undefined) {
      beforeComment = line.substring(0, commentMatch.index);
      comment = commentMatch[0];
    }

    const processText = (text: string, startKey: string): React.ReactNode[] => {
      const result: React.ReactNode[] = [];
      let remaining = text;
      let idx = 0;

      while (remaining.length > 0) {
        let earliestMatch = -1;
        let matchType: 'string' | 'keyword' | 'function' | null = null;
        let matchLen = 0;
        let matchText = '';

        const sSingle = remaining.match(/'[^']*'/);
        const sDouble = remaining.match(/"[^"]*"/);
        if (sSingle && (earliestMatch === -1 || (sSingle.index !== undefined && sSingle.index < earliestMatch))) {
          earliestMatch = sSingle.index ?? -1; matchType = 'string'; matchLen = sSingle[0].length; matchText = sSingle[0];
        }
        if (sDouble && (earliestMatch === -1 || (sDouble.index !== undefined && sDouble.index < earliestMatch))) {
          earliestMatch = sDouble.index ?? -1; matchType = 'string'; matchLen = sDouble[0].length; matchText = sDouble[0];
        }
        const kwIdx = remaining.search(KEYWORDS);
        if (kwIdx !== -1 && (earliestMatch === -1 || kwIdx < earliestMatch)) {
          const kw = remaining.match(KEYWORDS);
          if (kw) { earliestMatch = kwIdx; matchType = 'keyword'; matchLen = kw[0].length; matchText = kw[0]; }
        }
        const fnIdx = remaining.search(FUNCTIONS);
        if (fnIdx !== -1 && (earliestMatch === -1 || fnIdx < earliestMatch)) {
          const fn = remaining.match(FUNCTIONS);
          if (fn) {
            const isDup = matchType === 'keyword' && fnIdx === earliestMatch;
            if (!isDup || fn[0].length > matchLen) {
              earliestMatch = fnIdx; matchType = 'function'; matchLen = fn[0].length; matchText = fn[0];
            }
          }
        }

        if (earliestMatch === -1 || !matchType) {
          result.push(<span key={`${startKey}-${idx}`} style={{ color: '#252931' }}>{remaining}</span>);
          break;
        }
        if (earliestMatch > 0) {
          result.push(<span key={`${startKey}-${idx}`} style={{ color: '#252931' }}>{remaining.substring(0, earliestMatch)}</span>);
          idx++;
        }
        if (matchType === 'string') {
          result.push(<span key={`${startKey}-${idx}`} style={{ color: '#00A84E' }}>{matchText}</span>);
        } else if (matchType === 'keyword') {
          result.push(<span key={`${startKey}-${idx}`} style={{ color: '#1E6FFF', fontWeight: 500 }}>{matchText}</span>);
        } else {
          result.push(<span key={`${startKey}-${idx}`} style={{ color: '#FF7D00' }}>{matchText}</span>);
        }
        idx++;
        remaining = remaining.substring(earliestMatch + matchLen);
      }
      return result;
    };

    parts.push(...processText(beforeComment, `${lineIdx}`));
    if (comment) {
      parts.push(<span key={`${lineIdx}-c`} style={{ color: '#898B8F', fontStyle: 'italic' }}>{comment}</span>);
    }

    return (
      <div key={lineIdx} style={{ display: 'flex', lineHeight: 1.7 }}>
        <span
          className="select-none text-right shrink-0"
          style={{ width: 40, paddingRight: 16, color: '#C9CDD4', fontSize: 12, userSelect: 'none' }}
        >{lineIdx + 1}</span>
        <code style={{ fontSize: 13, fontFamily: 'var(--font-mono)', whiteSpace: 'pre' }}>{parts}</code>
      </div>
    );
  });
}

export default function SQLBlock({ sql, label, variant = 'experiment', defaultOpen = false }: SQLBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(defaultOpen);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isBaseline = variant === 'baseline';
  const firstLine = sql.split('\n')[0];
  const truncated = sql.split('\n').length > 1;

  return (
    <div
      className="overflow-hidden bg-white"
      style={{ margin: '16px 0', border: '1px solid #F1F2F3', borderRadius: 4 }}
    >
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        style={{
          padding: '10px 16px',
          background: '#FBFCFD',
          borderBottom: expanded ? '1px solid #F1F2F3' : 'none',
          transition: 'background .15s',
        }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FBFCFD'; }}
      >
        <div className="flex items-center" style={{ gap: 10 }}>
          {expanded
            ? <ChevronDown size={14} style={{ color: '#B758ED' }} />
            : <ChevronRight size={14} style={{ color: '#898B8F' }} />}
          <span
            style={{
              fontSize: 12, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
              background: '#F5F6F8', color: '#565960', lineHeight: 1,
            }}
          >SQL</span>
          {!expanded && truncated && (
            <span style={{ fontSize: 12, color: '#898B8F', fontFamily: 'var(--font-mono)', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {firstLine}...
            </span>
          )}
          {label && (
            <span style={{ fontSize: 12, fontWeight: 500, color: isBaseline ? '#F53F3F' : '#B758ED' }}>
              {isBaseline ? '基线 SQL' : '优化后 SQL'}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center text-[12px] outline-none"
          style={{ padding: '5px 10px', color: '#565960', borderRadius: 4, gap: 4, transition: 'background .15s' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#F5F6F8')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
        >
          {copied ? <Check size={13} style={{ color: '#00B42A' }} /> : <Copy size={13} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {expanded && (
        <div className="overflow-x-auto" style={{ padding: '16px 20px', background: '#FFFFFF' }}>
          {highlightSQL(sql)}
        </div>
      )}
    </div>
  );
}
