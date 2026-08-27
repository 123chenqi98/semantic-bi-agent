import type { QueryResult } from '../../types';

interface ResultTableProps {
  result: QueryResult;
  title?: string;
}

const NUMERIC_KEYS = /(amount|cnt|count|num|rate|pct|ratio|share|sales|order_count|customer_count|repurchase|price|total|sum|avg|max|min|额|量|数|率|占比|金额|订单量|新客)/i;

function isNumericColumn(col: string): boolean {
  return NUMERIC_KEYS.test(col);
}

export default function ResultTable({ result, title }: ResultTableProps) {
  const formatValue = (v: string | number | null): React.ReactNode => {
    if (v === null || v === undefined) return <span style={{ color: '#B0B5BD' }}>—</span>;
    if (typeof v === 'number') {
      const formatted = Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{formatted}</span>;
    }
    return String(v);
  };

  return (
    <div
      className="overflow-hidden bg-white"
      style={{ margin: '16px 0', border: '1px solid #F1F2F3', borderRadius: 4 }}
    >
      {title && (
        <div
          className="flex items-center justify-between"
          style={{
            padding: '10px 16px',
            background: '#FBFCFD',
            borderBottom: '1px solid #F1F2F3',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: '#252931' }}>{title}</span>
          <span style={{ fontSize: 12, color: '#898B8F', fontVariantNumeric: 'tabular-nums' }}>
            {result.rowCount} 行 · {(result.executionTimeMs || 0)}ms
          </span>
        </div>
      )}
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 360 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#FBFCFD' }}>
              {result.columns.map((col, i) => {
                const num = isNumericColumn(col);
                return (
                  <th
                    key={i}
                    style={{
                      padding: '10px 16px',
                      color: '#898B8F',
                      borderBottom: '1px solid #F1F2F3',
                      whiteSpace: 'nowrap',
                      fontSize: 12,
                      fontWeight: 500,
                      textAlign: num ? 'right' : 'left',
                    }}
                  >
                    {col}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr
                key={i}
                style={{ borderBottom: i < result.rows.length - 1 ? '1px solid #F1F2F3' : 'none' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#FAFBFC')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                {row.map((cell, j) => {
                  const num = isNumericColumn(result.columns[j]);
                  return (
                    <td
                      key={j}
                      style={{
                        padding: '10px 16px',
                        color: '#252931',
                        whiteSpace: 'nowrap',
                        textAlign: num ? 'right' : 'left',
                      }}
                    >
                      {formatValue(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
