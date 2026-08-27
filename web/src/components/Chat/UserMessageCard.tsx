interface UserMessageCardProps {
  content: string;
}

export default function UserMessageCard({ content }: UserMessageCardProps) {
  return (
    <div className="flex justify-end w-full" style={{ marginBottom: 40 }}>
      <div
        className="whitespace-pre-wrap"
        style={{
          maxWidth: '70%',
          padding: '12px 16px',
          background: '#F9F5FF',
          border: '1px solid #EFE6FF',
          color: '#252931',
          lineHeight: 1.75,
          borderRadius: 8,
          fontSize: 14,
        }}
      >
        {content}
      </div>
    </div>
  );
}
